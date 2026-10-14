// Reduz a foto no celular antes de enviar: lado maior 1280px, JPEG ~72%.
// Uma foto de câmera (3–5 MB) vira ~100–250 KB — é isso que mantém o
// armazenamento gratuito suficiente por anos.
export async function compressImage(file: File, maxSide = 1280, quality = 0.72): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a foto");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Não foi possível comprimir a foto");
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
