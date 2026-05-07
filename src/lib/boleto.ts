// Parser de linha digitável de boletos brasileiros
// Suporta boletos bancários (47 dígitos) e arrecadação/concessionárias (48 dígitos)

export interface BoletoInfo {
  amount: number | null;
  dueDate: Date | null;
  barcode: string; // só dígitos
  type: "bancario" | "arrecadacao" | "desconhecido";
}

const BASE_DATE = new Date(Date.UTC(1997, 9, 7)); // 07/10/1997

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "");
}

export function parseBoleto(input: string): BoletoInfo {
  const digits = onlyDigits(input);
  const result: BoletoInfo = {
    amount: null,
    dueDate: null,
    barcode: digits,
    type: "desconhecido",
  };

  if (digits.length === 47) {
    result.type = "bancario";
    // Linha digitável bancária -> código de barras
    // Campo 1: pos 0-9 (10 dig: 4 banco/moeda + 5 + DV)
    // Campo 2: pos 10-20 (11 dig: 10 + DV)
    // Campo 3: pos 21-31 (11 dig: 10 + DV)
    // Campo 4 (DV geral): pos 32
    // Campo 5: pos 33-46 (14 dig: fator venc 4 + valor 10)
    const fator = parseInt(digits.substring(33, 37), 10);
    const valor = parseInt(digits.substring(37, 47), 10);
    if (!isNaN(valor)) result.amount = valor / 100;
    if (!isNaN(fator) && fator > 0) {
      const d = new Date(BASE_DATE.getTime() + fator * 86400000);
      result.dueDate = d;
    }
    return result;
  }

  if (digits.length === 48) {
    result.type = "arrecadacao";
    // Linha digitável de arrecadação = 4 blocos de 11 dígitos + 1 DV cada (= 48).
    // Removendo os DVs reconstruímos o código de barras (44 dígitos):
    //   barcode = bloco1[0..10] + bloco2[0..10] + bloco3[0..10] + bloco4[0..10]
    // No código de barras, o VALOR fica nas posições 5–15 (11 dígitos).
    // O 3º dígito indica se o valor é efetivo (6/7 → moeda) ou referência (8/9).
    // Arrecadação NÃO possui fator de vencimento padronizado — a data, quando
    // existe, fica no campo livre e varia por concessionária; deixamos null.
    const barcode44 =
      digits.substring(0, 11) +
      digits.substring(12, 23) +
      digits.substring(24, 35) +
      digits.substring(36, 47);
    const valorIdentifier = barcode44.charAt(2); // 6,7 = efetivo | 8,9 = referência
    const valor = parseInt(barcode44.substring(4, 15), 10);
    if (!isNaN(valor) && (valorIdentifier === "6" || valorIdentifier === "7")) {
      result.amount = valor / 100;
    }
    return result;
  }

  if (digits.length === 44) {
    // Código de barras puro
    result.type = "bancario";
    const fator = parseInt(digits.substring(5, 9), 10);
    const valor = parseInt(digits.substring(9, 19), 10);
    if (!isNaN(valor)) result.amount = valor / 100;
    if (!isNaN(fator) && fator > 0) {
      result.dueDate = new Date(BASE_DATE.getTime() + fator * 86400000);
    }
    return result;
  }

  return result;
}

export function formatBarcode(digits: string): string {
  const d = onlyDigits(digits);
  if (d.length === 47) {
    return `${d.slice(0,5)}.${d.slice(5,10)} ${d.slice(10,15)}.${d.slice(15,21)} ${d.slice(21,26)}.${d.slice(26,32)} ${d.slice(32,33)} ${d.slice(33,47)}`;
  }
  if (d.length === 48) {
    return `${d.slice(0,11)}-${d.slice(11,12)} ${d.slice(12,23)}-${d.slice(23,24)} ${d.slice(24,35)}-${d.slice(35,36)} ${d.slice(36,47)}-${d.slice(47,48)}`;
  }
  return d;
}

// =============== Validação de DV ===============

/** Mod10 (Luhn-like Febraban): pesos 2,1,2,1... da direita para a esquerda. */
function mod10(num: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    let p = parseInt(num.charAt(i), 10) * weight;
    if (p > 9) p = Math.floor(p / 10) + (p % 10);
    sum += p;
    weight = weight === 2 ? 1 : 2;
  }
  const r = sum % 10;
  return r === 0 ? 0 : 10 - r;
}

