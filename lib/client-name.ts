const foldName = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();

/**
 * Compara nomes de cliente ignorando acento e tolerando o caractere "�"
 * que importações antigas gravaram no lugar de letras acentuadas (arquivo lido
 * com a codificação errada). Assim, corrigir a leitura do CSV não faz todo
 * cliente com acento parecer "cliente diferente".
 */
export function sameClientName(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = foldName(a);
  const y = foldName(b);
  if (x === y) return true;
  const xBad = x.includes("�");
  const yBad = y.includes("�");
  if (!xBad && !yBad) return false;
  const bad = xBad ? x : y;
  const good = xBad ? y : x;
  const pattern = bad
    .split("�")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".");
  return new RegExp(`^${pattern}$`).test(good);
}
