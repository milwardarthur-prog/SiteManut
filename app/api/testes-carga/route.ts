export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const DATA_KEY = "testes_carga_csv";
const EXPECTED_HEADER = "Equipamento";

// GET — retorna o CSV atual (qualquer usuário autenticado pode visualizar)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const row = await prisma.dataStore.findUnique({ where: { key: DATA_KEY } });
    return NextResponse.json({ csv: row?.content ?? "" });
  } catch (e: any) {
    console.error("[testes-carga GET] erro ao ler CSV:", e);
    return NextResponse.json({ error: "Erro ao ler dados" }, { status: 500 });
  }
}

// POST — substitui todo o CSV (somente ADMIN)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas o gestor pode importar" }, { status: 403 });
  }

  try {
    const { csv } = await req.json();
    if (typeof csv !== "string" || !csv.trim()) {
      return NextResponse.json({ error: "Arquivo CSV vazio ou inválido" }, { status: 400 });
    }
    const firstLine = csv.split(/\r?\n/)[0] ?? "";
    if (!firstLine.includes(EXPECTED_HEADER)) {
      return NextResponse.json(
        { error: `Cabeçalho inválido. A primeira linha deve conter a coluna "${EXPECTED_HEADER}".` },
        { status: 400 }
      );
    }
    await prisma.dataStore.upsert({
      where: { key: DATA_KEY },
      update: { content: csv },
      create: { key: DATA_KEY, content: csv },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[testes-carga POST] erro ao salvar CSV:", e);
    return NextResponse.json({ error: "Erro ao salvar dados" }, { status: 500 });
  }
}
