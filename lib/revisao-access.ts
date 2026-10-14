import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const TECH_EDITABLE = ["APROVADA", "EM_EXECUCAO", "PAUSADA"];

// Valida sessão + OS de Revisão. Com `write`, exige também que o usuário seja
// gestor, técnico responsável ou ajudante e que a OS ainda esteja editável.
export async function loadRevisionOrder(orderId: string, write: boolean) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Não autorizado" }, { status: 401 }) } as const;
  const user = session.user as any;
  const isAdmin = user?.role === "ADMIN";

  const order = await prisma.workOrder.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      scope: true,
      status: true,
      deletedAt: true,
      technicianId: true,
      voltageEmpty: true,
      frequencyEmpty: true,
      helpers: { where: { endTime: null }, select: { helperId: true } },
    },
  });
  if (!order || order.deletedAt) return { error: NextResponse.json({ error: "OS não encontrada" }, { status: 404 }) } as const;
  if (order.scope !== "REVISAO") {
    return { error: NextResponse.json({ error: "Checklist de fotos só existe na OS de Revisão" }, { status: 400 }) } as const;
  }

  if (write) {
    const mine = order.technicianId === user?.id || order.helpers.some((h) => h.helperId === user?.id);
    if (!isAdmin && !mine) {
      return { error: NextResponse.json({ error: "Apenas o técnico responsável ou o gestor podem editar" }, { status: 403 }) } as const;
    }
    const editable = TECH_EDITABLE.includes(order.status) || (isAdmin && order.status === "AGUARDANDO_ENCERRAMENTO");
    if (!editable) {
      return { error: NextResponse.json({ error: "Esta OS não pode mais ser alterada" }, { status: 400 }) } as const;
    }
  }
  return { order, user, isAdmin } as const;
}
