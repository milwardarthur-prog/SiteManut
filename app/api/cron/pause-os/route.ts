export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

// Disparado pelo Vercel Cron (vercel.json) todo dia às 17:30 (horário de
// Brasília). Os técnicos esquecem de pausar a OS no fim do expediente, o que
// deixa o contador de tempo (totalTimeMinutes) correndo a noite toda — então
// o sistema pausa por eles e avisa quem ficou com a OS em aberto.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const orders = await prisma.workOrder.findMany({
      where: { status: "EM_EXECUCAO", deletedAt: null },
      select: {
        id: true,
        orderNumber: true,
        technicianId: true,
        customEquipmentLabel: true,
        equipment: { select: { equipmentNumber: true } },
      },
    });

    if (orders.length === 0) {
      return NextResponse.json({ paused: 0 });
    }

    await prisma.workOrder.updateMany({
      where: { id: { in: orders.map((o) => o.id) } },
      data: { status: "PAUSADA" },
    });

    for (const order of orders) {
      if (!order.technicianId) continue;
      const label = order.equipment?.equipmentNumber ?? order.customEquipmentLabel;
      await sendPushToUser(order.technicianId, {
        title: `OS #${order.orderNumber} pausada automaticamente`,
        body: `Fim de expediente (17:30) — ${label ?? "sem equipamento"}. Retome amanhã quando voltar.`,
        url: `/os/${order.id}`,
      });
    }

    return NextResponse.json({ paused: orders.length });
  } catch (e: any) {
    console.error("[cron pause-os]", e);
    return NextResponse.json({ error: "Erro ao pausar OS" }, { status: 500 });
  }
}
