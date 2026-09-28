export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const DATA_KEY = "testes_carga_csv";

// Endpoint público (sem autenticação, autorizado explicitamente pelo gestor)
// — usado pelo painel estático de disponibilidade (github.io/testemanut) pra
// mostrar o histórico de testes de carga ao clicar num equipamento. O CSV só
// tem dados técnicos (data, tensão/frequência/amperagem), nada sensível (sem
// cliente, custo ou identificação de técnico).
const ALLOWED_ORIGIN = "https://milwardarthur-prog.github.io";

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  return res;
}

export async function GET() {
  try {
    const row = await prisma.dataStore.findUnique({ where: { key: DATA_KEY } });
    return withCors(NextResponse.json({ csv: row?.content ?? "" }));
  } catch (e: any) {
    console.error("[public/testes-carga GET]", e);
    return withCors(NextResponse.json({ error: "Erro ao ler dados" }, { status: 500 }));
  }
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
