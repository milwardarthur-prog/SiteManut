export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getFileUrl } from "@/lib/s3";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const { cloudStoragePath, contentType, isPublic } = await req.json();
    if (!cloudStoragePath) {
      return NextResponse.json({ error: "cloudStoragePath é obrigatório" }, { status: 400 });
    }
    const url = await getFileUrl(cloudStoragePath, contentType ?? "application/octet-stream", isPublic ?? false);
    return NextResponse.json({ url });
  } catch (error: any) {
    return NextResponse.json({ error: "Erro ao gerar URL" }, { status: 500 });
  }
}
