export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { generatePresignedUploadUrl } from "@/lib/s3";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { fileName, contentType, isPublic } = await req.json();
    if (!fileName || !contentType) {
      return NextResponse.json({ error: "fileName e contentType são obrigatórios" }, { status: 400 });
    }
    const result = await generatePresignedUploadUrl(fileName, contentType, isPublic ?? false);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao gerar URL de upload" }, { status: 500 });
  }
}
