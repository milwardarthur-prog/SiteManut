export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { description, quantity } = await req.json();
    if (!description) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
    const part = await prisma.workOrderPart.create({
      data: {
        description,
        quantity: quantity ?? 1,
        workOrderId: params?.id,
      },
    });
    return NextResponse.json(part, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao adicionar peça" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { partId } = await req.json();
    await prisma.workOrderPart.delete({ where: { id: partId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro ao remover peça" }, { status: 500 });
  }
}
