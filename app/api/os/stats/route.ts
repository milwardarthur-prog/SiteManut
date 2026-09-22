export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { computePartsCost, computeRevisionCost } from "@/lib/os-cost";

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
    // Exclui OS excluídas (soft-delete) — mesmo critério já usado na listagem
    // de OS e na exportação (elas não representam trabalho/custo real).
    const where: any = { deletedAt: null };
    if (startDate || endDate) where.createdAt = dateFilter;

    // All orders with date filter
    const allOrders = await prisma.workOrder.findMany({
      where,
      include: {
        technician: { select: { id: true, name: true } },
        equipment: { select: { id: true, equipmentNumber: true, name: true } },
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

    // Custos (peças + revisão) — ver lib/os-cost.ts para o cálculo em si.
    let totalCost = 0;
    let totalPartsCost = 0;
    let totalRevisionCost = 0;
    let reworkCost = 0;
    const costByType: Record<string, { sum: number; count: number }> = {};
    const costByMonth: Record<string, number> = {};
    const costByEquipment: Record<string, { equipmentNumber: string; name: string; cost: number }> = {};
    let oilLitersTotal = 0;
    let oilCostTotal = 0;
    let revisionsWithOilCount = 0;

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

      // Custo total da OS (peças + revisão)
      const partsCost = computePartsCost(order?.parts as any);
      const revisionCost = order?.scope === "REVISAO" ? computeRevisionCost(order as any) : 0;
      const orderCost = partsCost + revisionCost;
      totalCost += orderCost;
      totalPartsCost += partsCost;
      totalRevisionCost += revisionCost;

      // Custo médio por OS, por tipo (só OS finalizadas — mesmo critério do
      // tempo médio, para não diluir com OS ainda pendentes/sem peças).
      if (order?.status === "FINALIZADA") {
        const mt = order.maintenanceType ?? "UNKNOWN";
        if (!costByType[mt]) costByType[mt] = { sum: 0, count: 0 };
        costByType[mt].sum += orderCost;
        costByType[mt].count += 1;
      }

      // Custo de retrabalho (dinheiro gasto corrigindo serviço mal feito)
      if (order?.maintenanceType === "RETRABALHO") {
        reworkCost += orderCost;
      }

      // Custo por mês (para o gráfico "Custo Total por Mês" no período)
      if (orderCost > 0 && order?.createdAt) {
        const d = new Date(order.createdAt);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        costByMonth[monthKey] = (costByMonth[monthKey] ?? 0) + orderCost;
      }

      // Custo acumulado por equipamento (ranking dos que mais custam manter)
      if (orderCost > 0 && order?.equipment) {
        const eqId = order.equipment.id;
        if (!costByEquipment[eqId]) {
          costByEquipment[eqId] = {
            equipmentNumber: order.equipment.equipmentNumber ?? "",
            name: order.equipment.name ?? "",
            cost: 0,
          };
        }
        costByEquipment[eqId].cost += orderCost;
      }

      // Óleo 15W40 consumido nas revisões (litros e custo)
      if (order?.scope === "REVISAO" && order?.oilCost != null) {
        oilLitersTotal += parseFloat(order.oilLiters ?? "0") || 0;
        oilCostTotal += order.oilCost;
        revisionsWithOilCount += 1;
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

    const avgCostByType = Object.entries(costByType ?? {}).map(([type, val]) => ({
      type,
      avgCost: val?.count ? val.sum / val.count : 0,
    }));

    const costByMonthArr = Object.entries(costByMonth ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cost]) => {
        const [y, m] = month.split("-");
        return { month, label: `${m}/${y}`, cost };
      });

    const topEquipmentCost = Object.values(costByEquipment ?? {})
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    return NextResponse.json({
      totalOrders: allOrders?.length ?? 0,
      statusCounts,
      typeCounts,
      avgTimeByType,
      techProductivity,
      topHelpers,
      topParts,
      costs: {
        totalCost,
        totalPartsCost,
        totalRevisionCost,
        reworkCost,
        reworkPercent: totalCost > 0 ? (reworkCost / totalCost) * 100 : 0,
        avgCostByType,
        costByMonth: costByMonthArr,
        topEquipmentCost,
        oil: {
          liters: oilLitersTotal,
          cost: oilCostTotal,
          revisionsCount: revisionsWithOilCount,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao gerar estatísticas" }, { status: 500 });
  }
}
