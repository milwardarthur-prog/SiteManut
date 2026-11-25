// Equipamentos "ocultos": vendidos / fora da frota. Continuam no banco (histórico
// de leituras e de OS preservado), mas somem das listas, da coleta de horímetro,
// da localização, do mapa, da montagem de carga e do painel — e, se aparecerem no
// CSV de locação, a linha é ignorada.
//
// Pra ocultar outro equipamento, é só incluir o número aqui.
export const EQUIPAMENTOS_OCULTOS: string[] = ["GE-101-12"];

const SET = new Set(EQUIPAMENTOS_OCULTOS.map((c) => c.trim().toUpperCase()));

export function isOculto(code?: string | null): boolean {
  return SET.has((code ?? "").trim().toUpperCase());
}

// Filtro pronto pra usar em `where` do Prisma: { equipmentNumber: { notIn: [...] } }
export const NAO_OCULTO = { equipmentNumber: { notIn: EQUIPAMENTOS_OCULTOS } } as const;
