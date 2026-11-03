// Motivos de uma coleta de horímetro que não deu certo ("não consegui coletar").
export const COLLECTION_FAIL_REASONS = ["CLIENTE_NAO_INFORMOU", "SEM_ACESSO", "OUTRO"] as const;
export type CollectionFailReason = (typeof COLLECTION_FAIL_REASONS)[number];

export const COLLECTION_FAIL_LABELS: Record<CollectionFailReason, string> = {
  CLIENTE_NAO_INFORMOU: "Cliente não informou",
  SEM_ACESSO: "Sem acesso ao equipamento",
  OUTRO: "Outro motivo",
};
