export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const CHECKLIST_FIELDS = ["tankSample", "checkFuelFilter1", "checkFuelFilter2", "checkFuelFilter3"] as const;
const LOADTEST_FIELDS = ["voltageEmpty", "frequencyEmpty", "load", "frequencyLoad"] as const;

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const order = await prisma.workOrder.findUnique({
      where: { id: params?.id },
      include: {
        technician: { select: { id: true, name: true, email: true } },
        equipment: { select: { id: true, equipmentNumber: true, name: true, currentHorimeter: true } },
        createdBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        parts: { orderBy: { createdAt: "asc" } },
        helpers: {
          include: { helper: { select: { id: true, name: true, email: true } } },
          orderBy: { startTime: "asc" },
        },
        photos: { orderBy: { createdAt: "desc" } },
        technicalComments: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!order) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });
    return NextResponse.json(order);
  } catch {
    return NextResponse.json({ error: "Erro ao buscar OS" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user?.role === "ADMIN";

  try {
    const body = await req.json();
    const { comments, adminNotes, horimeter } = body ?? {};

    const current = await prisma.workOrder.findUnique({ where: { id: params?.id } });
    if (!current) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });

    const data: any = {};
    if (comments !== undefined) data.comments = comments;
    if (adminNotes !== undefined && isAdmin) data.adminNotes = adminNotes;
    if (horimeter !== undefined && horimeter !== "" && horimeter !== null) {
      data.horimeter = parseFloat(horimeter);
      await prisma.equipment.update({
        where: { id: current.equipmentId },
        data: { currentHorimeter: parseFloat(horimeter) },
      });
    }

    // Admin pode alterar técnico (inclusive remover -> null), tipo e equipamento
    if (isAdmin && body?.technicianId !== undefined) {
      data.technicianId = body.technicianId || null;
    }
    if (isAdmin && body?.maintenanceType) data.maintenanceType = body.maintenanceType;
    if (isAdmin && body?.equipmentId) data.equipmentId = body.equipmentId;

    // Campos de checklist (editáveis por quem tem acesso à OS)
    if (body?.checklistDate !== undefined) {
      data.checklistDate = body.checklistDate ? new Date(body.checklistDate) : null;
    }
    for (const f of CHECKLIST_FIELDS) {
      if (body?.[f] !== undefined) data[f] = body[f] || null;
    }

    // Campos de teste de carga
    if (body?.loadTestDate !== undefined) {
      data.loadTestDate = body.loadTestDate ? new Date(body.loadTestDate) : null;
    }
    for (const f of LOADTEST_FIELDS) {
      if (body?.[f] !== undefined) data[f] = body[f] || null;
    }

    const updated = await prisma.workOrder.update({
      where: { id: params?.id },
      data,
      include: {
        technician: { select: { id: true, name: true } },
        equipment: { select: { id: true, equipmentNumber: true, name: true } },
      },
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao atualizar OS" }, { status: 500 });
  }
}

// Soft delete — apenas ADMIN
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  if (user?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas gestores podem excluir OS" }, { status: 403 });
  }

  try {
    const current = await prisma.workOrder.findUnique({ where: { id: params?.id } });
    if (!current) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });

    await prisma.workOrder.update({
      where: { id: params?.id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao excluir OS" }, { status: 500 });
  }
}
