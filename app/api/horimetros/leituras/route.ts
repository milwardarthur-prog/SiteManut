export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import {
  computeNextReadingDate,
  diffDays,
  MAX_HOURS_PER_DAY,
  type ReadingFrequency,
} from "@/lib/horimetro";

type IncomingReading = {
  equipmentId: string;
  readingDate: string;
  value: number | string;
  note?: string;
  confirmed?: boolean; // usuário confirmou apesar de alerta (valor menor / salto alto)
};

// POST — lança leituras em lote (somente ADMIN). Cada leitura gera um novo
// registro no histórico e recalcula horímetro atual + próxima leitura.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const readings: IncomingReading[] = Array.isArray(body?.readings) ? body.readings : [];
    if (readings.length === 0) {
      return NextResponse.json({ error: "Nenhuma leitura informada" }, { status: 400 });
    }

    const warnings: { equipmentId: string; type: string; message: string }[] = [];
    const errors: { equipmentId: string; message: string }[] = [];
    const toApply: {
      equipmentId: string;
      readingDate: Date;
      value: number;
      note: string | null;
      frequency: ReadingFrequency;
    }[] = [];

    // Carrega equipamentos referenciados
    const ids = Array.from(new Set(readings.map((r) => r.equipmentId).filter(Boolean)));
    const equipments = await prisma.equipment.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        equipmentNumber: true,
        currentHorimeter: true,
        lastReadingDate: true,
        readingFrequency: true,
      },
    });
    const byId = new Map(equipments.map((e) => [e.id, e]));

    for (const r of readings) {
      const eq = byId.get(r.equipmentId);
      if (!eq) {
        errors.push({ equipmentId: r.equipmentId, message: "Equipamento não encontrado" });
        continue;
      }
      const value = typeof r.value === "string" ? parseFloat(r.value) : r.value;
      if (value === undefined || value === null || isNaN(value)) {
        errors.push({ equipmentId: r.equipmentId, message: "Valor de horímetro inválido" });
        continue;
      }
      if (value < 0) {
        errors.push({ equipmentId: r.equipmentId, message: "Valor não pode ser negativo" });
        continue;
      }
      const readingDate = r.readingDate ? new Date(r.readingDate) : new Date();
      if (isNaN(readingDate.getTime())) {
        errors.push({ equipmentId: r.equipmentId, message: "Data de leitura inválida" });
        continue;
      }

      // Validação: valor menor que o último registrado
      const last = eq.currentHorimeter ?? 0;
      if (value < last) {
        if (!r.confirmed) {
          warnings.push({
            equipmentId: r.equipmentId,
            type: "MENOR",
            message: `Horímetro informado (${value}) é menor que o último registrado (${last}). Verifique a leitura.`,
          });
          continue; // não aplica sem confirmação
        }
      } else if (eq.lastReadingDate) {
        // Validação: salto muito alto (h/dia acima do teto físico)
        const days = Math.max(1, diffDays(readingDate, new Date(eq.lastReadingDate)));
        const perDay = (value - last) / days;
        if (perDay > MAX_HOURS_PER_DAY && !r.confirmed) {
          warnings.push({
            equipmentId: r.equipmentId,
            type: "SALTO_ALTO",
            message: `Variação muito alta (${perDay.toFixed(1)} h/dia) desde a última leitura. Confirme se o valor está correto.`,
          });
          continue;
        }
      }

      toApply.push({
        equipmentId: r.equipmentId,
        readingDate,
        value,
        note: r.note?.trim() || null,
        frequency: eq.readingFrequency as ReadingFrequency,
      });
    }

    // Se houver avisos não confirmados, retorna sem aplicar nada e pede confirmação
    if (warnings.length > 0) {
      return NextResponse.json(
        { needsConfirmation: true, warnings, errors, appliedCount: 0 },
        { status: 200 }
      );
    }

    // Aplica em transação: cria leitura + atualiza equipamento
    let applied = 0;
    for (const a of toApply) {
      const next = computeNextReadingDate(a.readingDate, a.frequency);
      await prisma.$transaction([
        prisma.horimeterReading.create({
          data: {
            equipmentId: a.equipmentId,
            readingDate: a.readingDate,
            value: a.value,
            note: a.note,
            source: "MANUAL",
            createdById: auth.user.userId,
          },
        }),
        prisma.equipment.update({
          where: { id: a.equipmentId },
          data: {
            currentHorimeter: a.value,
            lastReadingDate: a.readingDate,
            nextReadingDate: next,
          },
        }),
      ]);
      applied++;
    }

    return NextResponse.json({ ok: true, appliedCount: applied, errors });
  } catch (e: any) {
    console.error("[horimetros/leituras POST]", e);
    return NextResponse.json({ error: "Erro ao lançar leituras" }, { status: 500 });
  }
}