/** Mod11 Febraban arrecadação: pesos 2..9 da direita p/ esquerda; resto 0/1/10 → DV 0. */
function mod11Arrecadacao(num: string): number {
  let sum = 0;
  let weight = 2;
  for (let i = num.length - 1; i >= 0; i--) {
    sum += parseInt(num.charAt(i), 10) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const r = sum % 11;
  const dv = 11 - r;
  if (dv === 0 || dv === 10 || dv === 11) return 0;
  return dv;
}

/**
 * Valida uma sequência de 44/47/48 dígitos como código de barras / linha
 * digitável de boleto bancário ou arrecadação. Retorna true só quando os
 * dígitos verificadores batem — útil para descartar leituras corrompidas
 * de scanner antes de aplicar.
 */
export function isValidBoletoDigits(input: string): boolean {
  const d = onlyDigits(input);

  // Linha digitável de arrecadação (48): 4 blocos de 11 + DV cada
  if (d.length === 48) {
    const valueId = d.charAt(2); // 6,7 = mod10 | 8,9 = mod11
    const useMod10 = valueId === "6" || valueId === "7";
    const useMod11 = valueId === "8" || valueId === "9";
    if (!useMod10 && !useMod11) return false;
    for (let i = 0; i < 4; i++) {
      const block = d.substring(i * 12, i * 12 + 11);
      const dv = parseInt(d.charAt(i * 12 + 11), 10);
      const expected = useMod10 ? mod10(block) : mod11Arrecadacao(block);
      if (dv !== expected) return false;
    }
    return true;
  }

  // Linha digitável bancária (47)
  if (d.length === 47) {
    // Campo 1: pos 0-9 (DV em pos 9)
    const f1 = d.substring(0, 9);
    if (mod10(f1) !== parseInt(d.charAt(9), 10)) return false;
    // Campo 2: pos 10-20 (DV em pos 20)
    const f2 = d.substring(10, 20);
    if (mod10(f2) !== parseInt(d.charAt(20), 10)) return false;
    // Campo 3: pos 21-31 (DV em pos 31)
    const f3 = d.substring(21, 31);
    if (mod10(f3) !== parseInt(d.charAt(31), 10)) return false;
    return true;
  }

  // Código de barras puro (44) — validação leve: só checa que existem dígitos
  if (d.length === 44) return true;

  return false;
}

// =============== Pix EMV (BR Code / Copia e Cola) ===============

export interface PixInfo {
  type: "pix";
  payload: string;
  amount: number | null;
  merchant: string | null;
  city: string | null;
  txid: string | null;
}

/** Detecta payload Pix EMV. Começa com "000201" e contém "br.gov.bcb.pix". */
export function isPixPayload(text: string): boolean {
  const t = text.trim();
  return /^000201/.test(t) && /br\.gov\.bcb\.pix/i.test(t);
}

/** Faz parse simples do TLV EMV do Pix. */
export function parsePix(input: string): PixInfo | null {
  const text = input.trim();
  if (!isPixPayload(text)) return null;

  const tlv: Record<string, string> = {};
  let i = 0;
  while (i < text.length - 4) {
    const id = text.substring(i, i + 2);
    const len = parseInt(text.substring(i + 2, i + 4), 10);
    if (isNaN(len)) break;
    const value = text.substring(i + 4, i + 4 + len);
    tlv[id] = value;
    i += 4 + len;
  }

  // Sub-TLV do campo 62 (additional data) → 05 = txid
  let txid: string | null = null;
  if (tlv["62"]) {
    const sub = tlv["62"];
    let j = 0;
    while (j < sub.length - 4) {
      const sid = sub.substring(j, j + 2);
      const slen = parseInt(sub.substring(j + 2, j + 4), 10);
      if (isNaN(slen)) break;
      const sval = sub.substring(j + 4, j + 4 + slen);
      if (sid === "05") txid = sval;
      j += 4 + slen;
    }
  }

  return {
    type: "pix",
    payload: text,
    amount: parsePixAmount(tlv["54"]),
    merchant: tlv["59"] ? tlv["59"].trim() || null : null,
    city: tlv["60"] ? tlv["60"].trim() || null : null,
    txid,
  };
}

/**
 * Faz parse robusto do campo 54 (Transaction Amount) do EMV Pix.
 *
 * Pelo padrão BR Code, o valor deve ser numérico em string com ponto
 * como separador decimal (ex.: "150.00", "1234.5", "10"). Na prática,
 * QR Codes gerados por diferentes PSPs/apps podem trazer variações:
 *   - vírgula como separador decimal ("150,00")
 *   - prefixo "R$" ou espaços ("R$ 150,00", " 150.00 ")
 *   - separador de milhar ("1.234,56" ou "1,234.56")
 *   - sem casas decimais ("150")
 *   - zero à esquerda ("0150.00")
 *
 * Retorna null para vazio, "0", "0.00", ou strings inválidas.
 */
export function parsePixAmount(raw: string | undefined | null): number | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;

  // Remove símbolo de moeda e espaços internos
  s = s.replace(/[Rr]\$\s*/g, "").replace(/\s+/g, "");
  if (!s) return null;

  // Mantém só dígitos, ponto, vírgula e sinal de menos (não esperado mas seguro)
  s = s.replace(/[^\d.,-]/g, "");
  if (!s) return null;

  const hasDot = s.includes(".");
  const hasComma = s.includes(",");

  if (hasDot && hasComma) {
    // Assume formato pt-BR: "1.234,56" → último separador é decimal (vírgula)
    // ou en-US: "1,234.56" → último separador é decimal (ponto).
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      // vírgula é decimal
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // ponto é decimal
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    // Apenas vírgula → trata como decimal
    s = s.replace(",", ".");
  }
  // Apenas ponto (ou nenhum separador) → já está no formato correto

  const n = parseFloat(s);
  if (!isFinite(n) || isNaN(n) || n <= 0) return null;
  // Arredonda para 2 casas para evitar artefatos de ponto flutuante
  return Math.round(n * 100) / 100;
}