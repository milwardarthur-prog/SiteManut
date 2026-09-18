import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { FULL_ACCESS_EMAIL } from "@/lib/access";

export default withAuth(
  function middleware(req) {
    const token = req.nextauth?.token;
    const path = req.nextUrl?.pathname ?? "";

    // Admin-only routes
    const adminRoutes = ["/dashboard", "/equipamentos/novo", "/relatorios", "/horimetros"];
    const isAdminRoute = adminRoutes.some((r: string) => path.startsWith(r));

    if (isAdminRoute && token?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/os", req.url));
    }

    // Estoque é restrito ao usuário com acesso total (não basta ser ADMIN).
    if (path.startsWith("/estoque") && token?.email !== FULL_ACCESS_EMAIL) {
      return NextResponse.redirect(new URL("/horimetros", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }: any) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/os/:path*",
    "/equipamentos/:path*",
    "/checklist/:path*",
    "/testes-carga/:path*",
    "/relatorios/:path*",
    "/horimetros/:path*",
    "/scanner/:path*",
    "/estoque/:path*",
  ],
};
