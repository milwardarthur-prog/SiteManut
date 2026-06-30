export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const equipment = await prisma.equipment.findUnique({
      where: { id: params?.id },
      include: {
        files: { orderBy: { createdAt: "desc" } },
        workOrders: {
          include: {
            technician: { select: { id: true, name: true, email: true } },
            parts: true,
            helpers: { include: { helper: { select: { id: true, name: true } } } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!equipment) return NextResponse.json({ error: "Equipamento não encontrado" }, { status: 404 });
    return NextResponse.json(equipment);
  } catch {
    return NextResponse.json({ error: "Erro ao buscar equipamento" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas gestores podem editar equipamentos" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { equipmentNumber, name, description, model, year, currentHorimeter, location, serialNumber } = body ?? {};
    const equipment = await prisma.equipment.update({
      where: { id: params?.id },
      data: {
        ...(equipmentNumber && { equipmentNumber }),
        ...(name && { name }),
        description: description ?? undefined,
        model: model ?? undefined,
        year: year ? parseInt(year) : undefined,
        currentHorimeter: currentHorimeter ? parseFloat(currentHorimeter) : undefined,
        location: location ?? undefined,
        serialNumber: serialNumber ?? undefined,
      },
    });
    return NextResponse.json(equipment);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao atualizar equipamento" }, { status: 500 });
  }
}
