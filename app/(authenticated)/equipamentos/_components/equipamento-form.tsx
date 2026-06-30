"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { EQUIPMENT_SECTIONS, EXTRA_FIELD_KEYS } from "@/lib/equipment-fields";

type EquipamentoFormProps = {
  // Quando informado, o formulário opera em modo edição
  equipmentId?: string;
  initialData?: Record<string, any> | null;
};

function buildInitialState(initialData?: Record<string, any> | null) {
  const base: Record<string, string> = {
    equipmentNumber: initialData?.equipmentNumber ?? "",
    name: initialData?.name ?? "",
    description: initialData?.description ?? "",
    model: initialData?.model ?? "",
    year: initialData?.year != null ? String(initialData.year) : "",
    currentHorimeter: initialData?.currentHorimeter != null ? String(initialData.currentHorimeter) : "",
    location: initialData?.location ?? "",
    serialNumber: initialData?.serialNumber ?? "",
  };
  for (const key of EXTRA_FIELD_KEYS) {
    base[key] = initialData?.[key] ?? "";
  }
  return base;
}

export default function EquipamentoForm({ equipmentId, initialData }: EquipamentoFormProps) {
  const router = useRouter();
  const isEdit = Boolean(equipmentId);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Record<string, string>>(() => buildInitialState(initialData));

  const update = (field: string, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.equipmentNumber || !form.name) {
      toast.error("Número e nome são obrigatórios");
      return;
    }
    setLoading(true);
    try {
      const url = isEdit ? `/api/equipamentos/${equipmentId}` : "/api/equipamentos";
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(isEdit ? "Equipamento atualizado!" : "Equipamento criado!");
        router.replace(`/equipamentos/${isEdit ? equipmentId : data?.id}`);
      } else {
        const data = await res.json();
        toast.error(data?.error ?? (isEdit ? "Erro ao atualizar" : "Erro ao criar"));
      }
    } catch {
      toast.error(isEdit ? "Erro ao atualizar equipamento" : "Erro ao criar equipamento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href={isEdit ? `/equipamentos/${equipmentId}` : "/equipamentos"}>
          <Button variant="ghost" size="icon" className="text-gray-500"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">
            {isEdit ? "Editar Equipamento" : "Novo Equipamento"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Atualize os dados do equipamento" : "Cadastre um novo equipamento no sistema"}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Identificação */}
        <Card className="border-0 shadow-md">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Identificação</CardTitle></CardHeader>
          <CardContent className="p-6 pt-2 space-y-5">
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
                <Input placeholder="Ex: Galpão A" value={form.location} onChange={(e: any) => update("location", e?.target?.value ?? "")} />
              </div>
              <div className="space-y-2">
                <Label>Número de Série</Label>
                <Input placeholder="N° de série" value={form.serialNumber} onChange={(e: any) => update("serialNumber", e?.target?.value ?? "")} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Seções dinâmicas: Filtros, Componentes, Dimensões */}
        {EQUIPMENT_SECTIONS.map((section) => (
          <Card key={section.title} className="border-0 shadow-md">
            <CardHeader className="pb-2"><CardTitle className="text-sm">{section.title}</CardTitle></CardHeader>
            <CardContent className="p-6 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {section.fields.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label>{field.label}</Label>
                    <Input value={form[field.key] ?? ""} onChange={(e: any) => update(field.key, e?.target?.value ?? "")} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600 text-white" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {loading ? (isEdit ? "Salvando..." : "Criando...") : (isEdit ? "Salvar Alterações" : "Criar Equipamento")}
        </Button>
      </form>
    </div>
  );
}
