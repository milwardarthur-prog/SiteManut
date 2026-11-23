export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullAccess } from "@/lib/require-admin";
import { parseMeters } from "@/lib/carga";
import { loadExtras, loadVehicles, loadWeights } from "@/lib/carga-store";

// GET — veículos cadastrados e equipamentos com medidas/peso, pra tela "Montar carga".
export async function GET() {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const [equipments, vehicles, weights, extras] = await Promise.all([
      prisma.equipment.findMany({
        select: {
          id: true,
          equipmentNumber: true,
          name: true,
          model: true,
          leaseStatus: true,
          currentClient: true,
          height: true,
          width: true,
          depth: true,
        },
        orderBy: { equipmentNumber: "asc" },
      }),
      loadVehicles(),
      loadWeights(),
      loadExtras(),
    ]);

    return NextResponse.json({
      vehicles,
      equipments: [
        ...equipments.map((e) => ({
        id: e.id,
        equipmentNumber: e.equipmentNumber,
        name: e.name,
        model: e.model,
        leaseStatus: e.leaseStatus,
        client: e.currentClient,
        // No cadastro: "depth" é o comprimento (lado maior), "width" a largura.
        lengthM: parseMeters(e.depth),
        widthM: parseMeters(e.width),
        heightM: parseMeters(e.height),
        weightKg: weights[e.id] ?? null,
        })),
        // Itens que não são equipamento cadastrado (bacias de contenção etc.).
        ...extras.map((x) => ({
          id: x.id,
          equipmentNumber: x.code,
          name: x.name,
          model: null,
          leaseStatus: null,
          client: null,
          lengthM: x.lengthM,
          widthM: x.widthM,
          heightM: x.heightM,
          weightKg: weights[x.id] ?? null,
        })),
      ],
    });
  } catch (e) {
    console.error("[carga GET]", e);
    return NextResponse.json({ error: "Erro ao carregar os dados da carga" }, { status: 500 });
  }
}
