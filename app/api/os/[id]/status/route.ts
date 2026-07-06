export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  const isAdmin = user?.role === "ADMIN";

  try {
    const { action } = await req.json();
    const current = await prisma.workOrder.findUnique({ where: { id: params?.id } });
    if (!current) return NextResponse.json({ error: "OS não encontrada" }, { status: 404 });

    const data: any = {};

    switch (action) {
      case "approve":
        if (!isAdmin) return NextResponse.json({ error: "Apenas gestores podem aprovar" }, { status: 403 });
        if (current.status !== "PENDENTE_APROVACAO") return NextResponse.json({ error: "Status inválido para aprovação" }, { status: 400 });
        data.status = "APROVADA";
        break;

      case "reject":
        if (!isAdmin) return NextResponse.json({ error: "Apenas gestores podem rejeitar" }, { status: 403 });
        if (current.status !== "PENDENTE_APROVACAO") return NextResponse.json({ error: "Status inválido para rejeição" }, { status: 400 });
        data.status = "REJEITADA";
        break;

      case "start":
        if (current.status !== "APROVADA") return NextResponse.json({ error: "OS precisa estar aprovada" }, { status: 400 });
        data.status = "EM_EXECUCAO";
        data.startedAt = new Date();
        break;

      case "claim": {
        // Técnico (ou gestor) pega uma OS que está sem técnico designado
        if (current.technicianId) return NextResponse.json({ error: "Esta OS já possui um técnico responsável" }, { status: 400 });
        if (!["PENDENTE_APROVACAO", "APROVADA"].includes(current.status)) {
          return NextResponse.json({ error: "Esta OS não está mais disponível para ser assumida" }, { status: 400 });
        }
        data.technicianId = user?.id;
        // Se já está aprovada, o técnico já inicia a execução no mesmo ato
        if (current.status === "APROVADA") {
          data.status = "EM_EXECUCAO";
          data.startedAt = new Date();
        }
        break;
      }

      case "pause":
        if (current.status !== "EM_EXECUCAO") return NextResponse.json({ error: "Só é possível pausar uma OS em execução" }, { status: 400 });
        if (!isAdmin && current.technicianId !== user?.id) return NextResponse.json({ error: "Apenas o técnico responsável ou o gestor podem pausar" }, { status: 403 });
        data.status = "PAUSADA";
        break;

      case "resume":
        if (current.status !== "PAUSADA") return NextResponse.json({ error: "A OS precisa estar pausada" }, { status: 400 });
        if (!isAdmin && current.technicianId !== user?.id) return NextResponse.json({ error: "Apenas o técnico responsável ou o gestor podem retomar" }, { status: 403 });
        data.status = "EM_EXECUCAO";
        break;

      case "tech_close":
        if (current.status !== "EM_EXECUCAO") return NextResponse.json({ error: "OS precisa estar em execução" }, { status: 400 });
        data.status = "AGUARDANDO_ENCERRAMENTO";
        data.techClosedAt = new Date();
        break;

      case "final_close":
        if (!isAdmin) return NextResponse.json({ error: "Apenas gestores podem encerrar definitivamente" }, { status: 403 });
        if (current.status !== "AGUARDANDO_ENCERRAMENTO") return NextResponse.json({ error: "OS precisa estar aguardando encerramento" }, { status: 400 });
        const now = new Date();
        data.status = "FINALIZADA";
        data.closedAt = now;
        data.closedById = user?.id;
        if (current.startedAt) {
          data.totalTimeMinutes = Math.round((now.getTime() - new Date(current.startedAt).getTime()) / 60000);
        }
        break;

      default:
        return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
    }

    const updated = await prisma.workOrder.update({
      where: { id: params?.id },
      data,
    });
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao atualizar status" }, { status: 500 });
  }
}
