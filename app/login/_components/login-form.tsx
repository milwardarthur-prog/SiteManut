"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Settings, LogIn, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Preencha todos os campos");
      return;
    }
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        redirect: false,
        email,
        password,
      });
      if (result?.error) {
        toast.error("Email ou senha inválidos");
      } else {
        router.replace("/");
      }
    } catch {
      toast.error("Erro ao fazer login");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 via-white to-gray-50">
      <div className="w-full max-w-md mx-4">
        <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-100">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-orange-500 rounded-xl flex items-center justify-center mb-4 shadow-md">
              <Settings className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">
              Manutenção BeltLoc
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sistema de Gerenciamento de Ordens de Serviço
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e: any) => setEmail(e?.target?.value ?? "")}
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="Sua senha"
                  value={password}
                  onChange={(e: any) => setPassword(e?.target?.value ?? "")}
                  className="h-11 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 bg-orange-500 hover:bg-orange-600 text-white"
              disabled={loading}
            >
              {loading ? "Entrando..." : "Entrar"}
              {!loading && <LogIn className="w-4 h-4 ml-2" />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
