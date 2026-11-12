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
// - Só preenche Quantidade, Carta, Estado, Extra, Idioma e Link liga (formato do liga_price_sheets e do bot-leilao).
// - Se a mesma carta já está na aba, soma a quantidade na linha dela em vez de criar outra.
import { semAcento } from './idioma.js';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const LINHAS_CABECALHO = 15;

const norm = (s) => semAcento(String(s ?? '').replace(/[º°]/g, 'o')).replace(/\s+/g, ' ').trim();

// As únicas colunas que o app preenche. "nomes" = títulos aceitos (sem acento, minúsculas).
// "Nome" vale como "Carta" (o liga_price_sheets aceita os dois), mas "Carta" tem preferência se houver as duas.
export const COLUNAS = [
  { campo: 'quantidade', nomes: ['quantidade', 'qtd', 'qtde', 'qtd.', 'quant.'] },
  { campo: 'carta', nomes: ['carta', 'nome', 'nome da carta', 'card'] },
  { campo: 'estado', nomes: ['estado', 'condicao', 'qualidade', 'condition', 'cond', 'cond.'] },
  { campo: 'extra', nomes: ['extra', 'extras'] },
  { campo: 'idioma', nomes: ['idioma', 'lingua', 'language'] },
  { campo: 'liga', nomes: ['link liga', 'link liga pokemon', 'link ligapokemon', 'liga', 'link', 'link da liga'] },
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
  const t = titulos.map(norm);
  for (const col of COLUNAS) {
    for (const nome of col.nomes) { // na ordem de preferência ("carta" antes de "nome")
      const i = t.indexOf(nome);
      if (i >= 0) { mapa[col.campo] = i; break; }
    }
  }
  return mapa;
}

// Procura o cabeçalho nas primeiras linhas: a primeira com "Carta" (ou "Nome") e pelo menos mais uma coluna conhecida.
// Devolve { indice, mapa } ou null.
export function encontrarCabecalho(linhas) {
  for (let i = 0; i < Math.min(LINHAS_CABECALHO, linhas.length); i++) {
    const mapa = mapearColunas(linhas[i] || []);
    if ('carta' in mapa && Object.keys(mapa).length >= 2) return { indice: i, mapa };
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

// Comparação de cada campo: maiúsculas, acentos e espaços não importam; extra vazio = "Normal";
// coreano KR = KO (a Liga usa KO).
const chaveCarta = (v) => norm(v).replace(/[^a-z0-9/()]/g, '');
const extraNorm = (v) => { const e = norm(v); return e === 'normal' || e === 'sem extra' ? '' : e; };
const idiomaNorm = (v) => { const i = norm(v); return i === 'ko' ? 'kr' : i; };

// Linha (índice) onde a MESMA carta já está — mesma Carta, Estado, Extra e Idioma —, ou -1.
// Só vale se a planilha tiver a coluna Quantidade (senão não há onde somar).
export function linhaDaMesmaCarta(linhas, indiceCabecalho, mapa, registro) {
  if (!('quantidade' in mapa)) return -1;
  const cel = (l, campo) => (campo in mapa ? String(l?.[mapa[campo]] ?? '') : '');
  for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
    const l = linhas[i];
    if (chaveCarta(cel(l, 'carta')) !== chaveCarta(registro.carta)) continue;
    if ('estado' in mapa && norm(cel(l, 'estado')) !== norm(registro.estado)) continue;
    if ('extra' in mapa && extraNorm(cel(l, 'extra')) !== extraNorm(registro.extra)) continue;
    if ('idioma' in mapa && idiomaNorm(cel(l, 'idioma')) !== idiomaNorm(registro.idioma)) continue;
    return i;
  }
  return -1;
}

// Quantidade que já estava na linha. Vazia conta como 1 (a linha já representa uma carta); texto que não é número
// devolve null (aí a carta vai para uma linha nova, para não estragar o que está lá).
export function quantidadeExistente(valor) {
  const t = String(valor ?? '').trim();
  if (!t) return 1;
  return /^\d+$/.test(t) ? Number(t) : null;
}

// Escritas (uma por célula) da linha `indice` (0 = linha 1). Só campos mapeados e com valor.
export function montarEscritas(aba, indice, mapa, registro) {
  return Object.entries(mapa)
    .filter(([campo]) => registro[campo] != null && String(registro[campo]) !== '')
    .map(([campo, col]) => {
      const v = registro[campo];
      return { range: intervalo(aba, `${letraColuna(col)}${indice + 1}`), values: [[campo === 'quantidade' ? Number(v) : String(v)]] };
    });
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
  const d = await chamar(token, `${API}/${id}?fields=properties.title,sheets.properties(title,sheetId)`);
  return {
    titulo: d.properties.title,
    abas: d.sheets.map((s) => s.properties.title),
    gids: Object.fromEntries(d.sheets.map((s) => [String(s.properties.sheetId), s.properties.title])),
  };
}

// Aba indicada no link ("...#gid=552223964" ou "?gid=..."), ou '' se o link não tiver.
export function gidDaPlanilha(url) {
  const m = String(url ?? '').match(/[#?&]gid=(\d+)/);
  return m ? m[1] : '';
}

// Grava uma carta. Se a mesma carta (Carta, Estado, Extra e Idioma) já está na aba, SOMA a quantidade na linha dela;
// senão, grava na próxima linha livre. Cria o cabeçalho se a aba estiver vazia.
// Devolve { linha (1 = primeira), somada, quantidade }.
export async function adicionarCarta(token, id, aba, registro) {
  const url = `${API}/${id}/values/${encodeURIComponent(intervalo(aba))}?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE`;
  let linhas = (await chamar(token, url)).values || [];
  let cab = encontrarCabecalho(linhas);
  if (!cab) {
    if (linhas.some((l) => l.some((c) => String(c).trim()))) {
      throw new Error(`Não achei o cabeçalho na aba "${aba}": as ${LINHAS_CABECALHO} primeiras linhas precisam ter uma linha com a coluna "Carta" (e mais uma, como "Estado" ou "Idioma").`);
    }
    await chamar(token, `${API}/${id}/values/${encodeURIComponent(intervalo(aba, 'A1'))}?valueInputOption=RAW`, {
      method: 'PUT', body: JSON.stringify({ values: [CABECALHO_PADRAO] }),
    });
    linhas = [CABECALHO_PADRAO];
    cab = encontrarCabecalho(linhas);
  }
  const lido = Math.max(1, Number(registro.quantidade) || 1);

  const igual = linhaDaMesmaCarta(linhas, cab.indice, cab.mapa, registro);
  const antes = igual >= 0 ? quantidadeExistente(linhas[igual]?.[cab.mapa.quantidade]) : null;
  if (igual >= 0 && antes != null) {
    const total = antes + lido;
    await chamar(token, `${API}/${id}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: [{ range: intervalo(aba, `${letraColuna(cab.mapa.quantidade)}${igual + 1}`), values: [[total]] }] }),
    });
    return { linha: igual + 1, somada: true, quantidade: total };
  }

  const indice = proximaLinha(linhas, cab.indice, cab.mapa);
  const data = montarEscritas(aba, indice, cab.mapa, { ...registro, quantidade: lido });
  if (!data.length) throw new Error('Nenhuma coluna da planilha corresponde aos dados da carta.');
  // RAW: "026/128" não pode virar data nem fração
  await chamar(token, `${API}/${id}/values:batchUpdate`, {
    method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }),
  });
  return { linha: indice + 1, somada: false, quantidade: lido };
}
