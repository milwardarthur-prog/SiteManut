export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteFile } from "@/lib/s3";

export async function DELETE(req: NextRequest, { params }: { params: { id: string; fileId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas gestores podem remover arquivos" }, { status: 403 });
  }

  try {
    const file = await prisma.equipmentFile.findUnique({ where: { id: params?.fileId } });
    if (!file) return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
    await deleteFile(file.cloudStoragePath).catch(() => {});
    await prisma.equipmentFile.delete({ where: { id: params?.fileId } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Erro ao remover arquivo" }, { status: 500 });
  }
}
