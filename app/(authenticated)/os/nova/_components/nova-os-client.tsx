"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import Link from "next/link";

export default function NovaOSClient() {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [loading, setLoading] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);

  const [form, setForm] = useState({
    technicianId: "",
    equipmentId: "",
    maintenanceType: "",
    horimeter: "",
    comments: "",
  });

  useEffect(() => {
    fetch("/api/users/technicians").then((r) => r.json()).then(setTechnicians).catch(() => {});
    fetch("/api/equipamentos").then((r) => r.json()).then(setEquipments).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.equipmentId || !form.maintenanceType) {
      toast.error("Equipamento e tipo de manutenção são obrigatórios");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/os", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success(isAdmin ? "OS criada e aprovada!" : "OS criada e enviada para aprovação!");
        router.replace("/os");
      } else {
        const data = await res.json();
        toast.error(data?.error ?? "Erro ao criar OS");
      }
    } catch {
      toast.error("Erro ao criar OS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/os">
          <Button variant="ghost" size="icon" className="text-gray-500">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">Nova OS</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "A OS será criada já aprovada" : "A OS será enviada para aprovação do gestor"}
          </p>
        </div>
      </div>

      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label>Equipamento *</Label>
              <Select value={form.equipmentId} onValueChange={(v: string) => setForm({ ...form, equipmentId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o equipamento" /></SelectTrigger>
                <SelectContent>
                  {(equipments ?? []).map((e: any) => (
                    <SelectItem key={e?.id} value={e?.id ?? ""}>
                      {e?.equipmentNumber} - {e?.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Manutenção *</Label>
              <Select value={form.maintenanceType} onValueChange={(v: string) => setForm({ ...form, maintenanceType: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PREVENTIVA">Preventiva</SelectItem>
                  <SelectItem value="CORRETIVA">Corretiva</SelectItem>
                  <SelectItem value="RETRABALHO">Retrabalho</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isAdmin && (
              <div className="space-y-2">
                <Label>Técnico Responsável</Label>
                <Select value={form.technicianId} onValueChange={(v: string) => setForm({ ...form, technicianId: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o técnico" /></SelectTrigger>
                  <SelectContent>
                    {(technicians ?? []).map((t: any) => (
                      <SelectItem key={t?.id} value={t?.id ?? ""}>{t?.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Horímetro do Equipamento</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="Ex: 1500.5"
                value={form.horimeter}
                onChange={(e: any) => setForm({ ...form, horimeter: e?.target?.value ?? "" })}
              />
            </div>

            <div className="space-y-2">
              <Label>Comentários</Label>
              <Textarea
                placeholder="Descreva o problema ou serviço a ser realizado..."
                value={form.comments}
                onChange={(e: any) => setForm({ ...form, comments: e?.target?.value ?? "" })}
                rows={4}
              />
            </div>

            <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {loading ? "Criando..." : "Criar OS"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
