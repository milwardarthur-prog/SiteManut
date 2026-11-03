export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { canAudit } from "@/lib/access";

// GET — linha do tempo de um equipamento: cada leitura com quem lançou, quando
// foi lançada, variação desde a anterior, e as tentativas de coleta sem sucesso.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!canAudit(auth.user.email)) return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  try {
    const [readings, attempts] = await Promise.all([
      prisma.horimeterReading.findMany({
        where: { equipmentId: params?.id },
        orderBy: [{ readingDate: "desc" }, { createdAt: "desc" }],
        take: 41,
        include: { createdBy: { select: { name: true } } },
      }),
      prisma.horimeterCollectionAttempt.findMany({
        where: { equipmentId: params?.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { createdBy: { select: { name: true } } },
      }),
    ]);

    const DAY = 24 * 60 * 60 * 1000;
    const timeline = readings.slice(0, 40).map((r, i) => {
      const prev = readings[i + 1];
      const days = prev ? Math.max(1, Math.round((r.readingDate.getTime() - prev.readingDate.getTime()) / DAY)) : null;
      return {
        id: r.id,
        readingDate: r.readingDate,
        value: r.value,
        delta: prev ? r.value - prev.value : null,
        days,
        by: r.createdBy.name,
        enteredAt: r.createdAt,
        lagDays: Math.round((r.createdAt.getTime() - r.readingDate.getTime()) / DAY),
        source: r.source,
        note: r.note,
      };
    });

    return NextResponse.json({
      timeline,
      attempts: attempts.map((a) => ({ id: a.id, at: a.createdAt, reason: a.reason, note: a.note, by: a.createdBy.name })),
    });
  } catch (e) {
    console.error("[horimetros auditoria/[id] GET]", e);
    return NextResponse.json({ error: "Erro ao carregar o histórico" }, { status: 500 });
  }
}
