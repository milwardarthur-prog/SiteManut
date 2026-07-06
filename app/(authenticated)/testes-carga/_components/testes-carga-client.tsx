"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Papa from "papaparse";
import { Zap, Loader2, Search, Upload, FolderOpen, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { GE_EQUIPAMENTOS, ordenarEquipamentos } from "@/lib/ge-equipamentos";

type Row = Record<string, string>;

export default function TestesCargaClient() {
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
      const res = await fetch("/api/testes-carga");
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
      const res = await fetch("/api/testes-carga", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text }),
      });
      if (res.ok) {
        toast.success("Testes de carga importados! Dados substituídos.");
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
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-indigo-700" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight text-gray-900">
              Testes de Carga
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? "Carregando..." : `${comDados} de ${GE_EQUIPAMENTOS.length} equipamentos com testes`}
            </p>
          </div>
        </div>
        {isAdmin && (
          <div>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleImport} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="bg-indigo-600 hover:bg-indigo-700 text-white">
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
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          {listaFiltrada.map((nome) => {
            const testado = rows.some((r) => r.Equipamento === nome);
            return (
              <Card
                key={nome}
                onClick={() => setSelected(nome)}
                className={`border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${testado ? "" : "opacity-70"}`}
              >
                <CardContent className="p-3 text-center">
                  <span className="font-mono font-bold text-sm text-gray-900 block">{nome}</span>
                  {testado ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 mt-2 rounded-full bg-green-100 text-green-700 font-medium">
                      <CheckCircle2 className="w-3 h-3" /> TESTADO
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground mt-2 block">sem teste</span>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal histórico */}
      <Dialog open={!!selected} onOpenChange={(o: boolean) => !o && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-700" /> {selected} — Histórico de Testes
            </DialogTitle>
          </DialogHeader>
          {historico.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="w-8 h-8 mx-auto mb-2 opacity-50" />
              Nenhum histórico encontrado para este equipamento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 px-2 font-medium">Data</th>
                    <th className="py-2 px-2 font-medium">Tensão</th>
                    <th className="py-2 px-2 font-medium">Vazio (Hz)</th>
                    <th className="py-2 px-2 font-medium">Carga (A)</th>
                    <th className="py-2 px-2 font-medium">Carga (Hz)</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.map((row, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-2 px-2">{row.Data || "—"}</td>
                      <td className="py-2 px-2">{row.Tensao_Vazio || "—"}</td>
                      <td className="py-2 px-2">{row.Frequencia_Vazio || "—"}</td>
                      <td className="py-2 px-2">{row.Amperagem || "—"}</td>
                      <td className="py-2 px-2">{row.Frequencia_Carga || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
