export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadRevisionOrder } from "@/lib/revisao-access";
import { isPhotoStorageConfigured, signedPhotoUrls } from "@/lib/photo-storage";
import { checklistItemByKey } from "@/lib/revisao-checklist";

// GET — itens do checklist + fotos (com links temporários pra exibir).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const r = await loadRevisionOrder(params?.id, false);
  if ("error" in r) return r.error;

  try {
    const [items, photos] = await Promise.all([
      prisma.workOrderChecklistItem.findMany({ where: { workOrderId: r.order.id } }),
      prisma.workOrderPhoto.findMany({
        where: { workOrderId: r.order.id, itemKey: { not: null } },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    const urls = await signedPhotoUrls(photos.map((p) => p.cloudStoragePath)).catch(() => new Map<string, string>());
    return NextResponse.json({
      configured: isPhotoStorageConfigured(),
      items: items.map((i) => ({ itemKey: i.itemKey, status: i.status, note: i.note })),
      photos: photos.map((p) => ({ id: p.id, itemKey: p.itemKey, url: urls.get(p.cloudStoragePath) ?? null })),
    });
  } catch (e) {
    console.error("[os checklist GET]", e);
    return NextResponse.json({ error: "Erro ao carregar o checklist" }, { status: 500 });
  }
}

// PUT — grava o status (e a observação) de um item.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await loadRevisionOrder(params?.id, true);
  if ("error" in r) return r.error;

  try {
    const { itemKey, status, note } = await req.json();
    const def = checklistItemByKey(String(itemKey ?? ""));
    if (!def || def.photosOnly) return NextResponse.json({ error: "Item inválido" }, { status: 400 });
    if (!["OK", "ATENCAO", "INDISPONIVEL"].includes(status)) {
      return NextResponse.json({ error: "Status inválido" }, { status: 400 });
    }
    if (status === "INDISPONIVEL" && !def.allowUnavailable) {
      return NextResponse.json({ error: "Este item não aceita “Indisponível”" }, { status: 400 });
    }
    const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 500) : null;

    const saved = await prisma.workOrderChecklistItem.upsert({
      where: { workOrderId_itemKey: { workOrderId: r.order.id, itemKey: def.key } },
      update: { status, note: cleanNote },
      create: { workOrderId: r.order.id, itemKey: def.key, status, note: cleanNote },
    });
    return NextResponse.json({ itemKey: saved.itemKey, status: saved.status, note: saved.note });
  } catch (e) {
    console.error("[os checklist PUT]", e);
    return NextResponse.json({ error: "Erro ao salvar o item" }, { status: 500 });
  }
}
