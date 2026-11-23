// Dados da tela "Montar carga": veículos, equipamentos (com medidas e peso) e
// itens extras (bacias). Usado pela rota autenticada (/api/carga) e pela rota
// pública, de leitura, que alimenta a aba "Montar carga" do painel estático
// (github.io/testemanut). Na visão pública NÃO saem cliente nem status de
// locação — só dado técnico (código, medidas, peso).
import { prisma } from "@/lib/db";
import { parseMeters } from "@/lib/carga";
import { loadExtras, loadVehicles, loadWeights } from "@/lib/carga-store";

export type CargaEquipment = {
  id: string;
  equipmentNumber: string;
  name: string;
  model: string | null;
  leaseStatus: "DISPONIVEL" | "LOCADO" | "MANUTENCAO" | null;
  client: string | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  weightKg: number | null;
};

export async function loadCargaData(opts: { publicView: boolean }) {
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

  const list: CargaEquipment[] = [
    ...equipments.map((e) => ({
      id: e.id,
      equipmentNumber: e.equipmentNumber,
      name: e.name,
      model: e.model,
      leaseStatus: opts.publicView ? null : e.leaseStatus,
      client: opts.publicView ? null : e.currentClient,
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
  ];

  return { vehicles, equipments: list };
}
