export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const techs = await prisma.user.findMany({
      where: { role: "TECHNICIAN" },
      select: { id: true, email: true, name: true, role: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json(techs);
  } catch {
    return NextResponse.json({ error: "Erro ao buscar técnicos" }, { status: 500 });
  }
}
