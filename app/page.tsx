import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (session) {
    const role = (session.user as any)?.role;
    if (role === "ADMIN") redirect("/horimetros");
    else redirect("/os");
  }
  redirect("/login");
}
