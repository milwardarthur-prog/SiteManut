export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { EXTRA_FIELD_KEYS } from "@/lib/equipment-fields";

// Extrai os campos extras (Filtros, Componentes, Dimensões) do body.
// Strings vazias são convertidas em null.
function pickExtraFields(body: any): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of EXTRA_FIELD_KEYS) {
    const value = body?.[key];
    out[key] = value === undefined || value === null || value === "" ? null : String(value);
  }
  return out;
}

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
    if (!equipmentNumber || !name) {
      return NextResponse.json({ error: "Número e nome são obrigatórios" }, { status: 400 });
    }
    // Garante que o número não conflite com outro equipamento
    const conflict = await prisma.equipment.findUnique({ where: { equipmentNumber } });
    if (conflict && conflict.id !== params?.id) {
      return NextResponse.json({ error: "Número de equipamento já existe" }, { status: 400 });
    }
    const equipment = await prisma.equipment.update({
      where: { id: params?.id },
      data: {
        equipmentNumber,
        name,
        description: description ?? null,
        model: model ?? null,
        year: year ? parseInt(year) : null,
        currentHorimeter: currentHorimeter !== undefined && currentHorimeter !== "" ? parseFloat(currentHorimeter) : undefined,
        location: location ?? null,
        serialNumber: serialNumber ?? null,
        ...pickExtraFields(body),
      },
    });
    return NextResponse.json(equipment);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao atualizar equipamento" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas gestores podem excluir equipamentos" }, { status: 403 });
  }

  try {
    const workOrderCount = await prisma.workOrder.count({ where: { equipmentId: params?.id } });
    if (workOrderCount > 0) {
      return NextResponse.json(
        {
          error: `Não é possível excluir: existem ${workOrderCount} ordem(ns) de serviço vinculada(s) a este equipamento.`,
        },
        { status: 400 }
      );
    }
    await prisma.equipment.delete({ where: { id: params?.id } });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({ error: "Equipamento não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ error: error?.message ?? "Erro ao excluir equipamento" }, { status: 500 });
  }
}
