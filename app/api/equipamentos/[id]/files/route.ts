export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas gestores podem enviar arquivos" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { fileName, cloudStoragePath, contentType, isPublic, fileSize } = body ?? {};
    if (!fileName || !cloudStoragePath) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const file = await prisma.equipmentFile.create({
      data: {
        fileName,
        cloudStoragePath,
        contentType: contentType ?? "application/pdf",
        isPublic: isPublic ?? false,
        fileSize: fileSize ?? null,
        equipmentId: params?.id,
      },
    });
    return NextResponse.json(file, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao registrar arquivo" }, { status: 500 });
  }
}
