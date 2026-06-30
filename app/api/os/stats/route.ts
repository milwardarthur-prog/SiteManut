export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
  }

  const sp = req.nextUrl?.searchParams;
  const startDate = sp?.get("startDate") ?? "";
  const endDate = sp?.get("endDate") ?? "";

  try {
    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate + "T23:59:59.999Z");
    const where: any = {};
    if (startDate || endDate) where.createdAt = dateFilter;

    // All orders with date filter
    const allOrders = await prisma.workOrder.findMany({
      where,
      include: {
        technician: { select: { id: true, name: true } },
        parts: true,
        helpers: { include: { helper: { select: { id: true, name: true } } } },
      },
    });

    // Status distribution
    const statusCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    const techStats: Record<string, { name: string; count: number; totalTime: number }> = {};
    const helperCounts: Record<string, { name: string; count: number }> = {};
    const partCounts: Record<string, { description: string; total: number }> = {};
    let totalTimeByType: Record<string, { sum: number; count: number }> = {};

    for (const order of allOrders ?? []) {
      // Status counts
      statusCounts[order?.status ?? "UNKNOWN"] = (statusCounts[order?.status ?? "UNKNOWN"] ?? 0) + 1;

      // Type counts
      typeCounts[order?.maintenanceType ?? "UNKNOWN"] = (typeCounts[order?.maintenanceType ?? "UNKNOWN"] ?? 0) + 1;

      // Tech stats (only finalized)
      if (order?.status === "FINALIZADA" && order?.technician) {
        const tId = order.technician.id;
        if (!techStats[tId]) techStats[tId] = { name: order.technician.name, count: 0, totalTime: 0 };
        techStats[tId].count += 1;
        techStats[tId].totalTime += order?.totalTimeMinutes ?? 0;
      }

      // Time by type
      if (order?.status === "FINALIZADA" && order?.totalTimeMinutes) {
        const mt = order.maintenanceType;
        if (!totalTimeByType[mt]) totalTimeByType[mt] = { sum: 0, count: 0 };
        totalTimeByType[mt].sum += order.totalTimeMinutes;
        totalTimeByType[mt].count += 1;
      }

      // Helper counts
      for (const h of order?.helpers ?? []) {
        const hId = h?.helperId ?? "";
        if (!helperCounts[hId]) helperCounts[hId] = { name: h?.helper?.name ?? "Desconhecido", count: 0 };
        helperCounts[hId].count += 1;
      }

      // Parts
      for (const p of order?.parts ?? []) {
        const key = (p?.description ?? "").toLowerCase().trim();
        if (!key) continue;
        if (!partCounts[key]) partCounts[key] = { description: p?.description ?? "", total: 0 };
        partCounts[key].total += p?.quantity ?? 0;
      }
    }

    const avgTimeByType = Object.entries(totalTimeByType ?? {}).map(([type, val]: [string, any]) => ({
      type,
      avgMinutes: val?.count ? Math.round((val?.sum ?? 0) / val.count) : 0,
    }));

    const techProductivity = Object.values(techStats ?? {}).map((t: any) => ({
      name: t?.name ?? "",
      count: t?.count ?? 0,
      avgMinutes: t?.count ? Math.round((t?.totalTime ?? 0) / t.count) : 0,
    }));

    const topHelpers = Object.values(helperCounts ?? {})
      .sort((a: any, b: any) => (b?.count ?? 0) - (a?.count ?? 0))
      .slice(0, 10);

    const topParts = Object.values(partCounts ?? {})
      .sort((a: any, b: any) => (b?.total ?? 0) - (a?.total ?? 0))
      .slice(0, 10);

    return NextResponse.json({
      totalOrders: allOrders?.length ?? 0,
      statusCounts,
      typeCounts,
      avgTimeByType,
      techProductivity,
      topHelpers,
      topParts,
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao gerar estatísticas" }, { status: 500 });
  }
}
