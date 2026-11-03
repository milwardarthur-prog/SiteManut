export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { canAudit } from "@/lib/access";
import { analyzeReadings, buildLeaseHistory } from "@/lib/horimetro-audit";

// GET — alertas de auditoria dos lançamentos de horímetro + resumo por usuário.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!canAudit(auth.user.email)) return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  const requested = parseInt(req.nextUrl?.searchParams?.get("days") ?? "90", 10);
  const windowDays = [30, 60, 90, 180, 365].includes(requested) ? requested : 90;

  try {
    const [equipments, readings, attempts, imports, users] = await Promise.all([
      prisma.equipment.findMany({
        select: { id: true, equipmentNumber: true, leaseStatus: true, locationSource: true },
      }),
      prisma.horimeterReading.findMany({
        select: { equipmentId: true, readingDate: true, value: true, createdAt: true, createdById: true },
      }),
      prisma.horimeterCollectionAttempt.findMany({
        select: { equipmentId: true, createdAt: true, createdById: true },
      }),
      prisma.locationImport.findMany({ select: { createdAt: true, summary: true }, orderBy: { createdAt: "asc" } }),
      prisma.user.findMany({ select: { id: true, name: true } }),
    ]);

    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    const { alerts, users: stats } = analyzeReadings({
      equipments,
      readings,
      attempts,
      leaseHistory: buildLeaseHistory(imports),
      windowDays,
    });

    return NextResponse.json({
      windowDays,
      users: stats.map((s) => ({ ...s, name: nameOf.get(s.userId) ?? "—" })),
      alerts: alerts.map((a) => ({ ...a, userNames: a.userIds.map((id) => nameOf.get(id) ?? "—") })),
    });
  } catch (e) {
    console.error("[horimetros auditoria GET]", e);
    return NextResponse.json({ error: "Erro ao gerar a auditoria" }, { status: 500 });
  }
}
