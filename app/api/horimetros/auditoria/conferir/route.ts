export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { canAudit } from "@/lib/access";
import { isValidAlertKey, loadReviews, saveReviews } from "@/lib/horimetro-audit-review";

// POST — dá "OK" (conferido) em um ou mais alertas, ou desfaz (undo: true).
export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!canAudit(auth.user.email)) return NextResponse.json({ error: "Acesso restrito" }, { status: 403 });

  try {
    const body = await req.json();
    const keys: unknown[] = Array.isArray(body?.keys) ? body.keys : [];
    if (keys.length === 0 || keys.length > 300 || !keys.every(isValidAlertKey)) {
      return NextResponse.json({ error: "Alertas inválidos" }, { status: 400 });
    }
    const note = typeof body?.note === "string" && body.note.trim() ? body.note.trim().slice(0, 300) : null;

    const reviews = await loadReviews();
    if (body?.undo) {
      for (const k of keys as string[]) delete reviews[k];
    } else {
      const at = new Date().toISOString();
      for (const k of keys as string[]) reviews[k] = { by: auth.user.name, at, note };
    }
    await saveReviews(reviews);
    return NextResponse.json({ ok: true, count: keys.length });
  } catch (e) {
    console.error("[horimetros auditoria conferir POST]", e);
    return NextResponse.json({ error: "Erro ao registrar a conferência" }, { status: 500 });
  }
}
