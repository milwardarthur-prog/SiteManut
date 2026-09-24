// Quando uma OS de Revisão é finalizada com o horímetro preenchido, registra
// isso como uma leitura oficial de horímetro — o mesmo que aconteceria se
// fosse lançado manualmente na página de Horímetros (cria o histórico e
// recalcula horímetro atual + próxima leitura). Sem isso, o valor ficava só
// no campo da OS, sem aparecer no histórico nem entrar na previsão de
// consumo/manutenção.
import { prisma } from "@/lib/db";
import { computeNextReadingDate, type ReadingFrequency } from "@/lib/horimetro";

export async function syncHorimeterFromRevision(orderId: string): Promise<void> {
  try {
    const order = await prisma.workOrder.findUnique({ where: { id: orderId } });
    if (!order || order.scope !== "REVISAO" || order.horimeter == null || !order.equipmentId) return;

    const equipment = await prisma.equipment.findUnique({
      where: { id: order.equipmentId },
      select: { id: true, currentHorimeter: true, readingFrequency: true, lastMaintenanceDate: true },
    });
    if (!equipment) return;

    // Não deixa um valor menor que o já registrado corromper o histórico —
    // mesma validação que a página de Horímetros faz ao lançar manualmente.
    if (order.horimeter < (equipment.currentHorimeter ?? 0)) return;

    const readingDate = order.revisionDate ?? order.closedAt ?? new Date();
    const next = computeNextReadingDate(readingDate, equipment.readingFrequency as ReadingFrequency);

    await prisma.$transaction([
      prisma.horimeterReading.create({
        data: {
          equipmentId: equipment.id,
          readingDate,
          value: order.horimeter,
          note: `Registrado automaticamente pela OS #${order.orderNumber} (Revisão)`,
          source: "OS",
          createdById: order.closedById ?? order.createdById,
        },
      }),
      prisma.equipment.update({
        where: { id: equipment.id },
        data: {
          currentHorimeter: order.horimeter,
          lastReadingDate: readingDate,
          nextReadingDate: next,
          // A revisão É a manutenção: zera o contador de horas até a próxima
          // (mesmo efeito de registrar manutenção manualmente na página de
          // Horímetros) e encerra um agendamento pendente, se houver.
          lastMaintenanceHorimeter: order.horimeter,
          lastMaintenanceDate: readingDate,
          ...(readingDate.getTime() !== equipment.lastMaintenanceDate?.getTime()
            ? { maintenanceScheduledDate: null, maintenanceScheduledNote: null }
            : {}),
        },
      }),
    ]);
  } catch (e) {
    console.error("[syncHorimeterFromRevision]", e);
  }
}
