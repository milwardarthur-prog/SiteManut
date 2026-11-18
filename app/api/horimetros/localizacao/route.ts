export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { normalizeCode } from "@/lib/horimetro";
import { syncPainelEquipamentos } from "@/lib/painel-sync";
import { RETURN_CONFERENCE_NOTE } from "@/lib/retorno-locacao";

// Identifica as colunas relevantes de forma tolerante a variações de cabeçalho.
// Suporta tanto o CSV simples (equipamento;cliente) quanto o "Mapa de Localização de
// Equipamentos" completo exportado do sistema de patrimônio, que traz todos os ativos
// da empresa (cabos, tanques, etc.) — não só geradores — com o código em "Patrimônio"
// e a categoria (ex.: "GERADOR ...") em "Equipamento".
function pickColumns(fields: string[]): {
  eqCol?: string;
  obraCol?: string;
  clientCol?: string;
  categoryCol?: string;
  statusCol?: string;
  addressCol?: string;
} {
  const norm = (s: string) => normalizeCode(s).toLowerCase();
  let patrimCol: string | undefined;
  let equipCol: string | undefined;
  let obraCol: string | undefined;
  let clientCol: string | undefined;
  let statusCol: string | undefined;
  let addressCol: string | undefined;
  for (const f of fields) {
    const n = norm(f);
    if (!patrimCol && n.includes("patrim")) patrimCol = f;
    if (!equipCol && (n.includes("equip") || n === "ge" || n.includes("codigo") || n.includes("código"))) equipCol = f;
    if (!obraCol && n.includes("obra")) obraCol = f;
    if (!clientCol && (n.includes("client") || n.includes("local"))) clientCol = f;
    if (!statusCol && n.includes("status")) statusCol = f;
    if (!addressCol && n.includes("endere")) addressCol = f;
  }
  // Quando existe uma coluna "Patrimônio" separada, ela é o código real do equipamento
  // e "Equipamento" vira apenas a categoria, usada para filtrar só os geradores.
  const eqCol = patrimCol ?? equipCol;
  const categoryCol = patrimCol && equipCol && equipCol !== patrimCol ? equipCol : undefined;
  return { eqCol, obraCol, clientCol, categoryCol, statusCol, addressCol };
}

type PreviewResult = {
  foundInFile: number;
  willLease: number;
  willAvailable: number;
  manualPreserved: number;
  manualIgnored: { equipmentNumber: string; client: string }[];
  willConference: string[];
  duplicates: string[];
  notInBase: string[];
  errorRows: { line: number; message: string }[];
  leaseList: { equipmentNumber: string; client: string; address: string | null }[];
};

