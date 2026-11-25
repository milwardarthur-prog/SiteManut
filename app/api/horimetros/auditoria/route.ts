export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { NAO_OCULTO } from "@/lib/equipamentos-ocultos";
import { requireAdmin } from "@/lib/require-admin";
import { canAudit } from "@/lib/access";
import { analyzeReadings, buildLeaseHistory } from "@/lib/horimetro-audit";
import { alertKey, loadReviews } from "@/lib/horimetro-audit-review";

// GET — alertas de auditoria dos lançamentos de horímetro + resumo por usuário.
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!canAudit(auth.user.email)) return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  const requested = parseInt(req.nextUrl?.searchParams?.get("days") ?? "90", 10);
  const windowDays = [30, 60, 90, 180, 365].includes(requested) ? requested : 90;

  try {
    const [equipments, readings, attempts, imports, users, reviews] = await Promise.all([
      prisma.equipment.findMany({
        where: NAO_OCULTO,
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
      loadReviews(),
    ]);

    const nameOf = new Map(users.map((u) => [u.id, u.name]));
    const { alerts, users: stats } = analyzeReadings({
      equipments,
      readings,
      attempts,
      leaseHistory: buildLeaseHistory(imports),
      windowDays,
    });

    const withReview = alerts.map((a) => {
      const key = alertKey(a);
      return { ...a, key, reviewed: reviews[key] ?? null, userNames: a.userIds.map((id) => nameOf.get(id) ?? "—") };
    });

    // O contador de alertas altos por usuário só conta os que ainda estão pendentes.
    const pendingHigh = new Map<string, number>();
    for (const a of withReview) {
      if (a.severity !== "ALTA" || a.reviewed) continue;
      for (const u of a.userIds) pendingHigh.set(u, (pendingHigh.get(u) ?? 0) + 1);
    }

    return NextResponse.json({
      windowDays,
      users: stats.map((s) => ({ ...s, highAlerts: pendingHigh.get(s.userId) ?? 0, name: nameOf.get(s.userId) ?? "—" })),
      alerts: withReview,
    });
  } catch (e) {
    console.error("[horimetros auditoria GET]", e);
    return NextResponse.json({ error: "Erro ao gerar a auditoria" }, { status: 500 });
  }
}
