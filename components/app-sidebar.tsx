"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Gauge, LogOut, Settings, Menu, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const adminLinks = [{ href: "/horimetros", label: "Horímetros", icon: Gauge }];

const techLinks: typeof adminLinks = [];

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export default function AppSidebar({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession() || {};
  const pathname = usePathname() ?? "";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {}
      return next;
    });
  };

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
        className={`fixed lg:sticky top-0 left-0 h-screen bg-gray-900 text-white z-50 flex flex-col transition-all duration-300 ${
          collapsed ? "lg:w-[72px]" : "w-64"
        } ${mobileOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div
          className={`flex items-center p-5 border-b border-gray-700 ${
            collapsed ? "lg:justify-center lg:px-0" : "justify-between"
          }`}
        >
          <Link
            href={isAdmin ? "/horimetros" : "/os"}
            className="flex items-center gap-3 overflow-hidden"
          >
            <div className="w-9 h-9 shrink-0 bg-orange-500 rounded-lg flex items-center justify-center">
              <Settings className="w-5 h-5 text-white" />
            </div>
            <span
              className={`font-display font-bold text-sm tracking-tight whitespace-nowrap ${
                collapsed ? "lg:hidden" : ""
              }`}
            >
              BeltLoc
            </span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden text-gray-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto overflow-x-hidden">
          {links.map((link: any) => {
            const isActive = pathname === link?.href || pathname?.startsWith(link?.href + "/");
            const Icon = link?.icon;
            return (
              <Link
                key={link?.href}
                href={link?.href ?? "#"}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? link?.label : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  collapsed ? "lg:justify-center lg:px-0" : ""
                } ${
                  isActive
                    ? "bg-orange-500/20 text-orange-400"
                    : "text-gray-300 hover:bg-gray-800 hover:text-white"
                }`}
              >
                {Icon && <Icon className="w-5 h-5 shrink-0" />}
                <span className={collapsed ? "lg:hidden" : ""}>{link?.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <div
            className={`flex items-center gap-3 mb-3 px-1 ${
              collapsed ? "lg:justify-center" : ""
            }`}
          >
            <div className="w-8 h-8 shrink-0 bg-orange-500/20 rounded-full flex items-center justify-center text-orange-400 text-xs font-bold">
              {user?.name?.charAt?.(0)?.toUpperCase?.() ?? "U"}
            </div>
            <div className={`flex-1 min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
              <p className="text-sm font-medium truncate">{user?.name ?? "Usuário"}</p>
              <p className="text-xs text-gray-400 truncate">
                {isAdmin ? "Gestor" : "Técnico"}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            title={collapsed ? "Sair" : undefined}
            className={`w-full text-gray-400 hover:text-white hover:bg-gray-800 ${
              collapsed ? "lg:justify-center lg:px-0" : "justify-start"
            }`}
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className={`w-4 h-4 shrink-0 ${collapsed ? "" : "mr-2"}`} />
            <span className={collapsed ? "lg:hidden" : ""}>Sair</span>
          </Button>
          <button
            onClick={toggleCollapsed}
            className={`hidden lg:flex items-center justify-center gap-2 w-full mt-2 py-2 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-gray-800 transition-colors`}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && "Minimizar"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
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