async function buildPreview(csv: string): Promise<PreviewResult | { error: string }> {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const fields = parsed.meta?.fields ?? [];
  const { eqCol, obraCol, clientCol, categoryCol, statusCol, addressCol } = pickColumns(fields);
  if (!eqCol || (!obraCol && !clientCol)) {
    return {
      error:
        "Não foi possível identificar as colunas. O CSV deve ter uma coluna de equipamento (ou Patrimônio) e uma de cliente/obra.",
    };
  }

  // Base de equipamentos cadastrados: usada tanto pra filtrar o mapa de patrimônio
  // quanto pra conferir as locações no fim.
  const allEquip = await prisma.equipment.findMany({
    select: { equipmentNumber: true, leaseStatus: true, locationSource: true },
  });
  const baseSet = new Set(allEquip.map((e) => normalizeCode(e.equipmentNumber)));

  const rows = parsed.data ?? [];
  const errorRows: { line: number; message: string }[] = [];
  const seen = new Map<string, number>(); // code -> count
  const leaseMap = new Map<string, string>(); // code -> client
  const addressMap = new Map<string, string>(); // code -> endereço da obra (usado no mapa)

  rows.forEach((row, idx) => {
    const line = idx + 2; // +1 header +1 base-1

    // No mapa completo de patrimônio, a maioria das linhas não é equipamento
    // controlado aqui (cabos, bacias, jumpers...) — ignora silenciosamente essas
    // linhas. Vale a linha cuja categoria é gerador OU cujo código já está
    // cadastrado (ex.: motosoldador MTS, torre de iluminação TL).
    if (categoryCol) {
      const category = normalizeCode(row[categoryCol]).toLowerCase();
      const registered = baseSet.has(normalizeCode(row[eqCol!]));
      if (!category.includes("gerador") && !registered) return;
    }

    // Locações encerradas/inativas não contam como "atualmente locado".
    if (statusCol) {
      const st = normalizeCode(row[statusCol]).toLowerCase();
      if (st && st !== "ativo") return;
    }

    const rawCode = row[eqCol!];
    const rawClient = (clientCol ? row[clientCol] : "")?.trim() || (obraCol ? row[obraCol] : "")?.trim() || "";
    const code = normalizeCode(rawCode);
    const client = rawClient.trim();
    if (!code) {
      errorRows.push({ line, message: "Equipamento vazio" });
      return;
    }
    if (!client) {
      errorRows.push({ line, message: `Cliente vazio para ${code}` });
      return;
    }
    seen.set(code, (seen.get(code) ?? 0) + 1);
    leaseMap.set(code, client);
    const address = (addressCol ? row[addressCol] : "")?.trim();
    if (address) addressMap.set(code, address);
    else addressMap.delete(code);
  });

  const duplicates = Array.from(seen.entries())
    .filter(([, c]) => c > 1)
    .map(([code]) => code);

  // Confere quais códigos existem na base
  const notInBase = Array.from(leaseMap.keys()).filter((c) => !baseSet.has(c));

  // Locação manual e "em manutenção" são travas: o equipamento só sai delas
  // por ação manual. Um contrato no arquivo (ex.: evento no pátio do cliente,
  // que entra e sai) NÃO altera cliente nem status dessas máquinas — nem
  // quando o contrato aparece, nem quando encerra.
  const protectedCodes = new Set(
    allEquip
      .filter((e) => e.leaseStatus === "MANUTENCAO" || (e.locationSource === "MANUAL" && e.leaseStatus === "LOCADO"))
      .map((e) => normalizeCode(e.equipmentNumber))
  );

  const validLease = Array.from(leaseMap.entries())
    .filter(([code]) => baseSet.has(code) && !protectedCodes.has(code))
    .map(([equipmentNumber, client]) => ({ equipmentNumber, client, address: addressMap.get(equipmentNumber) ?? null }));

  const manualIgnored = Array.from(leaseMap.entries())
    .filter(([code]) => protectedCodes.has(code))
    .map(([equipmentNumber, client]) => ({ equipmentNumber, client }));

  const manualPreserved = protectedCodes.size;

  // Locadas (pelo arquivo anterior) que saíram do arquivo: voltaram de
  // locação e vão pra conferência em vez de ficarem disponíveis direto.
  const willConference = allEquip
    .filter(
      (e) =>
        e.leaseStatus === "LOCADO" &&
        e.locationSource !== "MANUAL" &&
        !validLease.some((l) => l.equipmentNumber === normalizeCode(e.equipmentNumber))
    )
    .map((e) => e.equipmentNumber);

  return {
    foundInFile: leaseMap.size,
    willLease: validLease.length,
    willAvailable: baseSet.size - validLease.length - manualPreserved - willConference.length,
    willConference,
    manualPreserved,
    manualIgnored,
    duplicates,
    notInBase,
    errorRows,
    leaseList: validLease,
  };
}

// GET — histórico de importações
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const history = await prisma.locationImport.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json({ history });
  } catch (e: any) {
    console.error("[localizacao GET]", e);
    return NextResponse.json({ error: "Erro ao carregar histórico" }, { status: 500 });
  }
}

