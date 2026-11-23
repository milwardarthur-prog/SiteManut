export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullAccess } from "@/lib/require-admin";
import { formatMeters } from "@/lib/carga";
import { loadExtras, loadWeights, saveExtras, saveWeights } from "@/lib/carga-store";

const num = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined; // não informado: não mexe
  if (v === null || v === "") return null; // limpar
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? n : NaN;
};

// PUT — medidas (m) e peso (kg) de um equipamento. As medidas vão pro cadastro
// do equipamento (altura/largura/profundidade); o peso fica à parte, por enquanto.
export async function PUT(req: NextRequest) {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Equipamento inválido" }, { status: 400 });

    const lengthM = num(body.lengthM);
    const widthM = num(body.widthM);
    const heightM = num(body.heightM);
    const weightKg = num(body.weightKg);
    for (const [label, v, min, max] of [
      ["Comprimento", lengthM, 0.2, 15],
      ["Largura", widthM, 0.2, 5],
      ["Altura", heightM, 0.2, 6],
      ["Peso", weightKg, 1, 100000],
    ] as const) {
      if (v === undefined || v === null) continue;
      if (Number.isNaN(v) || v < min || v > max) {
        return NextResponse.json({ error: `${label} inválido` }, { status: 400 });
      }
    }

    if (id.startsWith("extra:")) {
      // Item extra (ex.: bacia): as medidas ficam junto da própria lista de extras.
      const extras = await loadExtras();
      const item = extras.find((x) => x.id === id);
      if (!item) return NextResponse.json({ error: "Item não encontrado" }, { status: 404 });
      if (lengthM !== undefined) item.lengthM = lengthM;
      if (widthM !== undefined) item.widthM = widthM;
      if (heightM !== undefined) item.heightM = heightM;
      if (lengthM !== undefined || widthM !== undefined || heightM !== undefined) await saveExtras(extras);
    } else {
      const eq = await prisma.equipment.findUnique({ where: { id }, select: { id: true } });
      if (!eq) return NextResponse.json({ error: "Equipamento não encontrado" }, { status: 404 });

      const data: { depth?: string | null; width?: string | null; height?: string | null } = {};
      if (lengthM !== undefined) data.depth = lengthM === null ? null : formatMeters(lengthM);
      if (widthM !== undefined) data.width = widthM === null ? null : formatMeters(widthM);
      if (heightM !== undefined) data.height = heightM === null ? null : formatMeters(heightM);
      if (Object.keys(data).length > 0) await prisma.equipment.update({ where: { id }, data });
    }

    if (weightKg !== undefined) {
      const weights = await loadWeights();
      if (weightKg === null) delete weights[id];
      else weights[id] = weightKg;
      await saveWeights(weights);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[carga equipamento PUT]", e);
    return NextResponse.json({ error: "Erro ao salvar o equipamento" }, { status: 500 });
  }
}
