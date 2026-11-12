// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
//
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://polyformproject.org/licenses/noncommercial/1.0.0/
//
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/bot-leilao)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Idioma de uma carta a partir do texto lido pelo OCR.
// Mesma lógica do bot-leilao (src/idioma.js), em módulo ES para rodar no navegador.
// Códigos: EN, PT, JP, CH (chinês tradicional), CHS (chinês simplificado), KO (coreano; códigos da Liga Pokémon).
// Quando só dá para saber que é chinês (sem distinguir CH de CHS), devolve 'ZH'.

export const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const NOMES_IDIOMA = {
  EN: 'Inglês', PT: 'Português', JP: 'Japonês', KO: 'Coreano', KR: 'Coreano',
  CH: 'Chinês tradicional', CHS: 'Chinês simplificado', ZH: 'Chinês',
};

// Idiomas que usam o alfabeto latino (nome e número lidos pelo OCR "eng+por").
export const LATINOS = new Set(['EN', 'PT']);

// Valor digitado (sigla ou nome por extenso) -> código.
export function normalizarIdioma(v) {
  const s = semAcento(v).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (/^(en|eng|ingles|english)$/.test(s)) return 'EN';
  if (/^(pt|por|pt br|ptbr|portugues|portuguese)$/.test(s)) return 'PT';
  if (/^(jp|ja|jpn|japones|japanese)$/.test(s)) return 'JP';
  if (/^(kr|ko|kor|coreano|korean)$/.test(s)) return 'KO';
  if (/^(chs|zh cn|cn|chines simplificado|simplificado|simplified chinese|chinese simplified)$/.test(s)) return 'CHS';
  if (/^(ch|cht|zh|zh tw|tw|chines|chines tradicional|tradicional|chinese|traditional chinese)$/.test(s)) return 'CH';
  return '';
}

// Caracteres que só existem (ou só são usados) numa das escritas. Lista curta, voltada a termos de cartas.
const SIMPLIFICADOS = new Set([...'点伤宝梦击术从红绿蓝闪华网电动战对见这个们来时会为无发长门马鸟鱼龙兽样级数气体质学师训练场备页类种系览获进还过后开关业东车书']);
const TRADICIONAIS = new Set([...'點傷寶夢擊術從紅綠藍閃華網電動戰對見這個們來時會為無發長門馬鳥魚龍獸樣級數氣體質學師訓練場備頁類種係覽獲進還過後開關業東車書']);
// (os conjuntos têm caracteres comuns às duas escritas; só contam os que NÃO estão no outro conjunto)

const PT_PALAVRAS = [
  'fraqueza', 'resistencia', 'recuo', 'habilidade', 'treinador', 'energia', 'ataque', 'dano', 'voce', 'seu', 'sua',
  'seus', 'suas', 'para', 'uma', 'nao', 'com', 'pelo', 'pela', 'quando', 'cada', 'baralho', 'descarte', 'jogador',
  'oponente', 'pokemon ativo', 'banco', 'moeda', 'carta', 'cartas', 'tem', 'que', 'mais', 'como', 'este', 'esta',
  'dos', 'das', 'pode', 'todas', 'todos', 'turno', 'durante', 'compre', 'embaralhe', 'procure', 'escolha', 'basico',
  'estagio', 'evolui', 'apoiador', 'estadio', 'ferramenta', 'altura', 'peso', 'cara', 'coroa', 'ligue', 'mao',
];
const EN_PALAVRAS = [
  'weakness', 'resistance', 'retreat', 'ability', 'trainer', 'energy', 'attack', 'damage', 'your', 'you', 'the',
  'this', 'that', 'with', 'for', 'once', 'each', 'deck', 'discard', 'player', 'opponent', 'active pokemon', 'bench',
  'coin', 'flip', 'card', 'cards', 'and', 'from', 'its', 'their', 'when', 'into', 'more', 'turn', 'during', 'draw',
  'search', 'shuffle', 'choose', 'basic', 'stage', 'evolves', 'supporter', 'stadium', 'tool', 'heads', 'tails',
  'attach', 'hand', 'height', 'weight',
];

// Distância de edição (para aceitar palavras-chave com uma ou duas letras lidas errado: "Fraquesa").
function distancia(a, b) {
  let ant = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(ant[j] + 1, cur[j - 1] + 1, ant[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    ant = cur;
  }
  return ant[b.length];
}

// Classifica um texto já lido pelo OCR. Devolve EN/PT/JP/KO/CH/CHS/ZH ou null (sem certeza).
export function classificarTexto(texto) {
  const t = String(texto ?? '');
  const conta = (re) => (t.match(re) || []).length;
  // "ー" e "・" ficam de fora: o OCR japonês os tira de qualquer traço ou ponto da carta
  const kana = conta(/[぀-ヺヽ-ヿ]/g);
  const hangul = conta(/[가-힯ᄀ-ᇿ]/g);
  const han = conta(/[一-鿿]/g);

  if (hangul >= 4 && hangul >= kana) return 'KO';
  // Japonês tem muito kana; texto chinês lido pelo OCR japonês ganha só alguns kana espúrios no meio dos ideogramas.
  if (kana >= 4 && kana * 3 >= han) return 'JP';
  if (han >= 4) {
    let s = 0, tr = 0;
    for (const c of t) { if (SIMPLIFICADOS.has(c) && !TRADICIONAIS.has(c)) s++; if (TRADICIONAIS.has(c) && !SIMPLIFICADOS.has(c)) tr++; }
    if (s > tr) return 'CHS';
    if (tr > s) return 'CH';
    return 'ZH';
  }

  const palavras = semAcento(t).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (palavras.length < 4) return null;
  const junto = ` ${palavras.join(' ')} `;
  // palavra-chave longa (6+ letras) vale também com até ~25% das letras erradas pelo OCR
  const temPalavra = (w) => junto.includes(` ${w} `)
    || (w.length >= 6 && !w.includes(' ') && palavras.some((p) => Math.abs(p.length - w.length) <= 2 && distancia(p, w) <= Math.floor(w.length / 4)));
  const pontua = (lista) => lista.reduce((n, w) => n + (temPalavra(w) ? (w.length >= 6 ? 3 : 1) : 0), 0);
  const acentosPt = conta(/[ãõç]/gi);
  const pt = pontua(PT_PALAVRAS) + Math.min(acentosPt, 3);
  const en = pontua(EN_PALAVRAS);
  if (pt === en || Math.max(pt, en) < 2) return null;
  return pt > en ? 'PT' : 'EN';
}
