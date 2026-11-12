// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Escrita na planilha do Google Sheets (API REST v4, com o token do usuário).
//
// - O cabeçalho é procurado nas 15 primeiras linhas (pode haver título ou totais acima dele).
// - Só as colunas reconhecidas são preenchidas; as outras (preço, fórmulas, erros, observações) nunca são tocadas.
// - A carta vai para a linha logo abaixo da última linha que tem dado nessas colunas: nada é sobrescrito
//   e nenhuma linha é inserida (fórmulas e formatação abaixo continuam no lugar).
// - Formato compatível com o bot-leilao (Carta, Estado, Idioma, Preço (liga)) e com o liga_price_sheets
//   (Carta "Nome (nº/total)", Estado/Qualidade M/NM/SP/MP/HP/D, Extra, Idioma, Preço (Liga), Link Liga, Erros).
import { semAcento } from './idioma.js';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const LINHAS_CABECALHO = 15;

const norm = (s) => semAcento(String(s ?? '').replace(/[º°]/g, 'o')).replace(/\s+/g, ' ').trim();

// Colunas que o app sabe preencher. "nomes" = títulos aceitos (sem acento, minúsculas).
export const COLUNAS = [
  { campo: 'carta', nomes: ['carta'] },
  { campo: 'nome', nomes: ['nome', 'nome da carta', 'name', 'card'] },
  { campo: 'numero', nomes: ['numero', 'n', 'no', 'n.', 'no.', 'number', 'codigo', 'numero da carta'] },
  { campo: 'estado', nomes: ['estado', 'condicao', 'qualidade', 'condition', 'cond', 'cond.'] },
  { campo: 'extra', nomes: ['extra', 'extras'] },
  { campo: 'idioma', nomes: ['idioma', 'lingua', 'language'] },
  { campo: 'quantidade', nomes: ['quantidade', 'qtd', 'qtde', 'qtd.', 'quant.'] },
  { campo: 'data', nomes: ['data', 'data da leitura', 'adicionada em'] },
  { campo: 'liga', nomes: ['link liga', 'link liga pokemon', 'link ligapokemon', 'liga', 'link', 'link da liga', 'url'] },
];

// Cabeçalho criado quando a aba está vazia: o da planilha de leilão (lido pelo liga_price_sheets e pelo bot-leilao).
// O app preenche Quantidade, Carta, Estado, Extra, Idioma e Link liga; o resto fica para a extensão e para o leilão.
export const CABECALHO_PADRAO = [
  'Quantidade', 'Carta', 'Estado', 'Preço (Liga)', 'Extra', 'Idioma', 'Erros', 'Preço (compra)', 'Link liga',
  '10% off', 'opçoes', 'lance inicial', 'fechamento', 'pagamento',
];

// URL da planilha (ou o próprio ID) -> ID.
export function idDaPlanilha(urlOuId) {
  const s = String(urlOuId ?? '').trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{20,}$/.test(s) ? s : '';
}

// Nome da aba entre aspas simples, como a API exige em intervalos.
export const intervalo = (aba, celulas = '') => `'${String(aba).replace(/'/g, "''")}'${celulas ? `!${celulas}` : ''}`;

// 0 -> A, 25 -> Z, 26 -> AA
export function letraColuna(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

// Linha de títulos -> { campo: índice da coluna }
export function mapearColunas(titulos) {
  const mapa = {};
  titulos.forEach((t, i) => {
    const col = COLUNAS.find((c) => c.nomes.includes(norm(t)));
    if (col && !(col.campo in mapa)) mapa[col.campo] = i;
  });
  return mapa;
}

// Procura o cabeçalho nas primeiras linhas: a primeira com "Carta" ou "Nome" e pelo menos 2 colunas conhecidas.
// Devolve { indice, mapa } ou null.
export function encontrarCabecalho(linhas) {
  for (let i = 0; i < Math.min(LINHAS_CABECALHO, linhas.length); i++) {
    const mapa = mapearColunas(linhas[i] || []);
    if (('carta' in mapa || 'nome' in mapa) && Object.keys(mapa).length >= 2) return { indice: i, mapa };
  }
  return null;
}

// Índice (0 = linha 1) da próxima linha livre: logo abaixo da última com dado em alguma coluna mapeada.
export function proximaLinha(linhas, indiceCabecalho, mapa) {
  const cols = Object.values(mapa);
  let ultima = indiceCabecalho;
  for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
    if (cols.some((c) => String(linhas[i]?.[c] ?? '').trim() !== '')) ultima = i;
  }
  return ultima + 1;
}

