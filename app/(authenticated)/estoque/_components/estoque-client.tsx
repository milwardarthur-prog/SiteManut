"use client";

import { useEffect, useRef, useState } from "react";
import { Package, Upload, Loader2, AlertTriangle, ClipboardList, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { decodeCsvBuffer } from "@/lib/csv";

type StockItem = { id: string; name: string; price: number };
type ImportHistory = {
  id: string;
  fileName: string;
  createdCount: number;
  updatedCount: number;
  errorCount: number;
  createdAt: string;
  createdBy: { name: string } | null;
};
type Preview = {
  nameColumn: string;
  priceColumn: string;
  toCreate: { name: string; price: number }[];
  toUpdate: { name: string; price: number; previousPrice: number }[];
  unchanged: number;
  duplicates: string[];
  errorRows: { line: number; message: string }[];
  skippedNoPrice: number;
};

const fmtPrice = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function EstoqueClient() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [search, setSearch] = useState("");

  const [history, setHistory] = useState<ImportHistory[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [blocking, setBlocking] = useState<string[]>([]);
  const [canConfirm, setCanConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadItems = async () => {
    setLoadingItems(true);
    try {
      const res = await fetch("/api/estoque");
      if (res.ok) setItems((await res.json()).items ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoadingItems(false);
    }
  };

  const loadHistory = async () => {
    try {
      const res = await fetch("/api/estoque/import");
      if (res.ok) setHistory((await res.json()).history ?? []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    loadItems();
    loadHistory();
  }, []);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = (e.target.files ?? [])[0];
    if (!f) return;
    setFileName(f.name);
    const reader = new FileReader();
    reader.onload = () => {
      const text = decodeCsvBuffer(reader.result as ArrayBuffer);
      setCsv(text);
      doPreview(text, f.name);
    };
    reader.readAsArrayBuffer(f);
  };

  const doPreview = async (text: string, name: string) => {
    setLoading(true);
    setPreview(null);
    try {
      const res = await fetch("/api/estoque/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv: text, mode: "preview", fileName: name }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Erro ao processar arquivo.");
        return;
      }
      setPreview(data.preview);
      setBlocking(data.blocking ?? []);
      setCanConfirm(!!data.canConfirm);
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const cancelPreview = () => {
    setPreview(null);
    setCsv("");
    setFileName("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const confirm = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/estoque/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode: "confirm", fileName }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Importação bloqueada.");
        return;
      }
      toast.success("Estoque atualizado com sucesso.");
      cancelPreview();
      loadItems();
      loadHistory();
    } catch {
      toast.error("Falha de conexão.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Package className="w-5 h-5 text-orange-500" /> Estoque
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Lista de itens (nome e preço), atualizada via importação de CSV.
        </p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-600">
              O CSV deve ter uma coluna com o <strong>nome do item</strong> e outra com o <strong>preço</strong>.
              Itens já cadastrados (mesmo nome) têm o preço atualizado; itens novos são criados. Nada é removido
              automaticamente.
            </p>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
          <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={loading}>
            <Upload className="w-4 h-4" /> Selecionar CSV
          </Button>
          {fileName && <span className="text-sm text-gray-500 ml-2">{fileName}</span>}
        </CardContent>
      </Card>

      {loading && !preview && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Processando...
        </div>
      )}

      {preview && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold text-gray-800">Prévia da importação</h3>
            <p className="text-xs text-gray-500">
              Coluna de nome: <strong>{preview.nameColumn}</strong> · Coluna de preço: <strong>{preview.priceColumn}</strong>
              {" "}— confira se bateram com o esperado antes de confirmar.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <MiniStat label="Itens novos" value={preview.toCreate.length} color="text-green-600" />
              <MiniStat label="Preços atualizados" value={preview.toUpdate.length} color="text-blue-600" />
              <MiniStat label="Sem alteração" value={preview.unchanged} />
              <MiniStat label="Sem preço (ignorados)" value={preview.skippedNoPrice ?? 0} color="text-amber-600" />
              <MiniStat label="Linhas com erro" value={preview.errorRows?.length ?? 0} color="text-red-600" />
            </div>

            {preview.duplicates.length > 0 && (
              <p className="text-xs text-amber-600">
                Nomes duplicados no arquivo (usado o preço da última ocorrência): {preview.duplicates.join(", ")}
              </p>
            )}

            {blocking.length > 0 && (
              <div className="rounded border border-red-200 bg-red-50 p-3 text-sm space-y-1">
                <div className="font-medium text-red-700 flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4" /> Corrija antes de confirmar:
                </div>
                {blocking.map((b, i) => (
                  <div key={i} className="text-red-700">
                    • {b}
                  </div>
                ))}
              </div>
            )}

            {preview.toUpdate.length > 0 && (
              <div className="text-xs text-gray-500 max-h-32 overflow-y-auto space-y-0.5">
                {preview.toUpdate.map((u) => (
                  <div key={u.name}>
                    {u.name}: {fmtPrice(u.previousPrice)} → {fmtPrice(u.price)}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={cancelPreview}>
                Cancelar
              </Button>
              <Button className="bg-orange-500 hover:bg-orange-600" onClick={confirm} disabled={!canConfirm || loading}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar atualização"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h3 className="font-semibold text-gray-800 mb-2 text-sm flex items-center gap-2">
          <ClipboardList className="w-4 h-4" /> Histórico de importações
        </h3>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <Th>Data</Th>
                <Th>Arquivo</Th>
                <Th className="text-right">Novos</Th>
                <Th className="text-right">Atualizados</Th>
                <Th className="text-right">Erros</Th>
                <Th>Por</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((h) => (
                <tr key={h.id}>
                  <Td>{new Date(h.createdAt).toLocaleString("pt-BR")}</Td>
                  <Td>{h.fileName}</Td>
                  <Td className="text-right">{h.createdCount}</Td>
                  <Td className="text-right">{h.updatedCount}</Td>
                  <Td className="text-right">{h.errorCount}</Td>
                  <Td>{h.createdBy?.name ?? "—"}</Td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-6">
                    Nenhuma importação ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-800 text-sm">Itens ({items.length})</h3>
          <div className="relative w-64">
            <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar item"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border max-h-[60vh]">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 sticky top-0">
              <tr>
                <Th>Item</Th>
                <Th className="text-right">Preço</Th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((i) => (
                <tr key={i.id}>
                  <Td className="font-medium text-gray-900">{i.name}</Td>
                  <Td className="text-right">{fmtPrice(i.price)}</Td>
                </tr>
              ))}
              {!loadingItems && filtered.length === 0 && (
                <tr>
                  <td colSpan={2} className="text-center text-gray-400 py-6">
                    Nenhum item encontrado.
                  </td>
                </tr>
              )}
              {loadingItems && (
                <tr>
                  <td colSpan={2} className="text-center text-gray-400 py-6">
                    <Loader2 className="w-4 h-4 animate-spin inline" />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color = "text-gray-800" }: { label: string; value: number; color?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left font-medium px-3 py-2 ${className}`}>{children}</th>;
}
function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 ${className}`}>{children}</td>;
}
