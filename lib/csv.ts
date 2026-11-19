// Detecta a codificação do arquivo (BOM ou UTF-16 "cru", comum em exportações do
// Windows/Excel) para não corromper acentos ao ler o CSV.
export function decodeCsvBuffer(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.slice(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.slice(2));
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.slice(3));
  }
  const sampleLen = Math.min(bytes.length, 2000);
  let zeroCount = 0;
  for (let i = 0; i < sampleLen; i++) if (bytes[i] === 0) zeroCount++;
  if (sampleLen > 0 && zeroCount / sampleLen > 0.25) {
    return new TextDecoder("utf-16le").decode(bytes);
  }
  // Sem BOM: tenta UTF-8 estrito. Se o arquivo não for UTF-8 válido, é o
  // Windows-1252/Latin-1 que o sistema de patrimônio exporta — e ler isso como
  // UTF-8 trocaria cada acento por "�" (ex.: "SERVI�OS").
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
