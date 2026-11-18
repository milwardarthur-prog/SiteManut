export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullAccess } from "@/lib/require-admin";
import { geocodeAddress, normalizeAddress, parseCoordinates, type GeoResult } from "@/lib/geocode";
import { loadGeoCache, saveGeoCache } from "@/lib/mapa-cache";

const validIds = (v: unknown): v is string[] =>
  Array.isArray(v) && v.length > 0 && v.length <= 100 && v.every((x) => typeof x === "string" && x.length < 60);

// POST — corrige a localização de equipamentos que ficaram sem pino (endereço
// ausente ou não encontrado). `input` pode ser um endereço novo ou as
// coordenadas coladas do Google Maps ("-21.76, -43.35").
export async function POST(req: NextRequest) {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const input = typeof body?.input === "string" ? body.input.trim().slice(0, 300) : "";
    if (!validIds(body?.equipmentIds) || !input) {
      return NextResponse.json({ error: "Informe o endereço ou as coordenadas" }, { status: 400 });
    }

    const cache = await loadGeoCache();
    const at = new Date().toISOString();
    const coords = parseCoordinates(input);

    // Descobre a posição: coordenadas coladas valem direto; endereço vai pro OpenStreetMap.
    let result: GeoResult | null;
    if (coords) {
      result = { lat: coords.lat, lng: coords.lng, precision: "MANUAL" };
    } else {
      try {
        result = await geocodeAddress(input);
      } catch {
        return NextResponse.json({ error: "O OpenStreetMap não respondeu. Tente de novo em instantes." }, { status: 502 });
      }
    }
    if (!result) return NextResponse.json({ ok: true, found: false });

    const equipments = await prisma.equipment.findMany({
      where: { id: { in: body.equipmentIds }, leaseStatus: "LOCADO" },
      select: { id: true, leaseAddress: true },
    });
    // Quem já tem endereço (do CSV) mantém o texto e a posição fica guardada
    // nele — assim a correção sobrevive à próxima importação do CSV. Quem não
    // tem endereço passa a ter o que foi digitado.
    const withoutAddress: string[] = [];
    for (const e of equipments) {
      const key = normalizeAddress(e.leaseAddress);
      if (key) cache[key] = { ...result, at };
      else withoutAddress.push(e.id);
    }
    if (withoutAddress.length > 0) {
      const address = coords ? `${coords.lat}, ${coords.lng}` : input;
      cache[normalizeAddress(address)] = { ...result, at };
      await prisma.equipment.updateMany({ where: { id: { in: withoutAddress } }, data: { leaseAddress: address } });
    }
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
