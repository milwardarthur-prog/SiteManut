export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Adiciona um comentário técnico ao histórico da OS.
// Cada comentário é um registro separado (não sobrescreve os anteriores).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;

  try {
    const body = await req.json();
    const content = (body?.content ?? "").toString().trim();
    if (!content) {
      return NextResponse.json({ error: "O comentário não pode estar vazio" }, { status: 400 });
    }

    const order = await prisma.workOrder.findUnique({ where: { id: params?.id } });
    if (!order) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });

    const comment = await prisma.workOrderComment.create({
      data: { content, workOrderId: params?.id, authorId: user?.id },
      include: { author: { select: { id: true, name: true } } },
    });

    return NextResponse.json(comment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao adicionar comentário" }, { status: 500 });
  }
}

// Remove um comentário (apenas o autor ou um gestor).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user?.role === "ADMIN";

  try {
    const body = await req.json();
    const commentId = body?.commentId;
    if (!commentId) return NextResponse.json({ error: "Comentário inválido" }, { status: 400 });

    const comment = await prisma.workOrderComment.findUnique({ where: { id: commentId } });
    if (!comment) return NextResponse.json({ error: "Comentário não encontrado" }, { status: 404 });

    if (!isAdmin && comment.authorId !== user?.id) {
      return NextResponse.json({ error: "Sem permissão para remover este comentário" }, { status: 403 });
    }

    await prisma.workOrderComment.delete({ where: { id: commentId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao remover comentário" }, { status: 500 });
  }
}
