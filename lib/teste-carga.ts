// Controle do prazo de Teste de Carga: um novo teste a cada 90 dias contados
// a partir do ÚLTIMO teste (não do tempo disponível), e só dá pra testar a
// máquina que está no pátio (status DISPONIVEL). A data do último teste vem do
// CSV "testes_carga_csv", que cada OS de Teste de Carga finalizada alimenta.
import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { normalizeCode } from "@/lib/horimetro";
import { sendPushToUser } from "@/lib/push";

export const LOAD_TEST_INTERVAL_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type LoadTestStatus = "EM_DIA" | "TESTAR_AGORA" | "EM_ANDAMENTO" | "AGUARDANDO_RETORNO" | "NAO_APLICA";

// Teste de carga só vale pra geradores (código começando com GE).
export function requiresLoadTest(equipmentNumber: string): boolean {
  return /^GE(?![A-Z])/.test(normalizeCode(equipmentNumber));
}

export type LoadTestInfo = {
  status: LoadTestStatus;
  lastDate: string | null; // yyyy-mm-dd (dia puro, sem fuso)
  daysSince: number | null; // null = nunca testado
  openOrderNumber: number | null;
};

// OS de Teste de Carga ainda não concluídas (o teste está sendo providenciado).
const OPEN_STATUSES = [
  "PENDENTE_APROVACAO",
  "APROVADA",
  "EM_EXECUCAO",
  "PAUSADA",
  "AGUARDANDO_ENCERRAMENTO",
] as const;

function parseDateBR(s: string | undefined): Date | null {
  const m = (s ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d;
}

function todayUTC(now: Date): number {
  // O dia "de hoje" em Brasília (UTC-3, sem horário de verão), como meia-noite UTC.
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  return Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate());
}

// Último teste de cada equipamento (código normalizado -> data).
export async function getLastLoadTestDates(): Promise<Map<string, Date>> {
  const row = await prisma.dataStore.findUnique({ where: { key: "testes_carga_csv" } });
  const out = new Map<string, Date>();
  if (!row?.content) return out;
  const parsed = Papa.parse<Record<string, string>>(row.content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  for (const r of parsed.data ?? []) {
    const code = normalizeCode(r["Equipamento"]);
    const date = parseDateBR(r["Data"]);
    if (!code || !date) continue;
    const prev = out.get(code);
    if (!prev || date > prev) out.set(code, date);
  }
  return out;
}

// equipmentId -> número da OS de Teste de Carga ainda aberta.
export async function getOpenLoadTestOrders(): Promise<Map<string, number>> {
  const orders = await prisma.workOrder.findMany({
    where: {
      scope: "TESTE_CARGA",
      status: { in: [...OPEN_STATUSES] },
      deletedAt: null,
      equipmentId: { not: null },
    },
    select: { equipmentId: true, orderNumber: true },
    orderBy: { orderNumber: "asc" },
  });
  const out = new Map<string, number>();
  for (const o of orders) if (o.equipmentId) out.set(o.equipmentId, o.orderNumber);
  return out;
}

export function classifyLoadTest(args: {
  equipmentNumber: string;
  lastTest: Date | null;
  leaseStatus: string;
  openOrderNumber: number | null;
  now?: Date;
}): LoadTestInfo {
  const now = args.now ?? new Date();
  const lastDate = args.lastTest ? args.lastTest.toISOString().slice(0, 10) : null;
  const daysSince = args.lastTest ? Math.floor((todayUTC(now) - args.lastTest.getTime()) / DAY_MS) : null;
  const base = { lastDate, daysSince, openOrderNumber: args.openOrderNumber };

  if (!requiresLoadTest(args.equipmentNumber)) return { status: "NAO_APLICA", ...base };
  const overdue = daysSince === null || daysSince > LOAD_TEST_INTERVAL_DAYS;
  if (!overdue) return { status: "EM_DIA", ...base };
  if (args.leaseStatus !== "DISPONIVEL") return { status: "AGUARDANDO_RETORNO", ...base };
  if (args.openOrderNumber !== null) return { status: "EM_ANDAMENTO", ...base };
  return { status: "TESTAR_AGORA", ...base };
}

function agoLabel(daysSince: number | null): string {
  if (daysSince === null) return "nunca testado";
  if (daysSince < 60) return `último teste há ${daysSince} dias`;
  return `último teste há ${Math.floor(daysSince / 30)} meses`;
}

// Monta o aviso de "voltou ao pátio com teste vencido" (ou null se nenhum dos
// equipamentos precisa de teste agora).
export async function buildReturnedToYardAlert(
  equipmentIds: string[]
): Promise<{ numbers: string[]; payload: { title: string; body: string; url: string } } | null> {
  if (equipmentIds.length === 0) return null;
  const [equipments, lastDates, openOrders] = await Promise.all([
    prisma.equipment.findMany({
      where: { id: { in: equipmentIds }, leaseStatus: "DISPONIVEL" },
      select: { id: true, equipmentNumber: true, leaseStatus: true },
    }),
    getLastLoadTestDates(),
    getOpenLoadTestOrders(),
  ]);

  const due = equipments
    .map((e) => ({
      number: e.equipmentNumber,
      info: classifyLoadTest({
        equipmentNumber: e.equipmentNumber,
        lastTest: lastDates.get(normalizeCode(e.equipmentNumber)) ?? null,
        leaseStatus: e.leaseStatus,
        openOrderNumber: openOrders.get(e.id) ?? null,
      }),
    }))
    .filter((x) => x.info.status === "TESTAR_AGORA");
  if (due.length === 0) return null;

  const payload =
    due.length === 1
      ? {
          title: `${due[0].number} voltou ao pátio`,
          body: `Teste de carga vencido (${agoLabel(due[0].info.daysSince)}). Providencie o teste.`,
          url: "/horimetros",
        }
      : {
          title: `${due.length} equipamentos voltaram ao pátio com teste de carga vencido`,
          body: due.slice(0, 6).map((d) => d.number).join(", ") + (due.length > 6 ? ` e mais ${due.length - 6}` : ""),
          url: "/horimetros",
        };
  return { numbers: due.map((d) => d.number), payload };
}

// Avisa os gestores quando equipamentos voltam ao pátio (passam a DISPONIVEL)
// com o teste de carga vencido. Nunca lança erro — é só um aviso.
export async function notifyReturnedToYard(equipmentIds: string[]): Promise<void> {
  try {
    const alert = await buildReturnedToYardAlert(equipmentIds);
    if (!alert) return;
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    await Promise.all(admins.map((a) => sendPushToUser(a.id, alert.payload)));
  } catch (e) {
    console.error("[notifyReturnedToYard]", e);
  }
}
