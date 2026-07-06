export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Campos específicos de checklist e teste de carga
const CHECKLIST_FIELDS = ["tankSample", "checkFuelFilter1", "checkFuelFilter2", "checkFuelFilter3"] as const;
const LOADTEST_FIELDS = ["voltageEmpty", "frequencyEmpty", "load", "frequencyLoad"] as const;

// Escopos que ficam fora do fluxo normal e já entram em "Aguardando Encerramento"
const AUTO_AGUARDANDO_SCOPES = ["CHECKLIST", "TESTE_CARGA"];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const user = session.user as any;
  const sp = req.nextUrl?.searchParams;
  const status = sp?.get("status") ?? "";
  const techId = sp?.get("technicianId") ?? "";
  const equipId = sp?.get("equipmentId") ?? "";
  const type = sp?.get("type") ?? "";
  const scope = sp?.get("scope") ?? "";
  const tab = sp?.get("tab") ?? ""; // aba do painel

  try {
    const where: any = {};

    if (user?.role === "TECHNICIAN") {
      where.OR = [
        { technicianId: user.id },
        { helpers: { some: { helperId: user.id } } },
      ];
    }

    // Filtros diretos
    if (status) where.status = status;
    if (techId) where.technicianId = techId;
    if (equipId) where.equipmentId = equipId;
    if (type) where.maintenanceType = type;
    if (scope) where.scope = scope;

    // Lógica das abas do painel
    switch (tab) {
      case "sem_tecnico":
        where.technicianId = null;
        where.deletedAt = null;
        where.status = { notIn: ["FINALIZADA", "REJEITADA"] };
        break;
      case "com_tecnico":
        where.technicianId = { not: null };
        where.deletedAt = null;
        where.status = { in: ["PENDENTE_APROVACAO", "APROVADA"] };
        break;
      case "pendente":
        where.status = "PENDENTE_APROVACAO";
        where.deletedAt = null;
        break;
      case "aprovada":
        where.status = "APROVADA";
        where.deletedAt = null;
        break;
      case "em_execucao":
        where.status = "EM_EXECUCAO";
        where.deletedAt = null;
        break;
      case "aguardando":
        where.status = "AGUARDANDO_ENCERRAMENTO";
        where.deletedAt = null;
        break;
      case "finalizadas":
        where.status = "FINALIZADA";
        where.deletedAt = null;
        break;
      case "rejeitadas":
        where.OR = [{ status: "REJEITADA" }, { deletedAt: { not: null } }];
        // Se técnico, precisa manter também o filtro de propriedade
        if (user?.role === "TECHNICIAN") {
          where.AND = [
            { OR: [{ technicianId: user.id }, { helpers: { some: { helperId: user.id } } }] },
            { OR: [{ status: "REJEITADA" }, { deletedAt: { not: null } }] },
          ];
          delete where.OR;
        }
        break;
      default:
        // Por padrão, esconder as excluídas (soft delete)
        where.deletedAt = null;
        break;
    }

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
    const {
      technicianId,
      equipmentId,
      maintenanceType,
      horimeter,
      comments,
      scope: rawScope,
    } = body ?? {};

    const scope = rawScope || "NORMAL";

    if (!equipmentId) {
      return NextResponse.json({ error: "Equipamento é obrigatório" }, { status: 400 });
    }

    // Checklist, Teste de Carga e Revisão são sempre PREVENTIVA
    let finalType = maintenanceType;
    if (scope === "CHECKLIST" || scope === "TESTE_CARGA" || scope === "REVISAO") {
      finalType = "PREVENTIVA";
    }
    if (!finalType) {
      return NextResponse.json({ error: "Tipo de manutenção é obrigatório" }, { status: 400 });
    }

    const isAdmin = user?.role === "ADMIN";

    // Definir técnico: admin pode deixar sem técnico (null) ou escolher.
    // Técnico comum é auto-atribuído.
    let assignedTech: string | null;
    if (isAdmin) {
      assignedTech = technicianId || null;
    } else {
      assignedTech = user?.id;
    }

    // Checklist e Teste de Carga ficam fora do fluxo normal: já entram em
    // "Aguardando Encerramento". Demais escopos seguem o fluxo de aprovação.
    let initialStatus: string;
    if (AUTO_AGUARDANDO_SCOPES.includes(scope)) {
      initialStatus = "AGUARDANDO_ENCERRAMENTO";
    } else {
      initialStatus = isAdmin ? "APROVADA" : "PENDENTE_APROVACAO";
    }

    const data: any = {
      status: initialStatus,
      maintenanceType: finalType,
      scope,
      horimeter: horimeter ? parseFloat(horimeter) : null,
      comments: comments ?? null,
      technicianId: assignedTech,
      createdById: user?.id,
      equipmentId,
    };

    // Campos de checklist
    if (scope === "CHECKLIST") {
      if (body?.checklistDate) data.checklistDate = new Date(body.checklistDate);
      for (const f of CHECKLIST_FIELDS) {
        if (body?.[f] !== undefined && body?.[f] !== "") data[f] = body[f];
      }
    }

    // Campos de teste de carga
    if (scope === "TESTE_CARGA") {
      if (body?.loadTestDate) data.loadTestDate = new Date(body.loadTestDate);
      for (const f of LOADTEST_FIELDS) {
        if (body?.[f] !== undefined && body?.[f] !== "") data[f] = body[f];
      }
    }

    // Campos de revisão (troca de óleo e filtros)
    if (scope === "REVISAO") {
      if (body?.revisionDate) data.revisionDate = new Date(body.revisionDate);
      if (body?.oilLiters !== undefined && body?.oilLiters !== "") data.oilLiters = String(body.oilLiters);
      if (body?.revisionFilters && typeof body.revisionFilters === "object") {
        data.revisionFilters = JSON.stringify(body.revisionFilters);
      } else if (typeof body?.revisionFilters === "string" && body.revisionFilters) {
        data.revisionFilters = body.revisionFilters;
      }
    }

    const order = await prisma.workOrder.create({
      data,
      include: {
        technician: { select: { id: true, name: true } },
        equipment: { select: { id: true, equipmentNumber: true, name: true } },
      },
    });

    // Comentário inicial no histórico, se houver
    if (comments && String(comments).trim()) {
      await prisma.workOrderComment.create({
        data: { content: String(comments).trim(), workOrderId: order.id, authorId: user?.id },
      });
    }

    // Atualiza horímetro do equipamento se fornecido
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
