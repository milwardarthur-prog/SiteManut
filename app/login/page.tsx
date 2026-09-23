import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasFullAccess } from "@/lib/access";
import { redirect } from "next/navigation";
import LoginForm from "./_components/login-form";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    const user = session.user as any;
    if (user?.role === "ADMIN") {
      redirect(hasFullAccess(user?.email) ? "/dashboard" : "/horimetros");
    } else {
      redirect("/os");
    }
  }
  return <LoginForm />;
}
