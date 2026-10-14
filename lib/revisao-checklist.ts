// Checklist de fotos da OS de Revisão: cada item exige foto(s) e um status.
// Compartilhado entre servidor (validação) e tela — sem imports de servidor.

export type ChecklistStatus = "OK" | "ATENCAO" | "INDISPONIVEL";

export type ChecklistItemDef = {
  key: string;
  label: string;
  hint?: string;
  /** Quantidade de fotos obrigatórias (mínimo). */
  minPhotos: number;
  /** Máximo de fotos aceitas. */
  maxPhotos: number;
  /** Aceita "Indisponível" no lugar da foto (equipamentos em que a foto é inviável). */
  allowUnavailable?: boolean;
  /** Sem OK/Atenção — só fotos (ex.: filtros removidos). */
  photosOnly?: boolean;
  /** Pede Tensão e Frequência a vazio (campos da OS). */
  emptyReadings?: boolean;
};

export const REVISAO_CHECKLIST: ChecklistItemDef[] = [
  { key: "bateria_scanner", label: "Teste das baterias (scanner)", minPhotos: 1, maxPhotos: 2 },
  { key: "tensao_alternador", label: "Tensão do alternador", minPhotos: 1, maxPhotos: 2 },
  { key: "bazeta", label: "Verificação da bazeta", minPhotos: 1, maxPhotos: 2 },
  {
    key: "arrefecimento_nivel",
    label: "Nível do líquido de arrefecimento",
    hint: "Se não der pra fotografar neste equipamento, marque “Indisponível”.",
    minPhotos: 1,
    maxPhotos: 2,
    allowUnavailable: true,
  },
  { key: "oleo_nivel", label: "Nível do óleo lubrificante", minPhotos: 1, maxPhotos: 2 },
  { key: "filtro_ar", label: "Inspeção do filtro de ar", minPhotos: 1, maxPhotos: 2 },
  { key: "correias", label: "Verificação da tensão das correias", minPhotos: 1, maxPhotos: 2 },
  { key: "vazamento_arrefecimento", label: "Vazamento no sistema de arrefecimento", minPhotos: 1, maxPhotos: 2 },
  { key: "vazamento_oleo", label: "Vazamento de óleo lubrificante", minPhotos: 1, maxPhotos: 2 },
  { key: "vazamento_diesel", label: "Vazamento da linha de diesel", minPhotos: 1, maxPhotos: 2 },
  { key: "frente_motor", label: "Frente do motor", minPhotos: 1, maxPhotos: 2 },
  { key: "colmeia_radiador", label: "Colmeia do radiador", minPhotos: 1, maxPhotos: 2 },
  {
    key: "funcionamento_vazio",
    label: "Funcionamento a vazio",
    hint: "2 fotos do painel e a tensão e a frequência a vazio.",
    minPhotos: 2,
    maxPhotos: 2,
    emptyReadings: true,
  },
  { key: "limpeza", label: "Limpeza do gerador", minPhotos: 1, maxPhotos: 2 },
  { key: "oleo_apos_troca", label: "Nível do óleo após a troca", minPhotos: 1, maxPhotos: 2 },
  {
    key: "filtros_removidos",
    label: "Filtros removidos",
    hint: "Fotografe os filtros que saíram do equipamento.",
    minPhotos: 1,
    maxPhotos: 8,
    photosOnly: true,
  },
];

export const CHECKLIST_KEYS = new Set(REVISAO_CHECKLIST.map((i) => i.key));
export const checklistItemByKey = (key: string) => REVISAO_CHECKLIST.find((i) => i.key === key);

export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  OK: "OK",
  ATENCAO: "Atenção",
  INDISPONIVEL: "Indisponível",
};

type SavedItem = { itemKey: string; status: ChecklistStatus; note?: string | null };
type PhotoRef = { itemKey: string | null };

/** O que falta em um item (vazio = item completo). */
export function itemPendencies(
  def: ChecklistItemDef,
  saved: SavedItem | undefined,
  photoCount: number,
  voltageEmpty?: string | null,
  frequencyEmpty?: string | null
): string[] {
  const missing: string[] = [];
  if (def.photosOnly) {
    if (photoCount < def.minPhotos) missing.push(`${def.label}: falta a foto`);
    return missing;
  }
  if (!saved) return [`${def.label}: falta marcar o status`];
  if (saved.status === "INDISPONIVEL") {
    if (!def.allowUnavailable) missing.push(`${def.label}: status inválido`);
    return missing;
  }
  if (photoCount < def.minPhotos) {
    missing.push(
      def.minPhotos > 1 ? `${def.label}: faltam fotos (${photoCount}/${def.minPhotos})` : `${def.label}: falta a foto`
    );
  }
  if (saved.status === "ATENCAO" && !(saved.note ?? "").trim()) {
    missing.push(`${def.label}: descreva o que precisa de atenção`);
  }
  if (def.emptyReadings) {
    if (!(voltageEmpty ?? "").trim()) missing.push(`${def.label}: falta a tensão a vazio`);
    if (!(frequencyEmpty ?? "").trim()) missing.push(`${def.label}: falta a frequência a vazio`);
  }
  return missing;
}

/**
 * Lista o que ainda falta para a Revisão poder ser encerrada pelo técnico.
 * Retorna [] quando o checklist está completo.
 */
export function checklistPendencies(args: {
  items: SavedItem[];
  photos: PhotoRef[];
  voltageEmpty?: string | null;
  frequencyEmpty?: string | null;
}): string[] {
  return REVISAO_CHECKLIST.flatMap((def) =>
    itemPendencies(
      def,
      args.items.find((i) => i.itemKey === def.key),
      args.photos.filter((p) => p.itemKey === def.key).length,
      args.voltageEmpty,
      args.frequencyEmpty
    )
  );
}
