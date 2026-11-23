export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { requireFullAccess } from "@/lib/require-admin";
import { loadCargaData } from "@/lib/carga-data";

// GET — veículos cadastrados e equipamentos com medidas/peso, pra tela "Montar carga".
export async function GET() {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    return NextResponse.json(await loadCargaData({ publicView: false }));
  } catch (e) {
    console.error("[carga GET]", e);
    return NextResponse.json({ error: "Erro ao carregar os dados da carga" }, { status: 500 });
  }
}
