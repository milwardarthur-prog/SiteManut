"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Ban, Camera, Check, ClipboardCheck, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { compressImage } from "@/lib/compress-image";
import {
  REVISAO_CHECKLIST,
  itemPendencies,
  type ChecklistItemDef,
  type ChecklistStatus,
} from "@/lib/revisao-checklist";

type SavedItem = { itemKey: string; status: ChecklistStatus; note: string | null };
type Photo = { id: string; itemKey: string; url: string | null };

export default function RevisaoChecklist({
  orderId,
  canEdit,
  voltageEmpty,
  frequencyEmpty,
  onChanged,
}: {
  orderId: string;
  canEdit: boolean;
  voltageEmpty?: string | null;
  frequencyEmpty?: string | null;
  onChanged?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [items, setItems] = useState<SavedItem[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [volt, setVolt] = useState(voltageEmpty ?? "");
  const [freq, setFreq] = useState(frequencyEmpty ?? "");
  const [viewing, setViewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/os/${orderId}/checklist`);
      if (res.ok) {
        const d = await res.json();
        setConfigured(!!d.configured);
        setItems(d.items ?? []);
        setPhotos(d.photos ?? []);
      }
    } catch {
      /* mantém o que já está na tela */
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    load();
  }, [load]);

  const savedOf = (key: string) => items.find((i) => i.itemKey === key);
  const photosOf = (key: string) => photos.filter((p) => p.itemKey === key);
  const pend = (def: ChecklistItemDef) => itemPendencies(def, savedOf(def.key), photosOf(def.key).length, volt, freq);
  const done = REVISAO_CHECKLIST.filter((d) => pend(d).length === 0).length;
  const total = REVISAO_CHECKLIST.length;
  const attention = items.filter((i) => i.status === "ATENCAO" && (i.note ?? "").trim());

  const saveStatus = async (def: ChecklistItemDef, status: ChecklistStatus, note?: string | null) => {
    const res = await fetch(`/api/os/${orderId}/checklist`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemKey: def.key, status, note: note ?? savedOf(def.key)?.note ?? "" }),
    });
    if (!res.ok) {
      toast.error((await res.json().catch(() => null))?.error ?? "Erro ao salvar o item");
      return;
    }
    await load();
    onChanged?.();
  };

  const saveReadings = async () => {
    if (volt === (voltageEmpty ?? "") && freq === (frequencyEmpty ?? "")) return;
    const res = await fetch(`/api/os/${orderId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voltageEmpty: volt, frequencyEmpty: freq }),
    });
    if (!res.ok) toast.error("Erro ao salvar tensão/frequência");
    else onChanged?.();
  };

  if (loading) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-green-500" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-green-500" /> Checklist de fotos da Revisão
          <span className="ml-auto text-xs font-medium text-gray-500">
            {done} de {total}
          </span>
        </CardTitle>
        <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-green-500 transition-all" style={{ width: `${(done / total) * 100}%` }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!configured && (
          <p className="text-sm text-amber-700 bg-amber-50 rounded-lg p-3">
            O armazenamento de fotos ainda não está configurado — o checklist ainda não pode receber fotos.
          </p>
        )}

        {attention.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm space-y-1">
            <div className="font-medium text-amber-800 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" /> Pendências do checklist
            </div>
            {attention.map((a) => (
              <div key={a.itemKey} className="text-amber-900">
                • <strong>{REVISAO_CHECKLIST.find((d) => d.key === a.itemKey)?.label}</strong>: {a.note}
              </div>
            ))}
          </div>
        )}

        {REVISAO_CHECKLIST.map((def) => (
          <ItemRow
            key={def.key}
            orderId={orderId}
            def={def}
            saved={savedOf(def.key)}
            photos={photosOf(def.key)}
            complete={pend(def).length === 0}
            canEdit={canEdit && configured}
            volt={volt}
            freq={freq}
            setVolt={setVolt}
            setFreq={setFreq}
            onSaveReadings={saveReadings}
            onSaveStatus={saveStatus}
            onReload={async () => {
              await load();
              onChanged?.();
            }}
            onView={setViewing}
          />
        ))}
      </CardContent>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader className="sr-only">
            <DialogTitle>Foto</DialogTitle>
          </DialogHeader>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {viewing && <img src={viewing} alt="Foto do checklist" className="w-full max-h-[80vh] object-contain rounded" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ItemRow({
  orderId,
  def,
  saved,
  photos,
  complete,
  canEdit,
  volt,
  freq,
  setVolt,
  setFreq,
  onSaveReadings,
  onSaveStatus,
  onReload,
  onView,
}: {
  orderId: string;
  def: ChecklistItemDef;
  saved?: SavedItem;
  photos: Photo[];
  complete: boolean;
  canEdit: boolean;
  volt: string;
  freq: string;
  setVolt: (v: string) => void;
  setFreq: (v: string) => void;
  onSaveReadings: () => void;
  onSaveStatus: (def: ChecklistItemDef, status: ChecklistStatus, note?: string | null) => Promise<void>;
  onReload: () => Promise<void>;
  onView: (url: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [note, setNote] = useState(saved?.note ?? "");
  useEffect(() => setNote(saved?.note ?? ""), [saved?.note]);

  const unavailable = saved?.status === "INDISPONIVEL";
  const canAddPhoto = canEdit && !unavailable && photos.length < def.maxPhotos;

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    try {
      let room = def.maxPhotos - photos.length;
      for (const f of files) {
        if (room <= 0) break;
        const small = await compressImage(f);
        const fd = new FormData();
        fd.append("itemKey", def.key);
        fd.append("file", small);
        const res = await fetch(`/api/os/${orderId}/checklist/photo`, { method: "POST", body: fd });
        if (!res.ok) {
          toast.error((await res.json().catch(() => null))?.error ?? "Erro ao enviar a foto");
          break;
        }
        room--;
      }
      await onReload();
    } catch {
      toast.error("Não foi possível processar a foto");
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async (id: string) => {
    const res = await fetch(`/api/os/${orderId}/checklist/photo?photoId=${id}`, { method: "DELETE" });
    if (!res.ok) toast.error("Erro ao apagar a foto");
    await onReload();
  };

  const statusBtn = (status: ChecklistStatus, label: string, icon: React.ReactNode, cls: string) => (
    <Button
      type="button"
      variant="outline"
      disabled={!canEdit}
      onClick={() => onSaveStatus(def, status, status === "ATENCAO" ? note : "")}
      className={`h-11 flex-1 gap-1 ${saved?.status === status ? cls : ""}`}
    >
      {icon} {label}
    </Button>
  );

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${complete ? "border-green-200 bg-green-50/40" : "border-gray-200"}`}>
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
            complete ? "bg-green-500 text-white" : "bg-gray-200 text-transparent"
          }`}
        >
          <Check className="w-3 h-3" />
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">{def.label}</div>
          {def.hint && <div className="text-xs text-gray-500">{def.hint}</div>}
        </div>
      </div>

      {!unavailable && (
        <div className="flex flex-wrap gap-2 items-center">
          {photos.map((p) => (
            <div key={p.id} className="relative">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.url}
                  alt={def.label}
                  onClick={() => onView(p.url!)}
                  className="w-20 h-20 object-cover rounded-md border cursor-pointer"
                />
              ) : (
                <div className="w-20 h-20 rounded-md border bg-gray-100 text-[10px] text-gray-500 flex items-center justify-center text-center p-1">
                  foto indisponível
                </div>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => removePhoto(p.id)}
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                  aria-label="Apagar foto"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
          {canAddPhoto && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                multiple={def.maxPhotos - photos.length > 1}
                className="hidden"
                onChange={onPick}
              />
              <Button
                type="button"
                variant="outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="h-20 w-20 flex-col gap-1 border-dashed border-green-400 text-green-700"
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                <span className="text-[11px]">{photos.length < def.minPhotos ? `Foto ${photos.length + 1}/${def.minPhotos}` : "Mais uma"}</span>
              </Button>
            </>
          )}
        </div>
      )}

      {unavailable && (
        <p className="text-xs text-gray-500">Marcado como indisponível — sem foto neste equipamento.</p>
      )}

      {!def.photosOnly && (
        <div className="flex gap-2">
          {statusBtn("OK", "OK", <Check className="w-4 h-4" />, "bg-green-500 text-white hover:bg-green-600 hover:text-white border-green-500")}
          {statusBtn("ATENCAO", "Atenção", <AlertTriangle className="w-4 h-4" />, "bg-amber-500 text-white hover:bg-amber-600 hover:text-white border-amber-500")}
          {def.allowUnavailable &&
            statusBtn("INDISPONIVEL", "Indisponível", <Ban className="w-4 h-4" />, "bg-gray-500 text-white hover:bg-gray-600 hover:text-white border-gray-500")}
        </div>
      )}

      {saved?.status === "ATENCAO" && (
        <Textarea
          value={note}
          disabled={!canEdit}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (saved?.note ?? "") && onSaveStatus(def, "ATENCAO", note)}
          placeholder="O que precisa de atenção? (obrigatório)"
          className="bg-white text-sm"
          rows={2}
        />
      )}

      {def.emptyReadings && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-gray-600">Tensão a vazio</label>
            <Input
              value={volt}
              disabled={!canEdit}
              inputMode="decimal"
              onChange={(e) => setVolt(e.target.value)}
              onBlur={onSaveReadings}
              placeholder="ex.: 220V"
              className="bg-white h-11"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600">Frequência a vazio</label>
            <Input
              value={freq}
              disabled={!canEdit}
              inputMode="decimal"
              onChange={(e) => setFreq(e.target.value)}
              onBlur={onSaveReadings}
              placeholder="ex.: 61,5Hz"
              className="bg-white h-11"
            />
          </div>
        </div>
      )}
    </div>
  );
}
