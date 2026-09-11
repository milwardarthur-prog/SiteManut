export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { compararEquipmentNumber } from "@/lib/ge-equipamentos";
import {
  classifyPending,
  computeConsumption,
  predictMaintenance,
  getMaintenanceScheduleReason,
} from "@/lib/horimetro";

// GET — lista todos os equipamentos com dados do módulo de horímetro,
// já com pendência de leitura e previsão de manutenção calculadas.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = req.nextUrl?.searchParams;
  const window = parseInt(sp?.get("window") ?? "5", 10) || 5;

  try {
    const equipments = await prisma.equipment.findMany({
      select: {
        id: true,
        equipmentNumber: true,
        name: true,
        currentHorimeter: true,
        readingFrequency: true,
        lastReadingDate: true,
        nextReadingDate: true,
        leaseStatus: true,
        currentClient: true,
        lastLocationUpdate: true,
        locationSource: true,
        lastMaintenanceHorimeter: true,
        lastMaintenanceDate: true,
        maintenanceIntervalHours: true,
        horimeterReadings: {
          orderBy: { readingDate: "desc" },
          take: window + 1,
          select: { readingDate: true, value: true },
        },
      },
    });

    const now = new Date();
    const rows = equipments.map((e) => {
      const pending = classifyPending(e.nextReadingDate, now);
      const consumption = computeConsumption(
        (e.horimeterReadings ?? []).map((r) => ({ readingDate: r.readingDate, value: r.value })),
        window
      );
      const prediction = predictMaintenance({
        currentHorimeter: e.currentHorimeter,
        lastMaintenanceHorimeter: e.lastMaintenanceHorimeter,
        maintenanceIntervalHours: e.maintenanceIntervalHours,
        consumption,
        ref: now,
      });
      const { horimeterReadings, ...rest } = e;
      const scheduleReason = getMaintenanceScheduleReason({
        hoursRemaining: prediction.hoursRemaining,
        lastMaintenanceDate: e.lastMaintenanceDate,
        ref: now,
      });
      return {
        ...rest,
        pendingStatus: pending.status,
        daysLate: pending.daysLate,
        consumption,
        prediction,
        needsSchedule: scheduleReason !== null,
        scheduleReason,
      };
    });

    rows.sort((a, b) => compararEquipmentNumber(a.equipmentNumber, b.equipmentNumber));

    // Resumo agregado
    const summary = {
      total: rows.length,
      atrasados: rows.filter((r) => r.pendingStatus === "ATRASADO").length,
      agendarManutencao: rows.filter((r) => r.needsSchedule).length,
      locados: rows.filter((r) => r.leaseStatus === "LOCADO").length,
      disponiveis: rows.filter((r) => r.leaseStatus === "DISPONIVEL").length,
      manutencao: rows.filter((r) => r.leaseStatus === "MANUTENCAO").length,
    };

    return NextResponse.json({ rows, summary });
  } catch (e: any) {
    console.error("[horimetros GET]", e);
    return NextResponse.json({ error: "Erro ao carregar equipamentos" }, { status: 500 });
  }
}
