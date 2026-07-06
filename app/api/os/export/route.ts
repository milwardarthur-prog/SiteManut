export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import ExcelJS from "exceljs";

const tankSampleLabels: Record<string, string> = { BOA: "Boa", RUIM: "Ruim" };
const fuelFilterLabels: Record<string, string> = {
  BOM: "Bom",
  TROCADO: "Trocado",
  NAO_APLICA: "Não se aplica",
};

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function fmtDateOnly(d: Date | null | undefined): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// Gera um Excel com duas planilhas: Checklist e Teste de Carga.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas gestores podem exportar relatórios" }, { status: 403 });
  }

  try {
    const sp = req.nextUrl?.searchParams;
    const startDate = sp?.get("startDate");
    const endDate = sp?.get("endDate");

    const dateFilter: any = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateFilter.lte = end;
    }
    const whereBase: any = { deletedAt: null };
    if (startDate || endDate) whereBase.createdAt = dateFilter;

    const checklistOrders = await prisma.workOrder.findMany({
      where: { ...whereBase, scope: "CHECKLIST" },
      include: {
        equipment: { select: { equipmentNumber: true, name: true } },
        technician: { select: { name: true } },
      },
      orderBy: { orderNumber: "asc" },
    });

    const loadTestOrders = await prisma.workOrder.findMany({
      where: { ...whereBase, scope: "TESTE_CARGA" },
      include: {
        equipment: { select: { equipmentNumber: true, name: true } },
        technician: { select: { name: true } },
      },
      orderBy: { orderNumber: "asc" },
    });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Manutenção BeltLoc";
    workbook.created = new Date();

    const headerStyle = (ws: ExcelJS.Worksheet) => {
      const row = ws.getRow(1);
      row.font = { bold: true, color: { argb: "FFFFFFFF" } };
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEA580C" } };
      row.alignment = { vertical: "middle", horizontal: "center" };
      row.height = 20;
    };

    // ---- Planilha CHECKLIST ----
    const wsChecklist = workbook.addWorksheet("Checklist");
    wsChecklist.columns = [
      { header: "Nº OS", key: "orderNumber", width: 10 },
      { header: "Equipamento", key: "equipment", width: 30 },
      { header: "Data", key: "date", width: 14 },
      { header: "Horímetro", key: "horimeter", width: 12 },
      { header: "Amostra do Tanque", key: "tankSample", width: 18 },
      { header: "Filtro Combustível 1", key: "ff1", width: 18 },
      { header: "Filtro Combustível 2", key: "ff2", width: 18 },
      { header: "Filtro Combustível 3", key: "ff3", width: 18 },
      { header: "Comentários", key: "comments", width: 40 },
      { header: "Técnico", key: "technician", width: 20 },
      { header: "Criado em", key: "createdAt", width: 20 },
    ];
    for (const o of checklistOrders) {
      wsChecklist.addRow({
        orderNumber: o.orderNumber,
        equipment: o.equipment ? `${o.equipment.equipmentNumber} - ${o.equipment.name}` : "",
        date: fmtDateOnly(o.checklistDate) || fmtDateOnly(o.createdAt),
        horimeter: o.horimeter ?? "",
        tankSample: o.tankSample ? (tankSampleLabels[o.tankSample] ?? o.tankSample) : "",
        ff1: o.checkFuelFilter1 ? (fuelFilterLabels[o.checkFuelFilter1] ?? o.checkFuelFilter1) : "",
        ff2: o.checkFuelFilter2 ? (fuelFilterLabels[o.checkFuelFilter2] ?? o.checkFuelFilter2) : "",
        ff3: o.checkFuelFilter3 ? (fuelFilterLabels[o.checkFuelFilter3] ?? o.checkFuelFilter3) : "",
        comments: o.comments ?? "",
        technician: o.technician?.name ?? "",
        createdAt: fmtDate(o.createdAt),
      });
    }
    headerStyle(wsChecklist);

    // ---- Planilha TESTE DE CARGA ----
    const wsLoad = workbook.addWorksheet("Teste de Carga");
    wsLoad.columns = [
      { header: "Nº OS", key: "orderNumber", width: 10 },
      { header: "Equipamento", key: "equipment", width: 30 },
      { header: "Horímetro", key: "horimeter", width: 12 },
      { header: "Data", key: "date", width: 14 },
      { header: "Tensão Vazio", key: "voltageEmpty", width: 16 },
      { header: "Frequência Vazio", key: "frequencyEmpty", width: 16 },
      { header: "Carga", key: "load", width: 14 },
      { header: "Frequência com Carga", key: "frequencyLoad", width: 20 },
      { header: "Comentários", key: "comments", width: 40 },
      { header: "Técnico", key: "technician", width: 20 },
      { header: "Criado em", key: "createdAt", width: 20 },
    ];
    for (const o of loadTestOrders) {
      wsLoad.addRow({
        orderNumber: o.orderNumber,
        equipment: o.equipment ? `${o.equipment.equipmentNumber} - ${o.equipment.name}` : "",
        horimeter: o.horimeter ?? "",
        date: fmtDateOnly(o.loadTestDate) || fmtDateOnly(o.createdAt),
        voltageEmpty: o.voltageEmpty ?? "",
        frequencyEmpty: o.frequencyEmpty ?? "",
        load: o.load ?? "",
        frequencyLoad: o.frequencyLoad ?? "",
        comments: o.comments ?? "",
        technician: o.technician?.name ?? "",
        createdAt: fmtDate(o.createdAt),
      });
    }
    headerStyle(wsLoad);

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `relatorio-checklist-testecarga-${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao gerar relatório" }, { status: 500 });
  }
}
