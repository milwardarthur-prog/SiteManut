export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { loadCargaData } from "@/lib/carga-data";

// Endpoint público (sem autenticação, autorizado pelo gestor) — alimenta a aba
// "Montar carga" do painel estático (github.io/testemanut), que é só de leitura.
// Só dado técnico: código, medidas, peso, bacias e carrocerias dos veículos.
// Sem cliente, status de locação, custo ou qualquer dado de pessoa.
const ALLOWED_ORIGIN = "https://milwardarthur-prog.github.io";

function withCors(res: NextResponse) {
  res.headers.set("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function GET() {
  try {
    return withCors(NextResponse.json(await loadCargaData({ publicView: true })));
  } catch (e) {
    console.error("[public/carga GET]", e);
    return withCors(NextResponse.json({ error: "Erro ao ler dados" }, { status: 500 }));
  }
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}
