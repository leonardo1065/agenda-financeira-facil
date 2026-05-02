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
    // Arrecadação: valor nos primeiros 12 dígitos significativos
    // Posições 4-14 do código de barras = valor (11 dígitos)
    // Linha digitável: blocos de 12 dígitos com DV ao final de cada (mod 10/11)
    // Pegamos o valor das posições 4-14 da linha digitável
    const valor = parseInt(digits.substring(4, 15), 10);
    if (!isNaN(valor)) result.amount = valor / 100;
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

  const amountStr = tlv["54"];
  const amount = amountStr ? parseFloat(amountStr) : null;

  return {
    type: "pix",
    payload: text,
    amount: amount && !isNaN(amount) ? amount : null,
    merchant: tlv["59"] ?? null,
    city: tlv["60"] ?? null,
    txid,
  };
}