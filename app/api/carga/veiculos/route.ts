export const dynamic = "force-dynamic";

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireFullAccess } from "@/lib/require-admin";
import type { Vehicle } from "@/lib/carga";
import { saveVehicles } from "@/lib/carga-store";

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : null;
};

// PUT — grava a lista inteira de veículos (a tela edita tudo de uma vez).
export async function PUT(req: NextRequest) {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const raw: unknown[] = Array.isArray(body?.vehicles) ? body.vehicles : [];
    if (raw.length > 50) return NextResponse.json({ error: "Veículos demais" }, { status: 400 });

    const vehicles: Vehicle[] = [];
    for (const v of raw as any[]) {
      const name = typeof v?.name === "string" ? v.name.trim().slice(0, 80) : "";
      const lengthM = num(v?.lengthM);
      const widthM = num(v?.widthM);
      const heightM = v?.heightM === null || v?.heightM === "" || v?.heightM === undefined ? null : num(v.heightM);
      const capacityKg =
        v?.capacityKg === null || v?.capacityKg === "" || v?.capacityKg === undefined ? null : num(v.capacityKg);
      if (!name) return NextResponse.json({ error: "Todo veículo precisa de um nome" }, { status: 400 });
      if (lengthM == null || lengthM < 1 || lengthM > 30 || widthM == null || widthM < 1 || widthM > 5) {
        return NextResponse.json({ error: `${name}: comprimento (1 a 30 m) e largura (1 a 5 m) inválidos` }, { status: 400 });
      }
      if (heightM != null && (heightM < 0.5 || heightM > 6)) {
        return NextResponse.json({ error: `${name}: altura inválida (0,5 a 6 m)` }, { status: 400 });
      }
      if (capacityKg != null && (capacityKg < 100 || capacityKg > 100000)) {
        return NextResponse.json({ error: `${name}: capacidade inválida (100 a 100.000 kg)` }, { status: 400 });
      }
      vehicles.push({
        id: typeof v?.id === "string" && v.id.length < 60 ? v.id : randomUUID(),
        name,
        lengthM,
        widthM,
        heightM,
        capacityKg,
      });
    }

    await saveVehicles(vehicles);
    return NextResponse.json({ ok: true, vehicles });
  } catch (e) {
    console.error("[carga veiculos PUT]", e);
    return NextResponse.json({ error: "Erro ao salvar os veículos" }, { status: 500 });
  }
}
