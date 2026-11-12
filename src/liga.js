// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Catálogo da Liga Pokémon, seguindo o liga_price_sheets (SheetsIntegration: localizarCarta, gerarVariacoesNumero,
// fetchCardsearch, converterExtra, idiomas). A API de busca aceita chamadas de qualquer site (CORS liberado) e devolve,
// para cada carta, o nome em português (sNomeIdiomaPrincipal) e em inglês (sNomeIdiomaSecundario): "Nome (026/128)".
//
// Os PREÇOS ficam na página da carta (ligapokemon.com.br, variável cards_stock), protegida pelo Cloudflare e com os
// valores desenhados como imagens: o liga_price_sheets lê essa página numa aba do Chrome. Um app de celular não
// consegue, então o pokescan grava a carta no formato que a extensão lê (Carta, Estado, Extra, Idioma) e mostra o
// link da carta na Liga.
import { semAcento } from './idioma.js';
import { EDICOES } from './edicoes-liga.js';
import { semelhanca, chave } from './carta.js';

const BUSCA = 'https://www.clubedaliga.com.br/api/cardsearch';

// Códigos da Liga (os mesmos do liga_price_sheets).
export const IDIOMA_LIGA = {
  DE: 1, EN: 2, ES: 3, FR: 4, IT: 5, JP: 6, KO: 7, PT: 8, RU: 9, CH: 10, 'PT-EN': 11, CHS: 12, TH: 17, PL: 18, ID: 19,
};
export const QUALIDADE_LIGA = { M: 1, NM: 2, SP: 3, MP: 4, HP: 5, D: 6 };
// Extras aceitos na coluna "Extra" (vazio ou "Normal" = sem extra). Vários podem ser combinados com vírgula.
export const EXTRAS = [
  'Normal', 'Foil', 'Reverse Foil', 'Promo', 'Pre Release', 'Edition One', 'Shadowless', 'Shattered Holo',
  'Master Ball', 'Pokeball Foil', 'Assinada', 'Alterada', 'Textless', 'Oversize', 'Staff', 'Misprint',
];

