// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Interpretação do texto lido pelo OCR: número de coleção, nome da carta e semelhança de nomes.
// Funções puras (sem DOM), testadas em testes/carta.test.js.
import { semAcento } from './idioma.js';

// Chave de comparação: igual à do bot (pontuação, símbolos e espaços ignorados).
export const chave = (s) => semAcento(s).replace(/[^a-z0-9]/g, '');

// Confusões comuns do OCR em trechos que deveriam ser números.
const digitos = (s) => s.replace(/[Oo]/g, '0').replace(/[IiLl|!]/g, '1').replace(/[Ss]/g, '5').replace(/[B]/g, '8');

// Prefixos de subcoleções (Trainer Gallery, Galarian Gallery, Radiant Collection, Shiny Vault...).
const PREFIXOS = 'TG|GG|RC|SV|SH|H';
// Promos: "SWSH123", "SVP 045", "SM210", "XY124", "BW95", "DP45", "HGSS20".
const PROMO = /\b(SWSH|SVP|SVE|SM|XY|BW|DP|HGSS)\s*-?\s*([0-9OIL]{1,3})\b/;

// Extrai o número de coleção da faixa de baixo da carta: "025/165", "TG05/TG30", "185/165", "SVP 045".
// Devolve { numero, total } (total = '' em promos) ou null.
export function extrairNumero(texto) {
  const t = String(texto ?? '').toUpperCase().replace(/[\\⁄∕]/g, '/');

  const sub = t.match(new RegExp(`\\b(${PREFIXOS})\\s*([0-9OIL]{1,3})\\s*/\\s*(${PREFIXOS})\\s*([0-9OIL]{1,3})\\b`));
  if (sub) return { numero: sub[1] + digitos(sub[2]), total: sub[3] + digitos(sub[4]) };

  // "025/165" (aceitando O/I/L/S/B lidos no lugar de dígitos). Fica com o que tiver mais cara de número.
  // Até 4 caracteres no total: um símbolo colado depois do número (raridade, marca de regulação) costuma virar
  // dígito ("092/2076"); nesse caso o total fica com o mesmo tamanho do número ("207").
  const re = /([0-9OILSB|]{1,3})\s*\/\s*([0-9OILSB|]{2,4})(?![0-9])/g;
  let melhor = null;
  for (const m of t.matchAll(re)) {
    const numero = digitos(m[1]);
    let total = digitos(m[2]);
    if (total.length === 4) total = total.slice(0, Math.max(3, numero.length));
    if (!/^\d+$/.test(numero) || !/^\d+$/.test(total)) continue;
    const reais = (m[1] + m[2]).replace(/[^0-9]/g, '').length; // dígitos lidos como dígitos mesmo
    if (!melhor || reais > melhor.reais) melhor = { numero, total, reais };
  }
  if (melhor) return { numero: melhor.numero, total: melhor.total };

  // barra lida como "1", "I" ou "7": "0261128" -> 026/128 (só com 3 dígitos de cada lado)
  const semBarra = t.match(/(?<![0-9])([0-9O]{3})[1I|7]([0-9O]{3})(?![0-9])/);
  if (semBarra) return { numero: digitos(semBarra[1]), total: digitos(semBarra[2]) };

  const promo = t.match(PROMO);
  if (promo) return { numero: promo[1] + digitos(promo[2]).padStart(promo[1] === 'SVP' ? 3 : 1, '0'), total: '' };
  return null;
}

// Número sem zeros à esquerda ("025" -> "25"; "TG05" fica igual).
export const numeroCatalogo = (numero) => String(numero ?? '').replace(/^0+(?=\d)/, '');

// Palavras da faixa de cima que não fazem parte do nome.
const RUIDO = [
  /\b(HP|PV|PS|KP)\s*\d+\b/gi, /\b\d+\s*(HP|PV|PS|KP)\b/gi,
  /\b(BASIC|BASICO|BÁSICO|BASIQUE|STAGE\s*[12]?|ESTAGIO\s*[12]?|ESTÁGIO\s*[12]?|EVOLVES\s*FROM.*|EVOLUI\s*DE.*|EVOLUCAO.*|EVOLUÇÃO.*)\b/gi,
  /\b(TRAINER|TREINADOR|ITEM|SUPPORTER|APOIADOR|STADIUM|ESTADIO|ESTÁDIO|POKEMON\s+TOOL|FERRAMENTA\s+POKEMON|ENERGY|ENERGIA)\b/gi,
];
// Ligações minúsculas que fazem parte do nome ("Gabite da Cíntia", "Team Rocket's", "Misty's").
const LIGACOES = new Set(['da', 'de', 'do', 'das', 'dos', 'di', 'du', 'del', 'of', 'la', 'le']);
// Sufixos de mecânica que fazem parte do nome e devem ser mantidos como estão.
const SUFIXOS = { ex: 'ex', gx: 'GX', v: 'V', vmax: 'VMAX', vstar: 'VSTAR', vunion: 'V-UNION', lvx: 'LV.X', break: 'BREAK', prime: 'Prime' };

