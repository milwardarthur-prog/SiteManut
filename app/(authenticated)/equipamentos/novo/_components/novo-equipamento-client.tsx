"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export default function NovoEquipamentoClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    equipmentNumber: "",
    name: "",
    description: "",
    model: "",
    year: "",
    currentHorimeter: "",
    location: "",
    serialNumber: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.equipmentNumber || !form.name) {
      toast.error("Número e nome são obrigatórios");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/equipamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success("Equipamento criado!");
        router.replace(`/equipamentos/${data?.id}`);
      } else {
        const data = await res.json();
        toast.error(data?.error ?? "Erro ao criar");
      }
    } catch {
      toast.error("Erro ao criar equipamento");
    } finally {
      setLoading(false);
    }
  };

  const update = (field: string, value: string) => setForm({ ...form, [field]: value });

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/equipamentos">
          <Button variant="ghost" size="icon" className="text-gray-500"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">Novo Equipamento</h1>
          <p className="text-sm text-muted-foreground">Cadastre um novo equipamento no sistema</p>
        </div>
      </div>
      <Card className="border-0 shadow-md">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Número/ID *</Label>
                <Input placeholder="Ex: EQ-001" value={form.equipmentNumber} onChange={(e: any) => update("equipmentNumber", e?.target?.value ?? "")} />
              </div>
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input placeholder="Nome do equipamento" value={form.name} onChange={(e: any) => update("name", e?.target?.value ?? "")} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea placeholder="Descrição detalhada" value={form.description} onChange={(e: any) => update("description", e?.target?.value ?? "")} rows={3} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Input placeholder="Ex: CAT 320" value={form.model} onChange={(e: any) => update("model", e?.target?.value ?? "")} />
              </div>
              <div className="space-y-2">
                <Label>Ano</Label>
                <Input type="number" placeholder="Ex: 2022" value={form.year} onChange={(e: any) => update("year", e?.target?.value ?? "")} />
              </div>
              <div className="space-y-2">
                <Label>Horímetro</Label>
                <Input type="number" step="0.1" placeholder="Ex: 1500" value={form.currentHorimeter} onChange={(e: any) => update("currentHorimeter", e?.target?.value ?? "")} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Localização</Label>
                <Input placeholder="Ex: Gálpao A" value={form.location} onChange={(e: any) => update("location", e?.target?.value ?? "")} />
              </div>
              <div className="space-y-2">
                <Label>Número de Série</Label>
                <Input placeholder="N° de série" value={form.serialNumber} onChange={(e: any) => update("serialNumber", e?.target?.value ?? "")} />
              </div>
            </div>
            <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {loading ? "Criando..." : "Criar Equipamento"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
