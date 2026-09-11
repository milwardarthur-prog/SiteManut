export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET — lista comentários técnicos de um equipamento (mais recentes primeiro).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const comments = await prisma.equipmentComment.findMany({
      where: { equipmentId: params?.id },
      orderBy: { createdAt: "desc" },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ comments });
  } catch {
    return NextResponse.json({ error: "Erro ao carregar comentários" }, { status: 500 });
  }
}

// POST — adiciona um novo comentário técnico ao equipamento.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas gestores podem adicionar comentários" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const content = typeof body?.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Escreva um comentário" }, { status: 400 });
    }

    const equipment = await prisma.equipment.findUnique({ where: { id: params?.id }, select: { id: true } });
    if (!equipment) return NextResponse.json({ error: "Equipamento não encontrado" }, { status: 404 });

    const comment = await prisma.equipmentComment.create({
      data: {
        content,
        equipmentId: params.id,
        authorId: (session.user as any).id,
      },
      include: { author: { select: { name: true } } },
    });
    return NextResponse.json({ comment });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao salvar comentário" }, { status: 500 });
  }
}
