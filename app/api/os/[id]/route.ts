export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

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
    if (horimeter !== undefined) {
      data.horimeter = parseFloat(horimeter);
      await prisma.equipment.update({
        where: { id: current.equipmentId },
        data: { currentHorimeter: parseFloat(horimeter) },
      });
    }
    if (isAdmin && body?.technicianId) data.technicianId = body.technicianId;
    if (isAdmin && body?.maintenanceType) data.maintenanceType = body.maintenanceType;
    if (isAdmin && body?.equipmentId) data.equipmentId = body.equipmentId;

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
