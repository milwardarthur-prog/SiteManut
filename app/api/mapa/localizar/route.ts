export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullAccess } from "@/lib/require-admin";
import { geocodeAddress, normalizeAddress, parseCoordinates, type GeoResult } from "@/lib/geocode";
import { loadGeoCache, saveGeoCache } from "@/lib/mapa-cache";

const validIds = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.length <= 100 && v.every((x) => typeof x === "string" && x.length < 60);

// POST — define o endereço de um ou mais equipamentos locados. O endereço é
// sempre informado à mão (o CSV de locação não traz). `input` pode ser um
// endereço ou as coordenadas coladas do Google Maps ("-21.76, -43.35").
export async function POST(req: NextRequest) {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const input = typeof body?.input === "string" ? body.input.trim().slice(0, 300) : "";
    if (!validIds(body?.equipmentIds) || !input) {
      return NextResponse.json({ error: "Informe o endereço ou as coordenadas" }, { status: 400 });
    }

    // Descobre a posição: coordenadas coladas valem direto; endereço vai pro OpenStreetMap.
    const coords = parseCoordinates(input);
    let result: GeoResult | null;
    if (coords) {
      result = { lat: coords.lat, lng: coords.lng, precision: "MANUAL" };
    } else {
      try {
        // Prazo curto: a Vercel Hobby corta a chamada em ~10 s.
        result = await geocodeAddress(input, Date.now() + 8500);
      } catch {
        return NextResponse.json({ error: "O OpenStreetMap demorou a responder. Tente de novo." }, { status: 502 });
      }
    }
    // Não achou: não mexe no endereço atual, pra a pessoa poder tentar outro texto.
    if (!result) return NextResponse.json({ ok: true, found: false });

    const address = coords ? `${coords.lat}, ${coords.lng}` : input;
    const cache = await loadGeoCache();
    cache[normalizeAddress(address)] = { ...result, at: new Date().toISOString() };
    await prisma.equipment.updateMany({
      where: { id: { in: body.equipmentIds }, leaseStatus: "LOCADO" },
      data: { leaseAddress: address },
    });
    await saveGeoCache(cache);
    return NextResponse.json({ ok: true, found: true });
  } catch (e) {
    console.error("[mapa localizar POST]", e);
    return NextResponse.json({ error: "Erro ao salvar a localização" }, { status: 500 });
  }
}

// PUT — move o pino: grava a posição (arrastada no mapa) para os endereços
// daquele ponto. Vale a partir de agora pra qualquer equipamento nesse endereço.
export async function PUT(req: NextRequest) {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const lat = Number(body?.lat);
    const lng = Number(body?.lng);
    const addresses: unknown = body?.addresses;
    if (
      !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
      !Array.isArray(addresses) || addresses.length === 0 || addresses.length > 100 ||
      !addresses.every((a) => typeof a === "string" && a.length < 400)
    ) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }

    const cache = await loadGeoCache();
    const at = new Date().toISOString();
    for (const a of addresses as string[]) {
      const key = normalizeAddress(a);
      if (key) cache[key] = { lat, lng, precision: "MANUAL", at };
    }
    await saveGeoCache(cache);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[mapa localizar PUT]", e);
    return NextResponse.json({ error: "Erro ao mover o pino" }, { status: 500 });
  }
}
