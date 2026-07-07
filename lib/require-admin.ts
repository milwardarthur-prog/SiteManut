import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export type AdminSession = { userId: string; name: string; email: string };

/**
 * Garante que há uma sessão autenticada e que o usuário é ADMIN.
 * Retorna { ok: true, user } ou { ok: false, status, error } para a rota
 * responder de forma consistente.
 */
export async function requireAdmin(): Promise<
  | { ok: true; user: AdminSession }
  | { ok: false; status: number; error: string }
> {
  const session = await getServerSession(authOptions);
  if (!session) return { ok: false, status: 401, error: "Não autorizado" };
  const u = session.user as any;
  if (u?.role !== "ADMIN") {
    return { ok: false, status: 403, error: "Acesso restrito ao gestor (ADMIN)" };
  }
  return { ok: true, user: { userId: u.id, name: u.name, email: u.email } };
}