// Valor de cada campo para a planilha.
// "Carta" recebe "Nome (026/128)" (bot-leilao e liga_price_sheets). O liga_price_sheets aceita "Nome" no lugar de
// "Carta" com o mesmo formato: sem coluna "Carta", é a coluna "Nome" que recebe "Nome (026/128)".
export function valoresDoRegistro(mapa, registro) {
  const v = { ...registro };
  if (!('carta' in mapa)) v.nome = registro.carta;
  return v;
}

// Escritas (uma por célula) da linha `indice` (0 = linha 1). Só campos mapeados e com valor.
export function montarEscritas(aba, indice, mapa, registro) {
  const v = valoresDoRegistro(mapa, registro);
  return Object.entries(mapa)
    .filter(([campo]) => v[campo] != null && String(v[campo]) !== '')
    .map(([campo, col]) => ({ range: intervalo(aba, `${letraColuna(col)}${indice + 1}`), values: [[String(v[campo])]] }));
}

async function chamar(token, url, opcoes = {}) {
  const r = await fetch(url, {
    ...opcoes,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) },
  });
  if (!r.ok) {
    let msg = `${r.status}`;
    try { msg = (await r.json()).error?.message || msg; } catch { /* corpo sem JSON */ }
    if (r.status === 403) msg = `sem permissão de edição nesta planilha (${msg})`;
    if (r.status === 404) msg = 'planilha não encontrada: confira o link';
    const e = new Error(`Google Sheets: ${msg}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Título da planilha e nomes das abas.
export async function lerPlanilha(token, id) {
  const d = await chamar(token, `${API}/${id}?fields=properties.title,sheets.properties.title`);
  return { titulo: d.properties.title, abas: d.sheets.map((s) => s.properties.title) };
}

// Grava uma carta na próxima linha livre da aba. Cria o cabeçalho se a aba estiver vazia.
// Devolve o número da linha gravada (1 = primeira).
export async function adicionarCarta(token, id, aba, registro) {
  const url = `${API}/${id}/values/${encodeURIComponent(intervalo(aba))}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  let linhas = (await chamar(token, url)).values || [];
  let cab = encontrarCabecalho(linhas);
  if (!cab) {
    if (linhas.some((l) => l.some((c) => String(c).trim()))) {
      throw new Error(`Não achei o cabeçalho na aba "${aba}": as ${LINHAS_CABECALHO} primeiras linhas precisam ter uma linha com a coluna "Carta" ou "Nome" (e mais uma, como "Estado" ou "Idioma").`);
    }
    await chamar(token, `${API}/${id}/values/${encodeURIComponent(intervalo(aba, 'A1'))}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({ values: [CABECALHO_PADRAO] }),
    });
    linhas = [CABECALHO_PADRAO];
    cab = encontrarCabecalho(linhas);
  }
  const indice = proximaLinha(linhas, cab.indice, cab.mapa);
  const data = montarEscritas(aba, indice, cab.mapa, registro);
  if (!data.length) throw new Error('Nenhuma coluna da planilha corresponde aos dados da carta.');
  // RAW: "026/128" não pode virar data nem fração
  await chamar(token, `${API}/${id}/values:batchUpdate`, {
    method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
  return indice + 1;
}
