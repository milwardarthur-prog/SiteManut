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
// Relatórios de patrimônio/estoque costumam ter várias colunas de "código"
// (ex.: "Cod Produto") que não são o nome do item, e às vezes duas colunas de
// preço (compra/venda) — por isso a prioridade abaixo evita falsos positivos.
function pickColumns(fields: string[]): { nameCol?: string; priceCol?: string; fallbackPriceCol?: string } {
  const norm = (s: string) => normalizeName(s).toLowerCase();

  const nameCandidates = fields.filter((f) => !norm(f).includes("cod"));
  const nameCol =
    nameCandidates.find((f) => norm(f).includes("descri")) ??
    nameCandidates.find((f) => norm(f).includes("nome")) ??
    nameCandidates.find((f) => norm(f).includes("item")) ??
    nameCandidates.find((f) => norm(f).includes("produto")) ??
    fields.find((f) => norm(f).includes("descri") || norm(f).includes("nome") || norm(f).includes("item") || norm(f).includes("produto"));

  const priceCandidates = fields.filter((f) => {
    const n = norm(f);
    return n.includes("preç") || n.includes("prec") || n.includes("valor") || n.includes("price");
  });
  const priceCol =
    priceCandidates.find((f) => norm(f).includes("compra")) ??
    priceCandidates.find((f) => !norm(f).includes("venda")) ??
    priceCandidates[0];
  // Quando há mais de uma coluna de preço (ex.: compra e venda), a outra serve
  // de alternativa para linhas em que a coluna principal está vazia ou zerada.
  const fallbackPriceCol = priceCandidates.find((f) => f !== priceCol);

  return { nameCol, priceCol, fallbackPriceCol };
}

type PreviewRow = { name: string; price: number };
type PreviewResult = {
  nameColumn: string;
  priceColumn: string;
  fallbackPriceColumn?: string;
  toCreate: PreviewRow[];
  toUpdate: (PreviewRow & { previousPrice: number })[];
  unchanged: number;
  duplicates: string[];
  errorRows: { line: number; message: string }[];
  skippedNoPrice: number;
};

async function buildPreview(csv: string): Promise<PreviewResult | { error: string }> {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const fields = parsed.meta?.fields ?? [];
  const { nameCol, priceCol, fallbackPriceCol } = pickColumns(fields);
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
  let skippedNoPrice = 0;

  rows.forEach((row, idx) => {
    const line = idx + 2;
    const name = normalizeName(row[nameCol]);
    if (!name) {
      errorRows.push({ line, message: "Nome do item vazio" });
      return;
    }
    const rawPrimary = normalizeName(row[priceCol]);
    const primary = rawPrimary ? parsePrice(rawPrimary) : null;
    if (rawPrimary && primary == null) {
      errorRows.push({ line, message: `Preço inválido para "${name}": "${rawPrimary}"` });
      return;
    }
    // Quando a coluna principal está vazia ou zerada (ex.: "Preço Compra" sem
    // valor), usa a outra coluna de preço (ex.: "Preço Venda") como alternativa.
    const rawFallback = fallbackPriceCol ? normalizeName(row[fallbackPriceCol]) : "";
    const fallback = rawFallback ? parsePrice(rawFallback) : null;

    const price = primary != null && primary > 0 ? primary : fallback != null && fallback > 0 ? fallback : null;

    if (price == null) {
      // Nenhuma das colunas de preço tem um valor utilizável para esse item —
      // não é um erro de dado, só não há o que importar para essa linha.
      skippedNoPrice++;
      return;
    }
    const key = name.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
    // Nomes duplicados no arquivo (comum em relatórios de patrimônio, onde
    // SKUs diferentes podem ter a mesma descrição) ficam com o maior preço
    // válido encontrado, em vez do valor da última ocorrência — assim uma
    // linha zerada/duplicada não apaga um preço real já visto.
    const best = byName.get(key);
    if (best == null || price > best) {
      byName.set(key, price);
    }
  });

  const duplicates = Array.from(seen.entries())
    .filter(([, c]) => c > 1)
    .map(([key]) => key);

  const validEntries = Array.from(byName.entries());
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

  return {
    nameColumn: nameCol,
    priceColumn: priceCol,
    fallbackPriceColumn: fallbackPriceCol,
    toCreate,
    toUpdate,
    unchanged,
    duplicates,
    errorRows,
    skippedNoPrice,
  };
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
