export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import {
  computeConsumption,
  predictMaintenance,
  computeNextReadingDate,
  classifyPending,
  type ReadingFrequency,
} from "@/lib/horimetro";

const VALID_FREQ = ["SEMANAL", "QUINZENAL", "MENSAL"];

// GET — detalhe de um equipamento: histórico de leituras + previsões.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const sp = req.nextUrl?.searchParams;
  const window = parseInt(sp?.get("window") ?? "5", 10) || 5;

  try {
    const eq = await prisma.equipment.findUnique({
      where: { id: params?.id },
      include: {
        horimeterReadings: {
          orderBy: { readingDate: "desc" },
          take: 50,
          include: { createdBy: { select: { name: true } } },
        },
        frequencyChanges: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: { createdBy: { select: { name: true } } },
        },
      },
    });
    if (!eq) return NextResponse.json({ error: "Equipamento não encontrado" }, { status: 404 });

    const consumption = computeConsumption(
      (eq.horimeterReadings ?? []).map((r) => ({ readingDate: r.readingDate, value: r.value })),
      window
    );
    const prediction = predictMaintenance({
      currentHorimeter: eq.currentHorimeter,
      lastMaintenanceHorimeter: eq.lastMaintenanceHorimeter,
      maintenanceIntervalHours: eq.maintenanceIntervalHours,
      consumption,
    });
    const pending = classifyPending(eq.nextReadingDate);

    return NextResponse.json({ equipment: eq, consumption, prediction, pending });
  } catch (e: any) {
    console.error("[horimetros/[id] GET]", e);
    return NextResponse.json({ error: "Erro ao carregar equipamento" }, { status: 500 });
  }
}

// PUT — altera frequência de leitura e/ou parâmetros de manutenção (ADMIN).
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const eq = await prisma.equipment.findUnique({ where: { id: params?.id } });
    if (!eq) return NextResponse.json({ error: "Equipamento não encontrado" }, { status: 404 });

    const data: any = {};

    // Alteração de frequência (com log de auditoria + recálculo de próxima leitura)
    if (body?.readingFrequency !== undefined) {
      const newFreq = String(body.readingFrequency);
      if (!VALID_FREQ.includes(newFreq)) {
        return NextResponse.json({ error: "Frequência inválida" }, { status: 400 });
      }
      if (newFreq !== eq.readingFrequency) {
        data.readingFrequency = newFreq;
        // Recalcula próxima leitura com a nova frequência
        if (eq.lastReadingDate) {
          data.nextReadingDate = computeNextReadingDate(
            eq.lastReadingDate,
            newFreq as ReadingFrequency
          );
        }
        await prisma.frequencyChangeLog.create({
          data: {
            equipmentId: eq.id,
            previousValue: eq.readingFrequency,
            newValue: newFreq as any,
            reason: body?.reason?.trim() || null,
            createdById: auth.user.userId,
          },
        });
      }
    }

    // Status manual de locação — usado tanto para marcar um equipamento locado
    // sem contrato ativo (não aparece na importação de CSV) quanto para marcá-lo
    // em manutenção, ou devolvê-lo a disponível.
    if (body?.manualStatus !== undefined) {
      const status = String(body.manualStatus);
      if (!["LOCADO", "DISPONIVEL", "MANUTENCAO"].includes(status)) {
        return NextResponse.json({ error: "Status inválido" }, { status: 400 });
      }
      const client = typeof body.manualClient === "string" ? body.manualClient.trim() : "";
      if (status === "LOCADO" && !client) {
        return NextResponse.json({ error: "Informe o cliente" }, { status: 400 });
      }
      data.leaseStatus = status;
      data.currentClient = status === "LOCADO" ? client : null;
      data.location = status === "LOCADO" ? client : "";
      data.locationSource = "MANUAL";
      data.lastLocationUpdate = new Date();
    }

    // Parâmetros de manutenção
    if (body?.lastMaintenanceHorimeter !== undefined) {
      const v = body.lastMaintenanceHorimeter;
      data.lastMaintenanceHorimeter =
        v === "" || v === null ? null : parseFloat(v);
    }
    if (body?.maintenanceIntervalHours !== undefined) {
      const v = body.maintenanceIntervalHours;
      data.maintenanceIntervalHours =
        v === "" || v === null ? null : parseFloat(v);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    const updated = await prisma.equipment.update({
      where: { id: eq.id },
      data,
    });
    return NextResponse.json({ ok: true, equipment: updated });
  } catch (e: any) {
    console.error("[horimetros/[id] PUT]", e);
    return NextResponse.json({ error: "Erro ao atualizar equipamento" }, { status: 500 });
  }
}
