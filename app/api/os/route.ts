export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hasFullAccess } from "@/lib/access";

// Campos específicos de checklist e teste de carga
const CHECKLIST_FIELDS = ["tankSample", "checkFuelFilter1", "checkFuelFilter2", "checkFuelFilter3"] as const;
const LOADTEST_FIELDS = ["voltageEmpty", "frequencyEmpty", "load", "frequencyLoad"] as const;

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
        // OS disponíveis para qualquer técnico assumir — remove a restrição
        // de propriedade para que técnicos também vejam as OS sem responsável.
        delete where.OR;
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
      case "pausada":
        where.status = "PAUSADA";
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
      case "meu_ativo":
        // Quadro do próprio técnico: só as OS ativas atribuídas a ele
        // (exclui finalizadas/rejeitadas — essas ficam nas abas de histórico).
        delete where.OR;
        where.technicianId = user?.id;
        where.deletedAt = null;
        where.status = { notIn: ["FINALIZADA", "REJEITADA"] };
        break;
      case "monitor":
        // Quadro de monitoramento (arrastar-e-soltar por técnico) — mostra
        // todo trabalho ativo de todos os técnicos, então é restrito a quem
        // tem acesso total (mesmo critério do Estoque).
        if (!hasFullAccess(user?.email)) {
          return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });
        }
        delete where.OR;
        where.deletedAt = null;
        where.status = { notIn: ["FINALIZADA", "REJEITADA"] };
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
      customEquipmentLabel: rawLabel,
      maintenanceType,
      horimeter,
      comments,
      scope: rawScope,
    } = body ?? {};

    const scope = rawScope || "NORMAL";
    const customEquipmentLabel = typeof rawLabel === "string" ? rawLabel.trim() : "";

    // Item sem patrimônio cadastrado (ex.: em fabricação) só faz sentido pra
    // OS Normal — Checklist/Teste de Carga/Revisão dependem de dados já
    // cadastrados no equipamento (filtros, horímetro, etc.).
    if (!equipmentId && (scope !== "NORMAL" || !customEquipmentLabel)) {
      return NextResponse.json(
        { error: scope === "NORMAL" ? "Informe o equipamento ou uma descrição do item" : "Equipamento é obrigatório" },
        { status: 400 }
      );
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

    // Definir técnico: admin pode escolher qualquer um ou deixar sem técnico.
    // Técnico comum só escolhe entre "eu mesmo" (padrão) ou sem técnico — a
    // escolha de um colega específico é exclusiva do gestor. O servidor nunca
    // confia num technicianId vindo de um técnico que não seja o próprio id.
    let assignedTech: string | null;
    if (isAdmin) {
      assignedTech = technicianId || null;
    } else {
      assignedTech = technicianId === "NONE" ? null : user?.id;
    }

    // Não há mais etapa de aprovação — toda OS nasce já liberada para
    // execução, com ou sem técnico designado (quem cria escolhe).
    const initialStatus: string = "APROVADA";

    const data: any = {
      status: initialStatus,
      maintenanceType: finalType,
      scope,
      horimeter: horimeter ? parseFloat(horimeter) : null,
      comments: comments ?? null,
      technicianId: assignedTech,
      createdById: user?.id,
      equipmentId: equipmentId || null,
      customEquipmentLabel: equipmentId ? null : customEquipmentLabel,
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

    // Atualiza horímetro do equipamento se fornecido (só existe quando há
    // um equipamento de verdade vinculado)
    if (horimeter && equipmentId) {
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
