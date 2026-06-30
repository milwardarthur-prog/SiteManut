import AppSidebar from "@/components/app-sidebar";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <AppSidebar>{children}</AppSidebar>;
}
