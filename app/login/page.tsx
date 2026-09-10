import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginForm from "./_components/login-form";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    const role = (session.user as any)?.role;
    if (role === "ADMIN") redirect("/horimetros");
    else redirect("/os");
  }
  return <LoginForm />;
}
