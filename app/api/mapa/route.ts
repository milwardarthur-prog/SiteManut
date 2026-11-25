export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullAccess } from "@/lib/require-admin";
import { normalizeAddress } from "@/lib/geocode";
import { NAO_OCULTO } from "@/lib/equipamentos-ocultos";
import { isFound, loadGeoCache } from "@/lib/mapa-cache";

export type MaintenanceState = "VENCIDA" | "PROXIMA" | "EM_DIA" | "SEM_DADO";
// "Próxima" usa o mesmo limite da tela Agendar manutenção (menos de 50 h).
const NEAR_HOURS = 50;

// GET — equipamentos locados com a posição de cada um no mapa.
export async function GET() {
  const auth = await requireFullAccess();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const [equipments, cache] = await Promise.all([
      prisma.equipment.findMany({
        where: { leaseStatus: "LOCADO", ...NAO_OCULTO },
        select: {
          id: true,
          equipmentNumber: true,
          name: true,
          model: true,
          currentClient: true,
          leaseAddress: true,
          currentHorimeter: true,
          lastMaintenanceHorimeter: true,
          maintenanceIntervalHours: true,
        },
        orderBy: { equipmentNumber: "asc" },
      }),
      loadGeoCache(),
    ]);

    let pending = 0;
    const pendingSeen = new Set<string>();
    const items = equipments.map((e) => {
      const addressKey = e.leaseAddress ? normalizeAddress(e.leaseAddress) : "";
      const entry = addressKey ? cache[addressKey] : undefined;

      // LOCALIZADO (tem coordenadas) | PENDENTE (ainda vai buscar) |
      // NAO_ACHADO (a busca não achou) | IMPRECISO (só achou o centro da cidade ou
      // um trecho da rodovia — não vai pro mapa, senão vários equipamentos de
      // endereços diferentes ficam empilhados no mesmo ponto) | SEM_ENDERECO
      let state: "LOCALIZADO" | "PENDENTE" | "NAO_ACHADO" | "IMPRECISO" | "SEM_ENDERECO";
      if (!addressKey) state = "SEM_ENDERECO";
      else if (isFound(entry) && (entry.precision === "CIDADE" || entry.precision === "RODOVIA")) state = "IMPRECISO";
      else if (isFound(entry)) state = "LOCALIZADO";
      else if (entry) state = "NAO_ACHADO";
      else {
        state = "PENDENTE";
        if (!pendingSeen.has(addressKey)) {
          pendingSeen.add(addressKey);
          pending++;
        }
      }

      let hoursRemaining: number | null = null;
      if (e.lastMaintenanceHorimeter != null && e.maintenanceIntervalHours != null && e.maintenanceIntervalHours > 0) {
        hoursRemaining = Math.round((e.lastMaintenanceHorimeter + e.maintenanceIntervalHours - e.currentHorimeter) * 10) / 10;
      }
      const maintenance: MaintenanceState =
        hoursRemaining == null ? "SEM_DADO" : hoursRemaining < 0 ? "VENCIDA" : hoursRemaining < NEAR_HOURS ? "PROXIMA" : "EM_DIA";

      return {
        id: e.id,
        equipmentNumber: e.equipmentNumber,
        name: e.name,
        model: e.model,
        client: e.currentClient ?? "—",
        address: e.leaseAddress,
        state,
        lat: state === "LOCALIZADO" && isFound(entry) ? entry.lat : null,
        lng: state === "LOCALIZADO" && isFound(entry) ? entry.lng : null,
        precision: isFound(entry) ? entry.precision : null,
        currentHorimeter: e.currentHorimeter,
        hoursRemaining,
        maintenance,
      };
    });

    return NextResponse.json({ items, pending });
  } catch (e) {
    console.error("[mapa GET]", e);
    return NextResponse.json({ error: "Erro ao carregar o mapa" }, { status: 500 });
  }
}
