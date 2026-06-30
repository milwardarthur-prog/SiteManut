export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Public endpoint - QR code scan should work without login
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  try {
    const code = decodeURIComponent(params?.code ?? "");
    const equipment = await prisma.equipment.findUnique({
      where: { qrCodeData: code },
      include: {
        files: { orderBy: { createdAt: "desc" } },
        workOrders: {
          where: { status: "FINALIZADA" },
          include: {
            technician: { select: { id: true, name: true } },
            parts: true,
            helpers: { include: { helper: { select: { id: true, name: true } } } },
          },
          orderBy: { closedAt: "desc" },
        },
      },
    });
    if (!equipment) return NextResponse.json({ error: "Equipamento não encontrado" }, { status: 404 });
    return NextResponse.json(equipment);
  } catch {
    return NextResponse.json({ error: "Erro ao buscar equipamento" }, { status: 500 });
  }
}
