"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  ClipboardList,
  ClipboardCheck,
  Zap,
  Wrench,
  BarChart3,
  ScanLine,
  LogOut,
  Settings,
  Menu,
  X,
  ChevronLeft,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const adminLinks = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/os", label: "Ordens de Serviço", icon: ClipboardList },
  { href: "/equipamentos", label: "Equipamentos", icon: Wrench },
  { href: "/checklist", label: "Checklist", icon: ClipboardCheck },
  { href: "/testes-carga", label: "Testes de Carga", icon: Zap },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/scanner", label: "Escanear QR", icon: ScanLine },
];

const techLinks = [
  { href: "/os", label: "Minhas OS", icon: ClipboardList },
  { href: "/checklist", label: "Checklist", icon: ClipboardCheck },
  { href: "/testes-carga", label: "Testes de Carga", icon: Zap },
  { href: "/scanner", label: "Escanear QR", icon: ScanLine },
];

export default function AppSidebar({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession() || {};
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);

  const user = session?.user as any;
  const isAdmin = user?.role === "ADMIN";
  const links = isAdmin ? adminLinks : techLinks;

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 h-screen w-64 bg-gray-900 text-white z-50 flex flex-col transition-transform duration-300 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <Link href={isAdmin ? "/dashboard" : "/os"} className="flex items-center gap-3">
            <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <span className="font-display font-bold text-sm tracking-tight">BeltLoc</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {links.map((link: any) => {
            const isActive = pathname === link?.href || pathname?.startsWith(link?.href + "/");
            const Icon = link?.icon;
            return (
              <Link
                key={link?.href}
                href={link?.href ?? "#"}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-orange-500/20 text-orange-400"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {Icon && <Icon className="w-5 h-5" />}
                {link?.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 text-xs font-bold">
              {user?.name?.charAt?.(0)?.toUpperCase?.() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name ?? "Usuário"}</p>
              <p className="text-xs text-gray-400 truncate">
                {isAdmin ? "Gestor" : "Técnico"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-gray-400 hover:text-white hover:bg-gray-800"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sair
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button onClick={() => setMobileOpen(true)} className="text-gray-600">
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-orange-500 rounded-lg flex items-center justify-center">
              <Settings className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-sm">BeltLoc</span>
          </div>
          <div className="w-6" />
        </header>

        <main className="flex-1 p-4 lg:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
