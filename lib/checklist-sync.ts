// Sincroniza OS de escopo CHECKLIST / TESTE_CARGA, quando finalizadas, para
// os painéis de "Checklist" e "Testes de Carga" (que hoje são alimentados por
// CSV importado manualmente — isso só acrescenta uma linha ao final, sem
// remover ou alterar nada do que já existe).
import { prisma } from "@/lib/db";
import Papa from "papaparse";

const CHECKLIST_KEY = "checklist_csv";
const TESTE_CARGA_KEY = "testes_carga_csv";

const CHECKLIST_HEADER = [
  "Equipamento", "Horimetro", "Responsavel", "Data",
  "AmostraTanque", "FiltroCombustivel", "FiltroRacor1", "FiltroRacor2", "Observacao",
];
const TESTE_CARGA_HEADER = ["Equipamento", "Data", "Tensao_Vazio", "Frequencia_Vazio", "Amperagem", "Frequencia_Carga"];

// Traduz os códigos salvos na OS (BOA/RUIM/BOM/TROCADO/NAO_APLICA) para o
// mesmo texto usado nos painéis.
const FIELD_LABELS: Record<string, string> = {
  BOA: "Boa",
  RUIM: "Ruim",
  BOM: "Bom",
  TROCADO: "Trocado",
  NAO_APLICA: "Não se aplica",
};
function labelOf(v: string | null | undefined): string {
  if (!v) return "";
  return FIELD_LABELS[v] ?? v;
}

// dd/mm/aaaa em UTC — a data foi salva "pura" (meia-noite UTC a partir de um
// input type=date), então lemos em UTC pra não voltar um dia por fuso local.
function fmtDateUTC(d: Date | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getUTCFullYear()}`;
}

// Acrescenta uma linha ao CSV guardado em DataStore[key]. Usa o cabeçalho já
// existente no arquivo (se houver) para respeitar a ordem das colunas de
// quem importou manualmente antes; só cai no cabeçalho padrão se o arquivo
// ainda estiver vazio.
async function appendRow(key: string, defaultHeader: string[], row: Record<string, string>) {
  const current = await prisma.dataStore.findUnique({ where: { key } });
  // Normaliza quebras de linha pra "\n" — o CSV importado manualmente usa
  // CRLF, e o PapaParse (usado pra exibir o painel) embaralha a última linha
  // quando o arquivo mistura terminadores; salvar sempre em LF evita isso.
  const existing = (current?.content ?? "").replace(/\r\n?/g, "\n");
  const lines = existing.split("\n").filter((l) => l.length > 0);
  const header = lines.length > 0 ? lines[0].split(",").map((h) => h.trim()) : defaultHeader;
  const values = header.map((h) => row[h] ?? "");
  const line = Papa.unparse([values]).trim();
  const content = lines.length > 0 ? `${existing.replace(/\r?\n+$/, "")}\n${line}` : `${header.join(",")}\n${line}`;
  await prisma.dataStore.upsert({ where: { key }, update: { content }, create: { key, content } });
}

// Chamado quando uma OS de Checklist é finalizada (Encerrar Definitivamente).
export async function syncChecklistToPanel(orderId: string): Promise<void> {
  try {
    const order = await prisma.workOrder.findUnique({
      where: { id: orderId },
      include: {
        equipment: { select: { equipmentNumber: true } },
        technician: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
    });
    if (!order || order.scope !== "CHECKLIST") return;
    await appendRow(CHECKLIST_KEY, CHECKLIST_HEADER, {
      Equipamento: order.equipment?.equipmentNumber ?? "",
      Horimetro: order.horimeter != null ? String(order.horimeter) : "",
      Responsavel: order.technician?.name ?? order.createdBy?.name ?? "",
      Data: fmtDateUTC(order.checklistDate),
      AmostraTanque: labelOf(order.tankSample),
      FiltroCombustivel: labelOf(order.checkFuelFilter1),
      FiltroRacor1: labelOf(order.checkFuelFilter2),
      FiltroRacor2: labelOf(order.checkFuelFilter3),
      Observacao: order.comments ?? "",
    });
  } catch (e) {
    console.error("[syncChecklistToPanel]", e);
  }
}

// Chamado quando uma OS de Teste de Carga é finalizada.
export async function syncTesteCargaToPanel(orderId: string): Promise<void> {
  try {
    const order = await prisma.workOrder.findUnique({
      where: { id: orderId },
      include: { equipment: { select: { equipmentNumber: true } } },
    });
    if (!order || order.scope !== "TESTE_CARGA") return;
    await appendRow(TESTE_CARGA_KEY, TESTE_CARGA_HEADER, {
      Equipamento: order.equipment?.equipmentNumber ?? "",
      Data: fmtDateUTC(order.loadTestDate),
      Tensao_Vazio: order.voltageEmpty ?? "",
      Frequencia_Vazio: order.frequencyEmpty ?? "",
      Amperagem: order.load ?? "",
      Frequencia_Carga: order.frequencyLoad ?? "",
    });
  } catch (e) {
    console.error("[syncTesteCargaToPanel]", e);
  }
}
