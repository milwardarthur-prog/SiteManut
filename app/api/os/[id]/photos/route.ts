export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { fileName, cloudStoragePath, contentType, isPublic } = await req.json();
    if (!fileName || !cloudStoragePath) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const photo = await prisma.workOrderPhoto.create({
      data: {
        fileName,
        cloudStoragePath,
        contentType: contentType ?? "image/jpeg",
        isPublic: isPublic ?? false,
        workOrderId: params?.id,
      },
    });
    return NextResponse.json(photo, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Erro ao registrar foto" }, { status: 500 });
  }
}
