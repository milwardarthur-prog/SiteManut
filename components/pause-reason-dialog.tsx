"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

export const PAUSE_REASON_LABELS: Record<string, string> = {
  AGUARDANDO_TERCEIRO: "Aguardando peça — terceiro",
  AGUARDANDO_ESTOQUE: "Aguardando peça — estoque",
  ALMOCO: "Almoço / Intervalo",
  FIM_EXPEDIENTE: "Fim de expediente (automático)",
  OUTRO: "Outro motivo",
};

const REASON_OPTIONS = ["AGUARDANDO_TERCEIRO", "AGUARDANDO_ESTOQUE", "ALMOCO", "OUTRO"];

// Nota é obrigatória só quando faz diferença saber "o quê"/"pra quem" — é o
// motivo que originou esse recurso (contabilizar tempo aguardando terceiro).
function noteRequired(reason: string) {
  return reason === "AGUARDANDO_TERCEIRO" || reason === "AGUARDANDO_ESTOQUE";
}

export default function PauseReasonDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, note: string) => void;
  loading?: boolean;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setReason("");
      setNote("");
    }
    onOpenChange(v);
  };

  const canConfirm = !!reason && (!noteRequired(reason) || note.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Por que vai pausar?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Motivo</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o motivo" />
              </SelectTrigger>
              <SelectContent>
                {REASON_OPTIONS.map((r) => (
                  <SelectItem key={r} value={r}>{PAUSE_REASON_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {noteRequired(reason) && (
            <div className="space-y-1.5">
              <Label>Pra quem / o quê foi enviado</Label>
              <Textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Ex: Motor de partida enviado pra Oficina Silva"
                rows={2}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(reason, note.trim())}
            disabled={!canConfirm || loading}
            className="bg-orange-500 hover:bg-orange-600 text-white"
          >
            {loading ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null} Pausar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
