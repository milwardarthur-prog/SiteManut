export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import crypto from "crypto";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  try {
    const search = req.nextUrl?.searchParams?.get("search") ?? "";
    const where = search
      ? {
          OR: [
            { equipmentNumber: { contains: search } },
            { name: { contains: search } },
          ],
        }
      : {};
    const equipments = await prisma.equipment.findMany({
      where,
      include: { _count: { select: { workOrders: true, files: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(equipments);
  } catch {
    return NextResponse.json({ error: "Erro ao buscar equipamentos" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  if ((session.user as any)?.role !== "ADMIN") {
    return NextResponse.json({ error: "Apenas gestores podem criar equipamentos" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { equipmentNumber, name, description, model, year, currentHorimeter, location, serialNumber } = body ?? {};
    if (!equipmentNumber || !name) {
      return NextResponse.json({ error: "Número e nome são obrigatórios" }, { status: 400 });
    }
    const existing = await prisma.equipment.findUnique({ where: { equipmentNumber } });
    if (existing) {
      return NextResponse.json({ error: "Número de equipamento já existe" }, { status: 400 });
    }
    const qrCodeData = `BELTLOC-${equipmentNumber}-${crypto.randomBytes(4).toString("hex")}`;
    const equipment = await prisma.equipment.create({
      data: {
        equipmentNumber,
        name,
        description: description ?? null,
        model: model ?? null,
        year: year ? parseInt(year) : null,
        currentHorimeter: currentHorimeter ? parseFloat(currentHorimeter) : 0,
        location: location ?? null,
        serialNumber: serialNumber ?? null,
        qrCodeData,
      },
    });
    return NextResponse.json(equipment, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Erro ao criar equipamento" }, { status: 500 });
  }
}
