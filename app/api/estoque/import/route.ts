export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import { prisma } from "@/lib/db";
import { requireFullAccess } from "@/lib/require-admin";

function normalizeName(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ");
}

// Converte um preço em texto (aceita formato BR "1.234,56" ou "45,90", com ou
// sem "R$") para número. Retorna null se não for um valor válido.
function parsePrice(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  let s = String(raw).trim().replace(/^R\$\s*/i, "").trim();
  if (!s) return null;
  if (s.includes(",")) {
    // Formato BR: remove separador de milhar "." e usa "," como decimal.
    s = s.replace(/\./g, "").replace(",", ".");
  }
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// Identifica as colunas de nome/preço de forma tolerante a variações de cabeçalho.
function pickColumns(fields: string[]): { nameCol?: string; priceCol?: string } {
  const norm = (s: string) => normalizeName(s).toLowerCase();
  let nameCol: string | undefined;
  let priceCol: string | undefined;
  for (const f of fields) {
    const n = norm(f);
    if (!nameCol && (n.includes("nome") || n.includes("item") || n.includes("descri") || n.includes("produto"))) {
      nameCol = f;
    }
    if (!priceCol && (n.includes("preç") || n.includes("prec") || n.includes("valor") || n.includes("price"))) {
      priceCol = f;
    }
  }
  return { nameCol, priceCol };
}

type PreviewRow = { name: string; price: number };
type PreviewResult = {
  toCreate: PreviewRow[];
  toUpdate: (PreviewRow & { previousPrice: number })[];
  unchanged: number;
  duplicates: string[];
  errorRows: { line: number; message: string }[];
};

async function buildPreview(csv: string): Promise<PreviewResult | { error: string }> {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const fields = parsed.meta?.fields ?? [];
  const { nameCol, priceCol } = pickColumns(fields);
  if (!nameCol || !priceCol) {
    return {
      error:
        "Não foi possível identificar as colunas. O CSV deve ter uma coluna de nome do item e uma de preço.",
    };
  }

  const rows = parsed.data ?? [];
  const errorRows: { line: number; message: string }[] = [];
  const seen = new Map<string, number>();
  const byName = new Map<string, number>();

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const name = normalizeName(row[nameCol]);
    if (!name) {
      errorRows.push({ line, message: "Nome do item vazio" });
      return;
    }
    const price = parsePrice(row[priceCol]);
    if (price == null) {
      errorRows.push({ line, message: `Preço inválido para "${name}"` });
      return;
    }
    const key = name.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
    byName.set(key, price);
  });

  const duplicates = Array.from(seen.entries())
    .filter(([, c]) => c > 1)
    .map(([key]) => key);

  const validEntries = Array.from(byName.entries()).filter(([key]) => !duplicates.includes(key));
  const nameByKey = new Map<string, string>();
  rows.forEach((row) => {
    const name = normalizeName(row[nameCol]);
    if (name) nameByKey.set(name.toLowerCase(), name);
  });

  const existing = await prisma.stockItem.findMany({
    where: { name: { in: Array.from(nameByKey.values()) } },
  });
  const existingByKey = new Map(existing.map((e) => [e.name.toLowerCase(), e]));

  const toCreate: PreviewRow[] = [];
  const toUpdate: (PreviewRow & { previousPrice: number })[] = [];
  let unchanged = 0;

  for (const [key, price] of validEntries) {
    const name = nameByKey.get(key)!;
    const current = existingByKey.get(key);
    if (!current) {
      toCreate.push({ name, price });
    } else if (Math.abs(current.price - price) > 0.001) {
      toUpdate.push({ name, price, previousPrice: current.price });
    } else {
      unchanged++;
    }
  }

  return { toCreate, toUpdate, unchanged, duplicates, errorRows };
}

// GET — histórico de importações
export async function GET() {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const history = await prisma.stockImport.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { createdBy: { select: { name: true } } },
    });
    return NextResponse.json({ history });
  } catch (e: any) {
    console.error("[estoque/import GET]", e);
    return NextResponse.json({ error: "Erro ao carregar histórico" }, { status: 500 });
  }
}

// POST — mode=preview (validação) ou mode=confirm (aplica a importação)
export async function POST(req: NextRequest) {
  const auth = await requireFullAccess();
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

    const blocking: string[] = [];
    if (preview.duplicates.length > 0) {
      blocking.push(`Itens duplicados no arquivo: ${preview.duplicates.join(", ")}`);
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

      await prisma.$transaction([
        ...preview.toCreate.map((r) =>
          prisma.stockItem.create({ data: { name: r.name, price: r.price } })
        ),
        ...preview.toUpdate.map((r) =>
          prisma.stockItem.update({ where: { name: r.name }, data: { price: r.price } })
        ),
      ]);

      await prisma.stockImport.create({
        data: {
          fileName: fileName || "importacao.csv",
          createdCount: preview.toCreate.length,
          updatedCount: preview.toUpdate.length,
          errorCount: preview.errorRows.length,
          createdById: auth.user.userId,
        },
      });

      return NextResponse.json({ ok: true, preview });
    }

    return NextResponse.json({ error: "Modo inválido" }, { status: 400 });
  } catch (e: any) {
    console.error("[estoque/import POST]", e);
    return NextResponse.json({ error: "Erro ao processar importação" }, { status: 500 });
  }
}
