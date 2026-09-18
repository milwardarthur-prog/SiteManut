export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — lista enxuta (nome + preço) para o autocompletar de peças nas OS.
// Qualquer usuário autenticado pode consultar; só o Estoque em si é restrito.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const items = await prisma.stockItem.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true },
    });
    return NextResponse.json({ items });
  } catch (e: any) {
    console.error("[estoque lookup GET]", e);
    return NextResponse.json({ error: "Erro ao carregar itens" }, { status: 500 });
  }
}
