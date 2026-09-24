// Envio de notificação push (Web Push) pros dispositivos inscritos de um
// usuário — usado pra avisar o técnico quando uma OS é atribuída a ele ou
// quando alguém escreve algo (comentário/instrução) numa OS que está com ele.
import webpush from "web-push";
import { prisma } from "@/lib/db";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:contato@beltloc.com.br";

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export type PushPayload = { title: string; body: string; url?: string };

export async function sendPushToUser(userId: string | null | undefined, payload: PushPayload): Promise<void> {
  if (!userId || !publicKey || !privateKey) return; // sem usuário ou push não configurado

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        // Inscrição expirada/inválida (dispositivo desinstalou, permissão revogada, etc.)
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        } else {
          console.error("[sendPushToUser]", err?.message ?? err);
        }
      }
    })
  );
}
