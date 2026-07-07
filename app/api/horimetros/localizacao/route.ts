export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { normalizeCode } from "@/lib/horimetro";

// Identifica as colunas de equipamento e cliente de forma tolerante a variações.
function pickColumns(fields: string[]): { eqCol?: string; clientCol?: string } {
  const norm = (s: string) => normalizeCode(s).toLowerCase();
  let eqCol: string | undefined;
  let clientCol: string | undefined;
  for (const f of fields) {
    const n = norm(f);
    if (!eqCol && (n.includes("equip") || n === "ge" || n.includes("codigo") || n.includes("código"))) eqCol = f;
    if (!clientCol && (n.includes("client") || n.includes("local") || n.includes("obra"))) clientCol = f;
  }
  return { eqCol, clientCol };
}

type PreviewResult = {
  foundInFile: number;
  willLease: number;
  willAvailable: number;
  duplicates: string[];
  notInBase: string[];
  errorRows: { line: number; message: string }[];
  leaseList: { equipmentNumber: string; client: string }[];
};

async function buildPreview(csv: string): Promise<PreviewResult | { error: string }> {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const fields = parsed.meta?.fields ?? [];
  const { eqCol, clientCol } = pickColumns(fields);
  if (!eqCol || !clientCol) {
    return {
      error:
        "Não foi possível identificar as colunas. O CSV deve ter uma coluna de equipamento e uma de cliente (ex.: 'equipamento,cliente').",
    };
  }

  const rows = parsed.data ?? [];
  const errorRows: { line: number; message: string }[] = [];
  const seen = new Map<string, number>(); // code -> count
  const leaseMap = new Map<string, string>(); // code -> client

  rows.forEach((row, idx) => {
    const line = idx + 2; // +1 header +1 base-1
    const rawCode = row[eqCol!];
    const rawClient = row[clientCol!];
    const code = normalizeCode(rawCode);
    const client = (rawClient ?? "").trim();
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
  });

  const duplicates = Array.from(seen.entries())
    .filter(([, c]) => c > 1)
    .map(([code]) => code);

  // Confere quais códigos existem na base
  const allEquip = await prisma.equipment.findMany({ select: { equipmentNumber: true } });
  const baseSet = new Set(allEquip.map((e) => normalizeCode(e.equipmentNumber)));

  const notInBase = Array.from(leaseMap.keys()).filter((c) => !baseSet.has(c));

  const validLease = Array.from(leaseMap.entries())
    .filter(([code]) => baseSet.has(code))
    .map(([equipmentNumber, client]) => ({ equipmentNumber, client }));

  return {
    foundInFile: leaseMap.size,
    willLease: validLease.length,
    willAvailable: baseSet.size - validLease.length,
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

      // Aplica: marca locados os do CSV; disponíveis os demais.
      const allEquip = await prisma.equipment.findMany({
        select: { id: true, equipmentNumber: true },
      });

      const ops = allEquip.map((e) => {
        const code = normalizeCode(e.equipmentNumber);
        if (leaseCodes.has(code)) {
          return prisma.equipment.update({
            where: { id: e.id },
            data: {
              leaseStatus: "LOCADO",
              currentClient: clientByCode.get(code) ?? null,
              location: clientByCode.get(code) ?? "",
              lastLocationUpdate: now,
              locationSource: "CSV",
            },
          });
        }
        return prisma.equipment.update({
          where: { id: e.id },
          data: {
            leaseStatus: "DISPONIVEL",
            currentClient: null,
            lastLocationUpdate: now,
            locationSource: "CSV",
          },
        });
      });

      await prisma.$transaction(ops);

      const summary = {
        leased: preview.leaseList,
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

      return NextResponse.json({ ok: true, preview });
    }

    return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
  } catch (e: any) {
    console.error("[localizacao POST]", e);
    return NextResponse.json({ error: "Erro ao processar importação" }, { status: 500 });
  }
}
