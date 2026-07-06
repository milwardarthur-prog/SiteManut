"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Papa from "papaparse";
import { ClipboardCheck, Loader2, Search, Upload, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { GE_EQUIPAMENTOS, ordenarEquipamentos } from "@/lib/ge-equipamentos";

type Row = Record<string, string>;

function badgeClass(valor?: string) {
  const v = (valor ?? "").trim().toLowerCase();
  if (!v) return "bg-gray-100 text-gray-500";
  if (v === "boa" || v === "bom") return "bg-green-100 text-green-800";
  if (v === "ruim") return "bg-red-100 text-red-800";
  if (v === "trocado") return "bg-amber-100 text-amber-800";
  return "bg-amber-100 text-amber-800";
}

function Badge({ valor }: { valor?: string }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badgeClass(valor)}`}>
      {valor?.trim() ? valor : "—"}
    </span>
  );
}

export default function ChecklistClient() {
  const { data: session } = useSession() || {};
  const isAdmin = (session?.user as any)?.role === "ADMIN";
  const fileRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/checklist");
      if (res.ok) {
        const { csv } = await res.json();
        if (csv && csv.trim()) {
          const parsed = Papa.parse<Row>(csv, { header: true, skipEmptyLines: true });
          setRows((parsed.data ?? []).filter((r) => r && r.Equipamento));
        } else {
          setRows([]);
        }
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const registrosPor = (nome: string) => rows.filter((r) => r.Equipamento === nome);

  const comDados = useMemo(
    () => GE_EQUIPAMENTOS.filter((e) => rows.some((r) => r.Equipamento === e)).length,
    [rows]
  );

  const listaFiltrada = useMemo(() => {
    const termo = search.toLowerCase();
    return ordenarEquipamentos(GE_EQUIPAMENTOS.filter((e) => e.toLowerCase().includes(termo)));
  }, [search]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = (e.target.files ?? [])[0];
    if (!file) return;
    setUploading(true);
    try {
      const text = await file.text();
      const res = await fetch("/api/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      if (res.ok) {
        toast.success("Checklist importado! Dados substituídos.");
        await load();
      } else {
        const d = await res.json();
        toast.error(d?.error ?? "Erro ao importar");
      }
    } catch {
      toast.error("Erro ao ler o arquivo");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const historico = selected ? [...registrosPor(selected)].reverse() : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center">
            <ClipboardCheck className="w-5 h-5 text-teal-700" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">
              Checklist de Equipamentos
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? "Carregando..." : `${comDados} de ${GE_EQUIPAMENTOS.length} equipamentos com checklist`}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-teal-600 hover:bg-teal-700 text-white">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
              Importar CSV
            </Button>
          </div>
        )}
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
        <Input value={search} onChange={(e: any) => setSearch(e?.target?.value ?? "")} placeholder="Buscar equipamento..." className="pl-9" />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-teal-600" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {listaFiltrada.map((nome) => {
            const registros = registrosPor(nome);
            const ultimo = registros.length > 0 ? registros[registros.length - 1] : null;
            return (
              <Card
                key={nome}
                onClick={() => setSelected(nome)}
                className={`border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${ultimo ? "" : "opacity-70"}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-bold text-gray-900">{nome}</span>
                    {ultimo && <span className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">COM CHECKLIST</span>}
                  </div>
                  {ultimo ? (
                    <div className="space-y-1.5 text-sm">
                      <div className="flex justify-between"><span className="text-muted-foreground">Horímetro</span><span className="font-medium">{ultimo.Horimetro ? `${ultimo.Horimetro} h` : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Responsável</span><span className="font-medium text-right truncate ml-2">{ultimo.Responsavel || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Data</span><span className="font-medium">{ultimo.Data || "—"}</span></div>
                      <hr className="my-2" />
                      <div className="flex justify-between items-center"><span className="text-muted-foreground">Amostra Tanque</span><Badge valor={ultimo.AmostraTanque} /></div>
                      <div className="flex justify-between items-center"><span className="text-muted-foreground">Filtro Comb.</span><Badge valor={ultimo.FiltroCombustivel} /></div>
                      <div className="flex justify-between items-center"><span className="text-muted-foreground">Racor 1</span><Badge valor={ultimo.FiltroRacor1} /></div>
                      <div className="flex justify-between items-center"><span className="text-muted-foreground">Racor 2</span><Badge valor={ultimo.FiltroRacor2} /></div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">Sem checklist registrado</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal histórico */}
      <Dialog open={!!selected} onOpenChange={(o: boolean) => !o && setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-teal-700" /> {selected} — Histórico de Checklists
            </DialogTitle>
          </DialogHeader>
          {historico.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Nenhum checklist registrado para este equipamento.
            </div>
          ) : (
            <div className="space-y-3">
              {historico.map((row, i) => (
                <div key={i} className="border rounded-lg p-3">
                  <div className="flex justify-between text-xs font-medium text-teal-700 mb-2">
                    <span>Registro #{historico.length - i}</span>
                    <span>{row.Data || "—"}</span>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Horímetro</span><span className="font-medium">{row.Horimetro ? `${row.Horimetro} h` : "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Responsável</span><span className="font-medium text-right ml-2">{row.Responsavel || "—"}</span></div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">Amostra do Tanque</span><Badge valor={row.AmostraTanque} /></div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">Filtro Combustível</span><Badge valor={row.FiltroCombustivel} /></div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">Filtro Racor 1</span><Badge valor={row.FiltroRacor1} /></div>
                    <div className="flex justify-between items-center"><span className="text-muted-foreground">Filtro Racor 2</span><Badge valor={row.FiltroRacor2} /></div>
                    {row.Observacao && (
                      <div className="mt-2 p-2 bg-amber-50 rounded border border-amber-100">
                        <span className="text-xs font-medium text-amber-700 block mb-0.5">Observação</span>
                        <span className="text-sm">{row.Observacao}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
