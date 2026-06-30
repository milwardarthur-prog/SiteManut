export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { helperId, startTime, endTime } = await req.json();
    if (!helperId || !startTime) {
      return NextResponse.json({ error: "Ajudante e horário de início são obrigatórios" }, { status: 400 });
    }
    const helper = await prisma.workOrderHelper.create({
      data: {
        helperId,
        startTime: new Date(startTime),
        endTime: endTime ? new Date(endTime) : null,
        workOrderId: params?.id,
      },
      include: { helper: { select: { id: true, name: true, email: true } } },
    });
    return NextResponse.json(helper, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao adicionar ajudante" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { helperId: recordId } = await req.json();
    await prisma.workOrderHelper.delete({ where: { id: recordId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro ao remover ajudante" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { recordId, endTime } = await req.json();
    const updated = await prisma.workOrderHelper.update({
      where: { id: recordId },
      data: { endTime: endTime ? new Date(endTime) : null },
      include: { helper: { select: { id: true, name: true } } },
    });
    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar ajudante" }, { status: 500 });
  }
}
