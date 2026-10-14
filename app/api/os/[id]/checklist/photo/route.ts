export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db";
import { loadRevisionOrder } from "@/lib/revisao-access";
import { deletePhoto, isPhotoStorageConfigured, uploadPhoto } from "@/lib/photo-storage";
import { checklistItemByKey } from "@/lib/revisao-checklist";

const MAX_BYTES = 4 * 1024 * 1024; // a tela já reduz a foto; isso só protege o servidor
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// POST — recebe 1 foto (multipart: itemKey + file) e guarda no Storage.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await loadRevisionOrder(params?.id, true);
  if ("error" in r) return r.error;
  if (!isPhotoStorageConfigured()) {
    return NextResponse.json({ error: "Armazenamento de fotos não configurado" }, { status: 503 });
  }

  try {
    const form = await req.formData();
    const def = checklistItemByKey(String(form.get("itemKey") ?? ""));
    const file = form.get("file");
    if (!def) return NextResponse.json({ error: "Item inválido" }, { status: 400 });
    if (!(file instanceof File)) return NextResponse.json({ error: "Foto não enviada" }, { status: 400 });
    const ext = EXT[file.type];
    if (!ext) return NextResponse.json({ error: "Formato de imagem não aceito" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Foto muito grande" }, { status: 413 });

    const count = await prisma.workOrderPhoto.count({ where: { workOrderId: r.order.id, itemKey: def.key } });
    if (count >= def.maxPhotos) {
      return NextResponse.json({ error: `Este item aceita no máximo ${def.maxPhotos} foto(s)` }, { status: 400 });
    }

    const path = `os/${r.order.id}/${def.key}/${Date.now()}-${randomBytes(4).toString("hex")}.${ext}`;
    await uploadPhoto(path, Buffer.from(await file.arrayBuffer()), file.type);
    try {
      const photo = await prisma.workOrderPhoto.create({
        data: {
          workOrderId: r.order.id,
          itemKey: def.key,
          fileName: `${def.key}.${ext}`,
          cloudStoragePath: path,
          contentType: file.type,
        },
      });
      return NextResponse.json({ id: photo.id, itemKey: photo.itemKey }, { status: 201 });
    } catch (e) {
      await deletePhoto(path).catch(() => {});
      throw e;
    }
  } catch (e) {
    console.error("[os checklist photo POST]", e);
    return NextResponse.json({ error: "Erro ao enviar a foto" }, { status: 500 });
  }
}

// DELETE — remove uma foto do checklist (?photoId=...).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const r = await loadRevisionOrder(params?.id, true);
  if ("error" in r) return r.error;

  try {
    const photoId = req.nextUrl.searchParams.get("photoId") ?? "";
    const photo = await prisma.workOrderPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.workOrderId !== r.order.id || !photo.itemKey) {
      return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
    }
    await deletePhoto(photo.cloudStoragePath).catch((e) => console.error("[checklist photo delete storage]", e));
    await prisma.workOrderPhoto.delete({ where: { id: photo.id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[os checklist photo DELETE]", e);
    return NextResponse.json({ error: "Erro ao apagar a foto" }, { status: 500 });
  }
}