// POST — mode=preview (validação) ou mode=confirm (aplica a atualização)
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { csv, mode, fileName } = await req.json();
    if (typeof csv !== "string" || !csv.trim()) {
      return NextResponse.json({ error: "Arquivo CSV vazio ou inválido" }, { status: 400 });
    }

    const preview = await buildPreview(csv);
    if ("error" in preview) {
      return NextResponse.json({ error: preview.error }, { status: 400 });
    }

    // Regras de bloqueio
    const blocking: string[] = [];
    if (preview.duplicates.length > 0) {
      blocking.push(`Equipamentos duplicados no arquivo: ${preview.duplicates.join(", ")}`);
    }
    if (preview.notInBase.length > 0) {
      blocking.push(`Equipamentos fora da base: ${preview.notInBase.join(", ")}`);
    }
    if (preview.errorRows.length > 0) {
      blocking.push(`${preview.errorRows.length} linha(s) com erro`);
    }

    if (mode === "preview") {
      return NextResponse.json({ preview, blocking, canConfirm: blocking.length === 0 });
    }

    if (mode === "confirm") {
      if (blocking.length > 0) {
        return NextResponse.json(
          { error: "Importação bloqueada por erros de validação", blocking, preview },
          { status: 400 }
        );
      }

      const now = new Date();
      const leaseCodes = new Set(preview.leaseList.map((l) => l.equipmentNumber));
      const clientByCode = new Map(preview.leaseList.map((l) => [l.equipmentNumber, l.client]));
      const addressByCode = new Map(preview.leaseList.map((l) => [l.equipmentNumber, l.address]));

      // Aplica: marca locados os do CSV; disponíveis os demais — exceto os
      // marcados manualmente como locados (sem contrato ativo no relatório),
      // que são preservados em vez de virarem "disponível" automaticamente.
      const allEquip = await prisma.equipment.findMany({
        select: { id: true, equipmentNumber: true, leaseStatus: true, locationSource: true },
      });

      const ops = allEquip.flatMap((e) => {
        const code = normalizeCode(e.equipmentNumber);
        if (leaseCodes.has(code)) {
          return [
            prisma.equipment.update({
              where: { id: e.id },
              data: {
                leaseStatus: "LOCADO",
                currentClient: clientByCode.get(code) ?? null,
                leaseAddress: addressByCode.get(code) ?? null,
                location: clientByCode.get(code) ?? "",
                lastLocationUpdate: now,
                locationSource: "CSV",
              },
            }),
          ];
        }
        // "Em manutenção" é sempre preservado (um relatório de locação não
        // tem como representar esse estado). Locação manual (sem contrato
        // ativo) só é preservada quando foi de fato marcada manualmente.
        if (e.leaseStatus === "MANUTENCAO") {
          return [];
        }
        if (e.locationSource === "MANUAL" && e.leaseStatus === "LOCADO") {
          return []; // preserva a locação manual
        }
        // Voltou de locação: vai pra conferência (manutenção leve) em vez de
        // ficar disponível direto. O comentário é o "problema" exibido.
        if (e.leaseStatus === "LOCADO") {
          return [
            prisma.equipment.update({
              where: { id: e.id },
              data: {
                leaseStatus: "MANUTENCAO",
                currentClient: null,
                leaseAddress: null,
                location: "",
                lastLocationUpdate: now,
                locationSource: "CSV",
                maintenanceSeverity: "LEVE",
                maintenanceExpectedDate: null,
                maintenanceScheduledDate: null,
                maintenanceScheduledNote: null,
              },
            }),
            prisma.equipmentComment.create({
              data: { content: RETURN_CONFERENCE_NOTE, equipmentId: e.id, authorId: auth.user.userId },
            }),
          ];
        }
        return [
          prisma.equipment.update({
            where: { id: e.id },
            data: {
              leaseStatus: "DISPONIVEL",
              currentClient: null,
              leaseAddress: null,
              lastLocationUpdate: now,
              locationSource: "CSV",
            },
          }),
        ];
      });

      await prisma.$transaction(ops);

      const summary = {
        // sem o endereço: o resumo só guarda quem estava locado pra quem (histórico)
        leased: preview.leaseList.map(({ equipmentNumber, client }) => ({ equipmentNumber, client })),
        leasedCount: preview.willLease,
        availableCount: preview.willAvailable,
      };
      await prisma.locationImport.create({
        data: {
          fileName: fileName || "importacao.csv",
          leasedCount: preview.willLease,
          availableCount: preview.willAvailable,
          errorCount: preview.errorRows.length,
          summary: JSON.stringify(summary),
          createdById: auth.user.userId,
        },
      });

      await syncPainelEquipamentos();

      return NextResponse.json({ ok: true, preview });
    }

    return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
  } catch (e: any) {
    console.error("[localizacao POST]", e);
    return NextResponse.json({ error: "Erro ao processar importação" }, { status: 500 });
  }
}
