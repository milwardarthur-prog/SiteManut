// Conferências da auditoria: o gestor dá "OK" num alerta (o horímetro está
// certo) e ele sai da lista de pendentes. Guardado como JSON no DataStore, pra
// não exigir tabela nova. A chave do alerta inclui tipo e data, então um
// problema novo na mesma máquina aparece de novo normalmente.
import { prisma } from "@/lib/db";

const STORE_KEY = "horimetro_audit_reviews";

export type AuditReview = { by: string; at: string; note: string | null };
export type AuditReviews = Record<string, AuditReview>;

export const alertKey = (a: { equipmentId: string; type: string; date: string }) =>
  `${a.equipmentId}|${a.type}|${a.date}`;

export const isValidAlertKey = (k: unknown): k is string =>
  typeof k === "string" && k.length < 120 && /^[^|]+\|[A-Z_]+\|\d{4}-\d{2}-\d{2}$/.test(k);

export async function loadReviews(): Promise<AuditReviews> {
  const row = await prisma.dataStore.findUnique({ where: { key: STORE_KEY } });
  if (!row?.content) return {};
  try {
    const parsed = JSON.parse(row.content);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveReviews(reviews: AuditReviews): Promise<void> {
  const content = JSON.stringify(reviews);
  await prisma.dataStore.upsert({
    where: { key: STORE_KEY },
    update: { content },
    create: { key: STORE_KEY, content },
  });
}
