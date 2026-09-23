// E-mails dos usuários com acesso liberado a todos os módulos do sistema
// (os demais gestores usam apenas o Horímetros). Ver components/app-sidebar.tsx.
export const FULL_ACCESS_EMAILS = ["milwardarthur@gmail.com", "manutencao@beltloc.com.br"];

export function hasFullAccess(email: string | null | undefined): boolean {
  return !!email && FULL_ACCESS_EMAILS.includes(email);
}
