// Lista fixa de equipamentos (GE) usada nas páginas de Checklist e Teste de Carga.
// Mantida igual aos sites originais para preservar o comportamento.
export const GE_EQUIPAMENTOS: string[] = [
  "GE-02-50", "GE-03-40", "GE-04-55", "GE-05-55", "GE-06-115", "GE-09-170", "GE-10-25", "GE-11-75",
  "GE-12-75", "GE-13-500", "GE-14-140", "GE-15-170", "GE-16-40", "GE-17-81", "GE-18-100", "GE-19-81",
  "GE-20-54", "GE-21-54", "GE-22-54", "GE-23-54", "GE-24-54", "GE-25-60", "GE-26-75", "GE-27-180",
  "GE-28-81", "GE-29-85", "GE-30-105", "GE-31-105", "GE-32-115", "GE-33-115", "GE-34-115", "GE-35-150",
  "GE-36-150", "GE-37-180", "GE-38-180", "GE-39-180", "GE-40-180", "GE-41-220", "GE-42-450", "GE-43-450",
  "GE-44-260", "GE-45-40", "GE-46-25", "GE-47-115", "GE-48-15", "GE-49-55", "GE-50-55", "GE-51-550",
  "GE-52-212", "GE-53-140", "GE-54-55", "GE-55-55", "GE-56-55", "GE-57-55", "GE-58-81", "GE-59-180",
  "GE-60-180", "GE-61-230", "GE-62-81", "GE-63-40", "GE-64-55", "GE-65-230", "GE-66-80", "GE-67-100",
  "GE-68-50", "GE-69-260", "GE-70-40", "GE-71-81", "GE-72-140", "GE-73-260", "GE-74-375", "GE-75-25",
  "GE-76-81", "GE-77-140", "GE-78-81", "GE-79-81", "GE-80-81", "GE-81-50", "GE-82-100", "GE-83-140",
  "GE-84-81", "GE-85-140", "GE-86-81", "GE-87-81", "GE-88-55", "GE-89-55", "GE-90-15", "GE-91-70",
  "GE-92-80", "GE-93-85", "GE-94-200", "GE-95-460", "GE-96-27", "GE-97-33", "GE-98-250", "GE-99-36",
  "GE-100-125", "GE-101-12", "GE-102-55", "GE-103-150", "GE-104-65", "GE-105-45", "GE-106-500", "GE-107-230",
  "GE-108-125", "GE-109-25", "GE-110-80", "GE-111-125", "GE-112-125", "GE-113-360", "GE-114-360",
];

// Ordena pela parte numérica do meio (GE-<num>-...), como nos sites originais.
export function ordenarEquipamentos(lista: string[]): string[] {
  return [...lista].sort((a, b) => {
    const numA = parseInt(a.split("-")[1] ?? "0", 10);
    const numB = parseInt(b.split("-")[1] ?? "0", 10);
    return numA - numB;
  });
}

// Comparador de ordenação NATURAL para números de equipamento (ex: "GE-99-170",
// "GE-100-125"). Compara segmento a segmento: trechos numéricos são comparados
// como número (99 < 100) e trechos de texto como string. Assim GE-99 vem antes
// de GE-100 (e não pela ordem alfabética "GE-100" < "GE-99").
export function compararEquipmentNumber(a?: string | null, b?: string | null): number {
  const sa = (a ?? "").trim();
  const sb = (b ?? "").trim();
  // Divide em pedaços alternando dígitos e não-dígitos
  const partsA = sa.match(/(\d+|\D+)/g) ?? [];
  const partsB = sb.match(/(\d+|\D+)/g) ?? [];
  const len = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const pa = partsA[i];
    const pb = partsB[i];
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;
    const na = /^\d+$/.test(pa);
    const nb = /^\d+$/.test(pb);
    if (na && nb) {
      const diff = parseInt(pa, 10) - parseInt(pb, 10);
      if (diff !== 0) return diff;
    } else {
      const cmp = pa.localeCompare(pb, "pt-BR");
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}
