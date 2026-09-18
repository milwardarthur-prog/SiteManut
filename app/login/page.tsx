import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { FULL_ACCESS_EMAIL } from "@/lib/access";
import { redirect } from "next/navigation";
import LoginForm from "./_components/login-form";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    const user = session.user as any;
    if (user?.role === "ADMIN") {
      redirect(user?.email === FULL_ACCESS_EMAIL ? "/dashboard" : "/horimetros");
    } else {
      redirect("/os");
    }
  }
  return <LoginForm />;
}