const decodificar = (s) => String(s ?? '')
  .replace(/&([a-z]+);/gi, (m, n) => ({ eacute: 'é', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', atilde: 'ã', otilde: 'õ', ccedil: 'ç', ecirc: 'ê', ocirc: 'ô', amp: '&', quot: '"', apos: "'" }[n.toLowerCase()] ?? m))
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));

// "Pikachu (026/128)" -> { nome: 'Pikachu', numero: '026', total: '128' }
export function separarNomeLiga(texto) {
  const t = decodificar(texto).trim();
  const m = t.match(/^(.*?)\s*\(\s*([^()/]+?)\s*\/\s*([^()]+?)\s*\)\s*$/);
  if (!m) return { nome: t, numero: '', total: '' };
  return { nome: m[1].trim(), numero: m[2].trim(), total: m[3].trim() };
}

// Número da edição na Liga: o do meio da chave ("marketplace:cards:tcg2:494|792|013") ou a pasta da imagem (".../cd/792/...").
export function edicaoDoItem(item) {
  const k = String(item?.__key ?? '').split('|');
  if (k.length >= 3 && /^\d+$/.test(k[1])) return k[1];
  const m = String(item?.sPathImage ?? '').match(/\/cd\/(\d+)\//);
  return m ? m[1] : '';
}

// Sigla e nome de uma edição da Liga ('' se a edição não está na tabela).
export const siglaDaEdicao = (id) => EDICOES[id]?.[0] || '';
export const nomeDaEdicao = (id) => EDICOES[id]?.[1] || '';
const SIGLAS = new Set(Object.values(EDICOES).map(([s]) => s));
export const siglaExiste = (s) => SIGLAS.has(String(s ?? '').trim().toUpperCase());

// Siglas de coleção no texto lido no rodapé ("I ASC PT 110/217" -> ["ASC"]). Só valem siglas de 3+ caracteres
// que existem na Liga (as de 2 letras são de coleções antigas, que não imprimem a sigla, e dariam falso positivo).
// Tolera as trocas comuns do OCR entre letra e dígito (A5C -> ASC, 0BF -> OBF).
const TROCA_SIGLA = { 0: 'O', O: '0', 1: 'I', I: '1', 5: 'S', S: '5', 8: 'B', B: '8', 2: 'Z', Z: '2' };
// `daCaixa`: texto lido só na caixa da sigla, onde o idioma miúdo ("PT") costuma virar uma letra a mais ("ASCH"):
// aí também valem os começos do trecho (o mais longo que existir na Liga).
export function siglasNoTexto(texto, { daCaixa = false } = {}) {
  const achadas = [];
  for (const t of String(texto ?? '').toUpperCase().match(/[A-Z0-9]{3,6}/g) || []) {
    if (/^\d+$/.test(t)) continue;
    // a sigla pode vir grudada no idioma ("ASCPT"): tenta também sem o final de idioma
    const bases = [t, t.replace(/(PT|EN|JP|KR|KO)$/, '')];
    if (daCaixa) for (let n = t.length - 1; n >= 3; n--) bases.push(t.slice(0, n));
    for (const b of bases.filter((x) => x.length >= 3)) {
      let variantes = [b];
      for (let i = 0; i < b.length; i++) {
        const troca = TROCA_SIGLA[b[i]];
        if (troca) variantes = variantes.concat(variantes.map((v) => v.slice(0, i) + troca + v.slice(i + 1)));
      }
      const ok = variantes.find((v) => SIGLAS.has(v));
      if (ok && !achadas.includes(ok)) { achadas.push(ok); break; }
    }
  }
  return achadas;
}

// A edição do candidato é a da sigla lida? Vale também para as variantes da mesma coleção
// (ASC lida na carta = ASC, ASCES e ASCPB na Liga: padrões de Energia e de Poké Bola).
export const mesmaColecao = (siglaEdicao, siglaLida) =>
  !!siglaEdicao && !!siglaLida && (siglaEdicao === siglaLida || (siglaLida.length >= 3 && siglaEdicao.startsWith(siglaLida)));

// Item da API -> formato do app.
export function converter(item) {
  const pt = separarNomeLiga(item.sNomeIdiomaPrincipal);
  const en = separarNomeLiga(item.sNomeIdiomaSecundario || item.sNomeIdiomaPrincipal);
  const img = String(item.sPathImage || '');
  return {
    id: item.__key || `${pt.nome}|${pt.numero}/${pt.total}`,
    nome: pt.nome, // nome na Liga (português quando existe)
    nomeEN: en.nome,
    numero: pt.numero || en.numero,
    total: pt.total || en.total,
    nomeLiga: decodificar(item.sNomeIdiomaPrincipal).trim(), // texto exato usado no link da Liga
    edicao: edicaoDoItem(item),
    sigla: siglaDaEdicao(edicaoDoItem(item)),
    imagem: img ? (img.startsWith('//') ? `https:${img}` : img) : '',
  };
}

// Link da página da carta na Liga (montarUrlCarta do liga_price_sheets). Com a sigla, abre na edição certa: a mesma
// carta ("Pikachu (026/128)") pode estar em várias coleções, e a página só mostra uma.
export function linkLiga(nomeLiga, { sigla = '', numero = '' } = {}) {
  let url = `https://www.ligapokemon.com.br/?view=cards%2Fcard&tipo=1&card=${encodeURIComponent(nomeLiga)}`;
  if (sigla) url += `&ed=${encodeURIComponent(sigla)}`;
  if (sigla && numero) url += `&num=${encodeURIComponent(numero)}`;
  return url;
}

// Sigla da coleção que vai no link: a lida na carta, quando existe na Liga; senão, a da edição do candidato.
// A lida ganha porque a busca da Liga devolve uma só edição para cartas com o mesmo nome e número.
// Se a lida é a mesma coleção do candidato (ASC x ASCPB), fica a do candidato, que é mais exata.
export function siglaParaLink(candidato, siglasLidas = []) {
  const lida = siglasLidas.find(siglaExiste) || '';
  if (!lida) return candidato?.sigla || '';
  return mesmaColecao(candidato?.sigla, lida) ? candidato.sigla : lida;
}

// Fica só com as edições da coleção lida na carta, se houver alguma (senão a leitura pode estar errada: não esconde nada).
export function filtrarPorSigla(lista, siglasLidas = []) {
  if (!siglasLidas.length) return lista;
  const mesmas = lista.filter((c) => siglasLidas.some((s) => mesmaColecao(c.sigla, s)));
  return mesmas.length ? mesmas : lista;
}

export const urlBusca = (consulta, quantidade = 20) =>
  `${BUSCA}?${new URLSearchParams({ tcg: '2', maxQuantity: String(quantidade), maintype: '1', query: consulta })}`;

// Variações de um número com e sem zeros à esquerda, mantendo prefixo e sufixo (gerarVariacoesNumero):
// "26/128" -> ["26/128", "026/128"];  "TG5/TG30" -> ["TG5/TG30", "TG005/TG30", "TG5/TG030", "TG005/TG030"]
export function variacoesNumero(numero) {
  const texto = String(numero ?? '').trim().replace(/\s+/g, '').toUpperCase();
  const partes = texto.split('/');
  if (partes.length !== 2) return texto ? [texto] : [];
  const variantes = (parte) => {
    const m = parte.match(/^(.*?)(\d+)([^\d]*)$/);
    if (!m) return [parte];
    const base = m[2].replace(/^0+(?=\d)/, '');
    const tamanhos = new Set([m[2].length, base.length, Math.max(3, base.length)]);
    return [...new Set([...tamanhos].map((t) => m[1] + base.padStart(t, '0') + m[3]))];
  };
  const r = [];
  for (const a of variantes(partes[0])) for (const b of variantes(partes[1])) r.push(`${a}/${b}`);
  return [...new Set(r)];
}

// Dígitos que o OCR costuma trocar entre si (8 lido como 5, 6, 3, 0...).
const PARECIDOS = ['8530', '86', '83', '80', '0D', '1I7', '5S6', '2Z', '69', '93'];
// Trocas mais comuns, usadas para buscar números alternativos quando não há nome legível para conferir.
const TROCAS = { 0: '8', 1: '7', 3: '589', 5: '368', 6: '58', 8: '0365', 9: '3' };
const parecidos = (a, b) => a === b || PARECIDOS.some((g) => g.includes(a) && g.includes(b));
const semZeros = (s) => String(s ?? '').toUpperCase().replace(/\d+/, (d) => d.replace(/^0+(?=\d)/, ''));

// Semelhança entre duas partes de número de coleção (0 a 1), tolerante a dígitos trocados pelo OCR.
export function semelhancaNumero(a, b) {
  const x = semZeros(a), y = semZeros(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  // um dígito do começo perdido na leitura: "4" lido de "94"
  if (y.length === x.length - 1 && /^\d+$/.test(y) && x.endsWith(y)) return 0.6;
  if (x.length === y.length - 1 && /^\d+$/.test(x) && y.endsWith(x)) return 0.6;
  if (x.length !== y.length) return 0;
  let nota = 0;
  for (let i = 0; i < x.length; i++) nota += x[i] === y[i] ? 1 : parecidos(x[i], y[i]) ? 0.6 : 0;
  return 0.9 * (nota / x.length);
}

// Formas de uma parte do número: "026" -> 026, 26.
const formasDe = (parte) => {
  const p = String(parte ?? '').replace(/\D/g, '');
  return [...new Set([p, p.padStart(3, '0'), p.replace(/^0+(?=\d)/, '')])].filter((f) => f.length >= 2);
};

// Posição do número do candidato num trecho de dígitos lido no rodapé, ou -1. O número vem no COMEÇO do trecho
// (até 1 caractere de lixo antes): "1541320" tem 154 no começo; "132" no meio não conta.
function inicioNoTrecho(numero, t) {
  for (const f of formasDe(numero)) {
    const i = t.indexOf(f);
    if (i >= 0 && i <= 1) return i + f.length;
  }
  return -1;
}

// O número do candidato aparece no começo de algum trecho de dígitos lido no rodapé?
export function apareceNosTrechos(numero, trechos = []) {
  return trechos.some((t) => inicioNoTrecho(numero, t) >= 0);
}

// O total aparece DEPOIS do número no mesmo trecho? ("026" + barra lida como "1" + "128" = "0261128")
export function totalNosTrechos(numero, total, trechos = []) {
  return trechos.some((t) => {
    const fim = inicioNoTrecho(numero, t);
    return fim >= 0 && formasDe(total).some((f) => t.indexOf(f, fim) >= 0);
  });
}

// Trechos de 3 dígitos que podem ser o número da carta, na ordem em que aparecem ("1541320" -> 154, 541, 413...).
export function numerosProvaveis(trechos = [], limite = 4) {
  const r = [];
  for (const t of trechos) for (let i = 0; i + 3 <= t.length; i++) r.push(t.slice(i, i + 3));
  return [...new Set(r)].slice(0, limite);
}

// Nota de um candidato da Liga para o que foi lido na carta.
// O número pesa mais que o nome: é ele que separa as várias impressões da mesma carta.
export function pontuar(c, { nome, numero, total, qualidadeNome = 1, trechosNumero = [] }) {
  const pesos = [], notas = [];
  const noRodape = apareceNosTrechos(c.numero, trechosNumero);
  if (numero || trechosNumero.length) {
    pesos.push(0.45);
    notas.push(Math.max(numero ? semelhancaNumero(c.numero, numero) : 0, noRodape ? 0.95 : 0));
  }
  if (total || trechosNumero.length) {
    pesos.push(0.2);
    notas.push(Math.max(total ? semelhancaNumero(c.total, total) : 0, totalNosTrechos(c.numero, c.total, trechosNumero) ? 0.9 : 0));
  }
  const nomeUtil = nome && (nome.match(/\p{L}/gu) || []).length >= 3;
  if (nomeUtil) { pesos.push(0.35 * Math.max(0.2, qualidadeNome)); notas.push(semelhancaNome(c, nome)); }
  if (!pesos.length) return 0;
  return notas.reduce((s, n, i) => s + n * pesos[i], 0) / pesos.reduce((s, p) => s + p, 0);
}

// Sufixos que aparecem como logotipo na carta (o OCR lê só "Gengar") mas fazem parte do nome na Liga ("Gengar Prime").
export const SUFIXOS_NOME = ['ex', 'V', 'VMAX', 'VSTAR', 'GX', 'EX', 'Prime', 'LV.X', 'BREAK', 'Star', 'LEGEND'];
const SUFIXO = new Set(SUFIXOS_NOME.map((x) => chave(x)));

// O nome do candidato é o nome lido, talvez com um desses sufixos? (0 a 1, como semelhanca)
export function semelhancaNome(c, nome) {
  const direta = Math.max(semelhanca(c.nome, nome), semelhanca(c.nomeEN, nome));
  if (direta >= 0.8 || !nome) return direta;
  const lidas = String(nome).trim().split(/\s+/).map(chave);
  for (const n of [c.nome, c.nomeEN]) {
    const p = String(n ?? '').trim().split(/\s+/).map(chave);
    if (p.length > lidas.length && lidas.every((w, i) => w === p[i]) && p.slice(lidas.length).every((w) => SUFIXO.has(w))) return 0.9;
  }
  return direta;
}
export const nomeBate = (c, nome) => semelhancaNome(c, nome) >= 0.8;

// Com o nome legível, mostra só as cartas com esse nome (em português ou inglês): as outras vieram das buscas por
// número e só confundem. Se nenhuma bater com o nome (nome mal lido), devolve a lista toda.
export function filtrarPorNome(lista, nome, qualidadeNome = 1) {
  if (!nome || qualidadeNome < 0.5) return lista;
  const mesmas = lista.filter((c) => nomeBate(c, nome));
  return mesmas.length ? mesmas : lista;
}

// Idioma da edição pela tabela de edições: nome com "(Japanese)", "(Chinese)", "(Korean)", "Japonesas"... ou sigla no
// padrão das coleções japonesas (s4, SV7, sm10b, XY8R, BW5, CP6, M6a; "JP" no fim). Exceções em inglês/português:
// SV1 (Escarlate e Violeta) e as coleções do McDonald's. Sem pista: null.
const CODIGO_JAPONES = /^(?:s|sv|sm|m|xy|bw|cp|sp)\d+[a-z]?$/i;
export function idiomaPelaEdicao(id) {
  const [sigla = '', nome = ''] = EDICOES[id] || [];
  if (!sigla) return null;
  if (/chinese|chin[eê]s|\(ch\)/i.test(nome)) return 'ZH';
  if (/korean|corean|\(kr\)/i.test(nome)) return 'KO';
  if (/japanese|japon|\(jp\)/i.test(nome)) return 'JP';
  if (sigla === 'SV1' || /mcdonald/i.test(nome)) return null;
  if (/JP$/i.test(sigla) || CODIGO_JAPONES.test(sigla)) return 'JP';
  return null;
}

// Idioma da edição pela numeração da Liga: as edições asiáticas que repetem a numeração de outra ganham um sufixo
// ("030C/103" = chinesa, "026K/069" = coreana, "008JP/032" = japonesa). Sem sufixo, não dá para saber (devolve null).
// A busca da Liga não informa o idioma da edição; ele só aparece na página da carta, protegida pelo Cloudflare.
export function idiomaDaEdicao(c) {
  const m = String(c.numero ?? '').toUpperCase().match(/^\d+(JP|C|K)$/);
  if (!m) return idiomaPelaEdicao(c.edicao);
  return { JP: 'JP', C: 'ZH', K: 'KO' }[m[1]];
}

// Tira as edições de outro idioma (quando a numeração indica o idioma). Mantém a lista se o filtro esvaziá-la.
export function filtrarPorIdioma(lista, idioma) {
  if (!idioma) return lista;
  const grupo = (i) => (i === 'CH' || i === 'CHS' || i === 'ZH' ? 'ZH' : i === 'KR' ? 'KO' : i);
  const alvo = grupo(idioma);
  // se há edição marcada com o idioma da carta (030C para chinês), as sem sufixo são as de outro idioma
  const marcadas = lista.filter((c) => idiomaDaEdicao(c) === alvo);
  if (marcadas.length) return marcadas;
  // senão, saem só as marcadas com OUTRO idioma; as sem sufixo podem ser de qualquer um
  const ok = lista.filter((c) => !idiomaDaEdicao(c));
  return ok.length ? ok : lista;
}

// O total lido identifica a coleção: se algum candidato bate exatamente com número E total lidos, as impressões de
// outras coleções (outro total: edições japonesas, chinesas, promos) saem da lista.
export function filtrarPorTotal(lista, { numero, total } = {}) {
  const t = semZeros(total), n = semZeros(numero);
  if (!t || !n) return lista;
  const exatas = lista.filter((c) => semZeros(c.numero) === n && semZeros(c.total) === t);
  return exatas.length ? lista.filter((c) => semZeros(c.total) === t) : lista;
}

// Consultas a fazer, da mais específica para a mais solta.
// Como no liga_price_sheets: "Nome (nº/total)", "Nome nº/total", só o nome e só o número (com e sem zeros).
// Para tolerar erros do OCR, também: último dígito do total em aberto, número sem total e só o total.
export function consultas({ nome, numero, total, qualidadeNome = 1, trechosNumero = [] }) {
  const q = [];
  const n = semZeros(numero), t = semZeros(total);
  const nomeLimpo = semAcento(String(nome ?? '').replace(/[’‘`´]/g, "'")).replace(/[^a-z0-9 '\-.]/g, ' ').replace(/\s+/g, ' ').trim();
  const nomeBom = nomeLimpo.length >= 3 && qualidadeNome >= 0.5; // nome ilegível só atrapalha a busca
  const nums = n && t ? variacoesNumero(`${n}/${t}`) : [];
  const pad = (s) => (/^\d+$/.test(s) ? s.padStart(3, '0') : s);
  if (nomeBom) nums.forEach((v) => q.push(`${nome.trim()} (${v})`));
  // nome + começo do número ("Boss's Orders (154"): acha a impressão certa mesmo com a barra/total mal lidos
  const nomeBusca = String(nome ?? '').replace(/[’‘`´]/g, "'").trim();
  if (nomeBom) numerosProvaveis([pad(n), ...trechosNumero].filter((x) => /^\d{3,}$/.test(x))).forEach((d) => q.push(`${nomeBusca} (${d}`));
  q.push(...nums);
  if (n && /^\d{2,}$/.test(t)) q.push(`${pad(n)}/${pad(t).slice(0, -1)}`);
  if (n) q.push(`${pad(n)}/`);
  // sem nome legível (ex.: carta em japonês/chinês), o número é a única pista: tenta também as trocas de um dígito
  if (!nomeBom && /^\d{3}$/.test(pad(n)) && /^\d+$/.test(t)) {
    const base = pad(n);
    const alternativos = [];
    for (let i = 0; i < base.length; i++) for (const d of TROCAS[base[i]] || '') alternativos.push(base.slice(0, i) + d + base.slice(i + 1));
    alternativos.slice(0, 4).forEach((a) => q.push(`${a}/${pad(t)}`));
  }
  if (nomeBom) q.push(nomeLimpo);
  // por último, nome + número com um dígito trocado (030 lido como 050): só roda se nada bater antes
  if (nomeBom && /^\d{3}$/.test(pad(n))) {
    const base = pad(n);
    const alt = [];
    for (let i = 0; i < base.length; i++) for (const d of TROCAS[base[i]] || '') alt.push(base.slice(0, i) + d + base.slice(i + 1));
    alt.slice(0, 3).forEach((a) => q.push(`${nomeBusca} (${a}`));
  }
  if (t && /^\d+$/.test(t)) q.push(`/${pad(t)}`);
  return [...new Set(q)];
}

// Chamadas à busca da Liga: no mínimo 400 ms entre elas e, se vier 429 (muitas chamadas), espera 2, 4 e 8 s
// (fetchCardsearch do liga_price_sheets).
let ultimaChamada = 0;
let fila = Promise.resolve();
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

function pedir(consulta) {
  const tarefa = fila.then(async () => {
    const esperas = [2000, 4000, 8000];
    for (let tentativa = 0; ; tentativa++) {
      const falta = 400 - (Date.now() - ultimaChamada);
      if (falta > 0) await dormir(falta);
      let r;
      try {
        r = await fetch(urlBusca(consulta), { headers: { Accept: 'application/json' } });
      } catch {
        r = null; // rede caiu ou resposta sem CORS (erro do servidor)
      } finally {
        ultimaChamada = Date.now();
      }
      if (r?.ok) return (await r.json()).data || [];
      const repetir = !r || r.status === 429 || r.status >= 500;
      if (!repetir || tentativa >= esperas.length) {
        throw new Error(r ? `A busca da Liga respondeu ${r.status}` : 'Não consegui falar com a Liga (sem internet ou site fora do ar).');
      }
      await dormir(esperas[tentativa]);
    }
  });
  fila = tarefa.catch(() => {});
  return tarefa;
}

// Busca candidatos na Liga e devolve ordenados pela nota (campo "nota", de 0 a 1).
// Para assim que achar uma carta com número, total e nome batendo (poupa chamadas).
export async function buscarCandidatos(lido) {
  const lista = consultas(lido);
  const vistos = new Map();
  let erro = null, algumaDeuCerto = false;
  for (const consulta of lista) {
    try {
      for (const item of await pedir(consulta)) {
        const c = converter(item);
        if (!vistos.has(c.id)) vistos.set(c.id, { ...c, nota: pontuar(c, lido) });
      }
      algumaDeuCerto = true;
    } catch (e) {
      erro = e;
      if (/falar com a Liga/.test(e.message)) break; // sem conexão: não adianta insistir
    }
    // nome e número batem: chega (sem nome legível, segue buscando os números alternativos)
    // só quando nome, número E total batem exatamente (uma nota alta com total diferente pode ser dígito mal lido)
    const exata = [...vistos.values()].some((c) => semZeros(c.numero) === semZeros(lido.numero) && lido.total
      && semZeros(c.total) === semZeros(lido.total) && Math.max(semelhanca(c.nome, lido.nome || ''), semelhanca(c.nomeEN, lido.nome || '')) >= 0.85);
    if ((lido.qualidadeNome ?? 1) >= 0.5 && exata) break;
  }
  // Nome legível, mas nenhuma carta com esse nome bate com o número ou o total lidos. Duas causas comuns:
  //  - o primeiro dígito do número se perdeu ("4/102" lido de "94/102"): busca "Gengar (014" ... "Gengar (094";
  //    reimpressões como a coleção clássica de 30 anos ficam na Liga com outro total ("Gengar (094/30)");
  //  - falta o sufixo que vem como logotipo ("Gengar Prime").
  const nomeBom = lido.nome && (lido.qualidadeNome ?? 1) >= 0.5 && chave(lido.nome).length >= 3;
  const achou = () => [...vistos.values()].some((c) => nomeBate(c, lido.nome)
    && ((lido.total && semZeros(c.total) === semZeros(lido.total)) || (lido.numero && semelhancaNumero(c.numero, lido.numero) >= 0.9)));
  if (nomeBom && !achou()) {
    const nomeBusca = lido.nome.trim();
    const n = semZeros(lido.numero);
    const extras = [];
    if (/^\d{1,2}$/.test(n)) for (let d = 1; d <= 9; d++) extras.push(`${nomeBusca} (${`${d}${n}`.padStart(3, '0')}`);
    for (const sufixo of SUFIXOS_NOME) extras.push(`${nomeBusca} ${sufixo}`);
    for (const consulta of extras) {
      try {
        for (const item of await pedir(consulta)) {
          const c = converter(item);
          if (!vistos.has(c.id)) vistos.set(c.id, { ...c, nota: pontuar(c, lido) });
        }
      } catch (e) {
        if (/falar com a Liga/.test(e.message)) break;
      }
      // os 9 "dígito perdido" rodam sempre (vários podem existir em outro idioma); os sufixos param no primeiro que serve
      if (!consulta.includes(' (') && achou()) break;
    }
  }
  if (!algumaDeuCerto && erro) throw erro;
  // as cartas com o nome lido vêm antes: o corte em 12 não pode deixá-las de fora
  const peso = (c) => (nomeBom && nomeBate(c, lido.nome) ? 1 : 0);
  return [...vistos.values()].sort((a, b) => peso(b) - peso(a) || b.nota - a.nota).slice(0, 12);
}
