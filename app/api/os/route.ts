export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  const sp = req.nextUrl?.searchParams;
  const status = sp?.get("status") ?? "";
  const techId = sp?.get("technicianId") ?? "";
  const equipId = sp?.get("equipmentId") ?? "";
  const type = sp?.get("type") ?? "";

  try {
    const where: any = {};
    if (user?.role === "TECHNICIAN") {
      where.OR = [
        { technicianId: user.id },
        { helpers: { some: { helperId: user.id } } },
      ];
    }
    if (status) where.status = status;
    if (techId) where.technicianId = techId;
    if (equipId) where.equipmentId = equipId;
    if (type) where.maintenanceType = type;

    const orders = await prisma.workOrder.findMany({
      where,
      include: {
        technician: { select: { id: true, name: true, email: true } },
        equipment: { select: { id: true, equipmentNumber: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { parts: true, helpers: true, photos: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(orders);
  } catch {
    return NextResponse.json({ error: "Erro ao buscar OS" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;

  try {
    const body = await req.json();
    const { technicianId, equipmentId, maintenanceType, horimeter, comments } = body ?? {};
    if (!equipmentId || !maintenanceType) {
      return NextResponse.json({ error: "Equipamento e tipo de manutenção são obrigatórios" }, { status: 400 });
    }

    const isAdmin = user?.role === "ADMIN";
    const assignedTech = isAdmin && technicianId ? technicianId : user?.id;
    const initialStatus = isAdmin ? "APROVADA" : "PENDENTE_APROVACAO";

    const order = await prisma.workOrder.create({
      data: {
        status: initialStatus,
        maintenanceType,
        horimeter: horimeter ? parseFloat(horimeter) : null,
        comments: comments ?? null,
        technicianId: assignedTech,
        createdById: user?.id,
        equipmentId,
      },
      include: {
        technician: { select: { id: true, name: true } },
        equipment: { select: { id: true, equipmentNumber: true, name: true } },
      },
    });

    // Update equipment horimeter if provided
    if (horimeter) {
      await prisma.equipment.update({
        where: { id: equipmentId },
        data: { currentHorimeter: parseFloat(horimeter) },
      });
    }

    return NextResponse.json(order, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao criar OS" }, { status: 500 });
  }
}
