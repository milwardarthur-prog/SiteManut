export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { NAO_OCULTO } from "@/lib/equipamentos-ocultos";
import { requireFullAccess } from "@/lib/require-admin";
import { GeoDeadlineError, geocodeAddress, normalizeAddress } from "@/lib/geocode";
import { loadGeoCache, saveGeoCache } from "@/lib/mapa-cache";

// Tempo máximo gasto por chamada (a Vercel Hobby corta em ~10 s). A tela
// chama de novo até acabar; cada endereço leva de 1 a 4 consultas de ~1 s.
const BUDGET_MS = 8000;

// POST — busca as coordenadas dos endereços ainda sem cache. Com
// { retryFailed: true}, tenta de novo os que a busca não achou antes.
export async function POST(req: NextRequest) {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json().catch(() => ({}));
    const startedAt = Date.now();
    const deadline = startedAt + BUDGET_MS;

    const rows = await prisma.equipment.findMany({
      where: { leaseStatus: "LOCADO", leaseAddress: { not: null }, ...NAO_OCULTO },
      select: { leaseAddress: true },
    });
    const addresses = Array.from(new Set(rows.map((r) => normalizeAddress(r.leaseAddress)).filter(Boolean)));

    const cache = await loadGeoCache();
    if (body?.retryFailed) {
      for (const a of addresses) if (cache[a] && "fail" in cache[a]) delete cache[a];
    }
    const todo = addresses.filter((a) => !cache[a]);

    let done = 0;
    let networkError: string | null = null;
    for (const address of todo) {
      if (Date.now() > deadline - 2500) break;
      try {
        const result = await geocodeAddress(address, deadline);
        const at = new Date().toISOString();
        cache[address] = result ? { ...result, at } : { fail: true, at };
        done++;
      } catch (e: any) {
        if (e instanceof GeoDeadlineError) break; // acabou o prazo: continua na próxima chamada
        // Falha de rede/limite do OpenStreetMap: não vira "não achou", fica pendente.
        networkError = e?.message ?? "Falha ao consultar o OpenStreetMap";
        break;
      }
    }
    if (done > 0) await saveGeoCache(cache);

    const remaining = addresses.filter((a) => !cache[a]).length;
    return NextResponse.json({ done, remaining, networkError });
  } catch (e) {
    console.error("[mapa geocodificar POST]", e);
    return NextResponse.json({ error: "Erro ao localizar os endereços" }, { status: 500 });
  }
}
