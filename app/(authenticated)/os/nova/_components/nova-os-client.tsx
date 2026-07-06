"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Loader2, ClipboardList, Wrench, Gauge } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import Link from "next/link";

const scopeOptions = [
  { value: "NORMAL", label: "OS Normal", icon: Wrench, desc: "Manutenção preventiva, corretiva ou retrabalho" },
  { value: "CHECKLIST", label: "Checklist (retorno de locação)", icon: ClipboardList, desc: "Preventiva — checagem ao retornar da locação" },
  { value: "TESTE_CARGA", label: "Teste de Carga", icon: Gauge, desc: "Preventiva — medições de teste de carga" },
];

function todayStr() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 10);
}

// Botões de opção (radio visual)
function OptionGroup({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? "" : opt.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
              value === opt.value
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white text-gray-700 border-gray-300 hover:border-orange-400"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function NovaOSClient() {
  const { data: session } = useSession() || {};
  const router = useRouter();
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const [loading, setLoading] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);

  const [scope, setScope] = useState("NORMAL");

  const [form, setForm] = useState({
    technicianId: "",
    equipmentId: "",
    maintenanceType: "",
    horimeter: "",
    comments: "",
  });

  // Checklist
  const [checklist, setChecklist] = useState({
    checklistDate: todayStr(),
    tankSample: "",
    checkFuelFilter1: "",
    checkFuelFilter2: "",
    checkFuelFilter3: "",
  });

  // Teste de carga
  const [loadTest, setLoadTest] = useState({
    loadTestDate: todayStr(),
    voltageEmpty: "",
    frequencyEmpty: "",
    load: "",
    frequencyLoad: "",
  });

  useEffect(() => {
    fetch("/api/users/technicians").then((r) => r.json()).then(setTechnicians).catch(() => {});
    fetch("/api/equipamentos").then((r) => r.json()).then(setEquipments).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.equipmentId) {
      toast.error("Equipamento é obrigatório");
      return;
    }
    if (scope === "NORMAL" && !form.maintenanceType) {
      toast.error("Tipo de manutenção é obrigatório");
      return;
    }
    setLoading(true);
    try {
      const payload: any = {
        scope,
        equipmentId: form.equipmentId,
        technicianId: form.technicianId === "NONE" ? "" : form.technicianId,
        horimeter: form.horimeter,
        comments: form.comments,
      };
      if (scope === "NORMAL") {
        payload.maintenanceType = form.maintenanceType;
      } else if (scope === "CHECKLIST") {
        Object.assign(payload, checklist);
      } else if (scope === "TESTE_CARGA") {
        Object.assign(payload, loadTest);
      }

      const res = await fetch("/api/os", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
            {/* Seletor de escopo */}
            <div className="space-y-2">
              <Label>Tipo de OS *</Label>
              <div className="grid gap-2">
                {scopeOptions.map((opt) => {
                  const Icon = opt.icon;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setScope(opt.value)}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                        scope === opt.value
                          ? "border-orange-500 bg-orange-50"
                          : "border-gray-200 hover:border-orange-300"
                      }`}
                    >
                      <Icon className={`w-5 h-5 mt-0.5 ${scope === opt.value ? "text-orange-600" : "text-gray-400"}`} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Equipamento — comum a todos */}
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

            {/* Tipo de manutenção — só NORMAL */}
            {scope === "NORMAL" && (
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
            )}

            {(scope === "CHECKLIST" || scope === "TESTE_CARGA") && (
              <p className="text-xs bg-blue-50 text-blue-700 rounded-md px-3 py-2">
                Esta OS será registrada como <strong>Manutenção Preventiva</strong>.
              </p>
            )}

            {/* Técnico (admin) — com opção "sem técnico" */}
            {isAdmin && (
              <div className="space-y-2">
                <Label>Técnico Responsável</Label>
                <Select value={form.technicianId} onValueChange={(v: string) => setForm({ ...form, technicianId: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o técnico" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Sem técnico (atribuir depois)</SelectItem>
                    {(technicians ?? []).map((t: any) => (
                      <SelectItem key={t?.id} value={t?.id ?? ""}>{t?.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Horímetro — comum */}
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

            {/* Campos CHECKLIST */}
            {scope === "CHECKLIST" && (
              <div className="space-y-5 border-t pt-5">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={checklist.checklistDate}
                    onChange={(e: any) => setChecklist({ ...checklist, checklistDate: e?.target?.value ?? "" })}
                  />
                </div>
                <OptionGroup
                  label="Amostra do Tanque"
                  value={checklist.tankSample}
                  onChange={(v) => setChecklist({ ...checklist, tankSample: v })}
                  options={[{ value: "BOA", label: "Boa" }, { value: "RUIM", label: "Ruim" }]}
                />
                <OptionGroup
                  label="Filtro de Combustível 1"
                  value={checklist.checkFuelFilter1}
                  onChange={(v) => setChecklist({ ...checklist, checkFuelFilter1: v })}
                  options={[{ value: "BOM", label: "Bom" }, { value: "TROCADO", label: "Trocado" }]}
                />
                <OptionGroup
                  label="Filtro de Combustível 2"
                  value={checklist.checkFuelFilter2}
                  onChange={(v) => setChecklist({ ...checklist, checkFuelFilter2: v })}
                  options={[{ value: "BOM", label: "Bom" }, { value: "TROCADO", label: "Trocado" }, { value: "NAO_APLICA", label: "Não se aplica" }]}
                />
                <OptionGroup
                  label="Filtro de Combustível 3"
                  value={checklist.checkFuelFilter3}
                  onChange={(v) => setChecklist({ ...checklist, checkFuelFilter3: v })}
                  options={[{ value: "BOM", label: "Bom" }, { value: "TROCADO", label: "Trocado" }, { value: "NAO_APLICA", label: "Não se aplica" }]}
                />
              </div>
            )}

            {/* Campos TESTE DE CARGA */}
            {scope === "TESTE_CARGA" && (
              <div className="space-y-4 border-t pt-5">
                <div className="space-y-2">
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={loadTest.loadTestDate}
                    onChange={(e: any) => setLoadTest({ ...loadTest, loadTestDate: e?.target?.value ?? "" })}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Tensão Vazio</Label>
                    <Input value={loadTest.voltageEmpty} onChange={(e: any) => setLoadTest({ ...loadTest, voltageEmpty: e?.target?.value ?? "" })} placeholder="Ex: 220V" />
                  </div>
                  <div className="space-y-2">
                    <Label>Frequência Vazio</Label>
                    <Input value={loadTest.frequencyEmpty} onChange={(e: any) => setLoadTest({ ...loadTest, frequencyEmpty: e?.target?.value ?? "" })} placeholder="Ex: 60Hz" />
                  </div>
                  <div className="space-y-2">
                    <Label>Carga</Label>
                    <Input value={loadTest.load} onChange={(e: any) => setLoadTest({ ...loadTest, load: e?.target?.value ?? "" })} placeholder="Ex: 100kW" />
                  </div>
                  <div className="space-y-2">
                    <Label>Frequência com Carga</Label>
                    <Input value={loadTest.frequencyLoad} onChange={(e: any) => setLoadTest({ ...loadTest, frequencyLoad: e?.target?.value ?? "" })} placeholder="Ex: 59.8Hz" />
                  </div>
                </div>
              </div>
            )}

            {/* Comentários — comum */}
            <div className="space-y-2">
              <Label>{scope === "NORMAL" ? "Comentários" : "Comentários Técnicos"}</Label>
              <Textarea
                placeholder="Descreva o problema, serviço ou observações..."
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