// Um pedaço do texto parece parte de um nome? (descarta "Õ55HH5", "i22000008", "0", "M2"...)
function pareceNome(p) {
  if (SUFIXOS[p.toLowerCase()]) return true;
  const letras = (p.match(/\p{L}/gu) || []).length;
  if (/\d/.test(p)) return false; // nomes não têm dígitos (exceto Porygon2 etc., raros)
  if (letras < 2) return false;
  return letras / p.length >= 0.75;
}

// Extrai o nome da carta do texto lido no topo. Devolve '' quando não há nada aproveitável.
export function extrairNome(texto) {
  const linhas = String(texto ?? '').split(/\r?\n/).map((linha) => {
    let s = linha;
    for (const re of RUIDO) s = s.replace(re, ' ');
    s = s.replace(/[^\p{L}\p{N}'’.\- ]/gu, ' ').replace(/\s+/g, ' ').trim();
    // inicial grande separada do resto pelo OCR (fonte das Scarlet & Violet): "G abite" -> "Gabite"
    s = s.replace(/(^|\s)(\p{Lu}) (\p{Ll}{2,})/gu, '$1$2$3');
    const partes = s.split(' ').map((p) => p.replace(/^[.'’-]+|[.'’-]+$/g, '')).filter(Boolean);
    // fica com o maior trecho seguido de pedaços com cara de nome
    let melhor = [], atual = [];
    for (const p of partes) {
      if (pareceNome(p)) { atual.push(p); if (atual.join('').length > melhor.join('').length) melhor = [...atual]; } else atual = [];
    }
    // um sufixo sozinho ("V", "ex") não é nome; sobras minúsculas antes do nome ("pés Pikachu") também não
    while (melhor.length && SUFIXOS[melhor[0].toLowerCase()]) melhor.shift();
    while (melhor.length > 1 && /^\p{Ll}/u.test(melhor[0]) && melhor.slice(1).some((p) => /^\p{Lu}/u.test(p))) melhor.shift();
    // sobras depois do nome: pedaço minúsculo curto ("Slowbro ya") ou sigla inventada em MAIÚSCULAS ("Sowbro BOS")
    const sobra = (p) => !SUFIXOS[p.toLowerCase()] && !LIGACOES.has(p)
      && ((p.length <= 2 && /^\p{Ll}+$/u.test(p)) || (p.length <= 4 && !/\p{Ll}/u.test(p)));
    while (melhor.length > 1 && /^\p{Lu}\p{Ll}/u.test(melhor[0]) && sobra(melhor[melhor.length - 1])) melhor.pop();
    return melhor.join(' ');
  });
  const letras = (s) => (s.match(/\p{L}/gu) || []).length;
  const melhor = linhas.filter((s) => letras(s) >= 3).sort((a, b) => qualidadeNome(b) - qualidadeNome(a) || letras(b) - letras(a))[0] || '';
  return melhor.split(' ').map((p) => SUFIXOS[p.toLowerCase()] ?? p).join(' ');
}

// Quão "legível" é um nome extraído, de 0 a 1 (usado para decidir se vale a pena buscar pelo nome).
export function qualidadeNome(nome) {
  const s = String(nome ?? '').trim();
  const letras = (s.match(/\p{L}/gu) || []).length;
  if (letras < 3) return 0;
  const palavras = s.split(' ');
  let nota = 1;
  // maiúsculas no meio da palavra ("sSNÉi") e muitas palavras curtas são sinais de leitura ruim
  for (const p of palavras) if (/\p{Ll}\p{Lu}/u.test(p) && !SUFIXOS[p.toLowerCase()]) nota -= 0.35;
  // palavra toda em MAIÚSCULAS ("TARA") costuma ser lixo do desenho ou do brilho; nomes vêm em "Pikachu"
  for (const p of palavras) if (p.length >= 3 && !/\p{Ll}/u.test(p) && !SUFIXOS[p.toLowerCase()]) nota -= 0.3;
  const curtas = palavras.filter((p) => p.length <= 2 && !SUFIXOS[p.toLowerCase()] && !LIGACOES.has(p)).length;
  nota -= 0.2 * curtas;
  if (!/^\p{Lu}/u.test(s)) nota -= 0.15; // nomes começam com maiúscula
  if (palavras.length > 4) nota -= 0.2;
  return Math.max(0, Math.min(1, nota));
}

// Distância de edição (Levenshtein).
function distancia(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    ant = cur;
  }
  return ant[b.length];
}

// Semelhança entre dois nomes, de 0 (nada a ver) a 1 (iguais). Também vale quando um contém o outro.
export function semelhanca(a, b) {
  const x = chave(a), y = chave(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.includes(y) || y.includes(x)) return 0.9 * Math.min(x.length, y.length) / Math.max(x.length, y.length) + 0.1;
  return 1 - distancia(x, y) / Math.max(x.length, y.length);
}

// Texto da coluna "carta", no mesmo formato que o bot-leilao usa: "Darkrai (105/189)".
export function formatarCarta({ nome, numero, total }) {
  const n = String(nome ?? '').trim();
  const num = [numero, total].filter(Boolean).join('/');
  if (!n) return num;
  return num ? `${n} (${num})` : n;
}
