export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullAccess } from "@/lib/require-admin";

// GET — lista todos os itens de estoque (nome + preço), ordenados por nome.
export async function GET() {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const items = await prisma.stockItem.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ items });
  } catch (e: any) {
    console.error("[estoque GET]", e);
    return NextResponse.json({ error: "Erro ao carregar estoque" }, { status: 500 });
  }
}
