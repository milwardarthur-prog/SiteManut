export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/require-admin";
import { addDays } from "@/lib/horimetro";
import { COLLECTION_FAIL_REASONS } from "@/lib/horimetro-coleta";

// Quantos dias a cobrança de leitura é adiada depois de uma tentativa sem sucesso.
const SNOOZE_DAYS = 3;

// POST — registra "não consegui coletar" para um equipamento: guarda a tentativa
// (quem, quando, por quê) e adia a cobrança, sem criar nenhuma leitura.
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await req.json();
    const equipmentId = String(body?.equipmentId ?? "");
    const reason = String(body?.reason ?? "");
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 500) : null;

    if (!(COLLECTION_FAIL_REASONS as readonly string[]).includes(reason)) {
      return NextResponse.json({ error: "Informe o motivo" }, { status: 400 });
    }
    if (reason === "OUTRO" && !note) {
      return NextResponse.json({ error: "Descreva o motivo" }, { status: 400 });
    }
    const eq = await prisma.equipment.findUnique({ where: { id: equipmentId }, select: { id: true } });
    if (!eq) return NextResponse.json({ error: "Equipamento não encontrado" }, { status: 404 });

    const nextReadingDate = addDays(new Date(), SNOOZE_DAYS);
    const [attempt] = await prisma.$transaction([
      prisma.horimeterCollectionAttempt.create({
        data: { equipmentId, reason, note, createdById: auth.user.userId },
      }),
      prisma.equipment.update({ where: { id: equipmentId }, data: { nextReadingDate } }),
    ]);
    return NextResponse.json({ ok: true, id: attempt.id, nextReadingDate });
  } catch (e) {
    console.error("[horimetros nao-coletado POST]", e);
    return NextResponse.json({ error: "Erro ao registrar a tentativa" }, { status: 500 });
  }
}
