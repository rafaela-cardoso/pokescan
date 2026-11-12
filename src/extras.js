// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Sugestão de "extra" pela imagem: padrões Poké Ball e Master Ball (reverse holo das coleções Scarlet & Violet).
// Nessas cartas, a caixa de texto tem um emblema grande no canto de baixo à direita, mais claro (brilho do foil):
//   - Poké Ball: círculo claro cortado por uma faixa horizontal com um círculo menor no meio;
//   - Master Ball: mesma silhueta, mas a metade de cima mais escura (o "M" e as duas bolinhas laterais).
// O emblema é comparado com a mesma caixa de texto do lado esquerdo (sem emblema). Os pixels escuros do texto
// são ignorados. É só uma SUGESTÃO: o campo Extra continua editável.
//
// As medidas ficam em funções puras (sobre uma matriz de luminância) para poderem ser testadas sem navegador.

// Geometria do emblema, em frações da carta (medida nas cartas de referência).
export const EMBLEMA = { cx: 0.765, cy: 0.765, r: 0.235 };
// Área de comparação: mesma caixa de texto, do lado esquerdo.
const REFERENCIA = { x0: 0.06, x1: 0.42, y0: 0.62, y1: 0.86 };

// Luminância de um ImageData (0..255) em Float32Array.
export function luminancia(img) {
  const { data, width, height } = img;
  const l = new Float32Array(width * height);
  for (let i = 0, p = 0; p < l.length; i += 4, p++) l[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  return { l, w: width, h: height };
}

const mediana = (v) => {
  if (!v.length) return 0;
  const s = Float32Array.from(v).sort();
  return s[s.length >> 1];
};

// Valores de luminância de uma região, sem os pixels de texto (bem mais escuros que o fundo).
function amostrar({ l, w, h }, dentro, limiarTexto) {
  const out = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!dentro(x / w, y / h)) continue;
      const v = l[y * w + x];
      if (v >= limiarTexto) out.push(v);
    }
  }
  return out;
}

// Medidas do emblema. Devolve { contraste, cimaMenosBaixo, faixa } em unidades de luminância.
export function medirEmblema(mat) {
  const { cx, cy, r } = EMBLEMA;
  const prop = mat.h / mat.w; // carta em retrato: r é em largura, y precisa ser corrigido
  const ry = r / prop;
  // fundo da caixa de texto (lado esquerdo), sem o texto
  const refBruta = amostrar(mat, (x, y) => x >= REFERENCIA.x0 && x <= REFERENCIA.x1 && y >= REFERENCIA.y0 && y <= REFERENCIA.y1, 0);
  const fundo = mediana(refBruta);
  const limiarTexto = fundo * 0.72;
  const ref = refBruta.filter((v) => v >= limiarTexto);
  const fundoSemTexto = mediana(ref);

  const noCirculo = (x, y, rmin, rmax) => {
    const d = Math.hypot((x - cx) / r, (y - cy) / ry);
    return d >= rmin && d <= rmax;
  };
  const circulo = amostrar(mat, (x, y) => noCirculo(x, y, 0, 0.9) && x < 0.97 && y < 0.9, limiarTexto);
  // metade de cima (sem a faixa do meio) e metade de baixo
  const cima = amostrar(mat, (x, y) => noCirculo(x, y, 0.2, 0.85) && (cy - y) / ry > 0.22 && Math.abs(x - cx) / r < 0.6, limiarTexto);
  const baixo = amostrar(mat, (x, y) => noCirculo(x, y, 0.2, 0.85) && (y - cy) / ry > 0.22 && Math.abs(x - cx) / r < 0.6 && y < 0.9, limiarTexto);
  // a faixa horizontal: linha fina no centro vs. logo acima/abaixo
  const faixa = amostrar(mat, (x, y) => Math.abs(y - cy) / ry < 0.07 && Math.abs(x - cx) / r > 0.35 && Math.abs(x - cx) / r < 0.85 && x < 0.97, limiarTexto);
  const vizinhos = amostrar(mat, (x, y) => { const d = Math.abs(y - cy) / ry; return d > 0.12 && d < 0.26 && Math.abs(x - cx) / r > 0.35 && Math.abs(x - cx) / r < 0.85 && x < 0.97; }, limiarTexto);

  return {
    fundo: fundoSemTexto,
    contraste: mediana(circulo) - fundoSemTexto,
    cimaMenosBaixo: mediana(cima) - mediana(baixo),
    faixa: mediana(faixa) - mediana(vizinhos),
  };
}

// Medidas -> sugestão. Limiares calibrados (escala de 0 a 255) com as cartas de referência:
//   Poké Ball:   contraste +40, faixa -32, cima-baixo +36
//   Master Ball: contraste +13, faixa -20, cima-baixo  -9
//   5 normais:   contraste -5..+1, faixa 0..+6, cima-baixo +9..+22
// A faixa horizontal escura cortando o emblema é o sinal mais confiável; o contraste confirma.
export function classificarEmblema(m) {
  if (!(m.contraste >= 7 && m.faixa <= -10)) return null;
  if (m.cimaMenosBaixo < 12) return 'Master Ball'; // metade de cima escura (o "M" e as bolinhas)
  return 'Pokeball Foil';
}

// ---------- Reverse Foil ----------
// No reverse, o foil cobre a carta toda menos a arte. Na caixa de texto, o fundo (sem as letras) deixa de ser liso e
// vira um padrão metálico (círculos/hexágonos cinza): muita variação e muitas bordas, com pouca cor.
// Fundo texturizado colorido (cartas antigas, tipo psíquico...) não conta: a saturação fica alta.
const CAIXA_TEXTO = { x0: 0.10, x1: 0.90, y0: 0.56, y1: 0.80 };

// img = { data (RGBA), width, height }. Devolve { variacao, bordas, saturacao }.
export function medirReverse({ data, width: w, height: h }) {
  const L = new Float32Array(w * h), S = new Float32Array(w * h);
  for (let p = 0, i = 0; p < L.length; p++, i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    L[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    S[p] = mx ? (mx - mn) / mx : 0;
  }
  const idx = [];
  for (let y = Math.round(CAIXA_TEXTO.y0 * h); y < CAIXA_TEXTO.y1 * h; y++) {
    for (let x = Math.round(CAIXA_TEXTO.x0 * w); x < CAIXA_TEXTO.x1 * w; x++) idx.push(y * w + x);
  }
  const limiarTexto = mediana(idx.map((p) => L[p])) * 0.7;
  const fundo = idx.filter((p) => L[p] > limiarTexto);
  if (!fundo.length) return { variacao: 0, bordas: 0, saturacao: 1 };
  const media = fundo.reduce((s, p) => s + L[p], 0) / fundo.length;
  const dp = Math.sqrt(fundo.reduce((s, p) => s + (L[p] - media) ** 2, 0) / fundo.length);
  let soma = 0, n = 0;
  for (const p of fundo) {
    const x = p % w;
    if (x < 1 || x >= w - 1 || p < w || p >= L.length - w) continue;
    const viz = [L[p + 1], L[p - 1], L[p + w], L[p - w]];
    if (Math.min(...viz) <= limiarTexto) continue; // borda de letra não conta
    soma += Math.hypot(L[p + 1] - L[p - 1], L[p + w] - L[p - w]);
    n++;
  }
  // bordas relativas ao brilho do fundo: a mesma carta mais escura ou mais clara dá o mesmo valor
  return { variacao: dp / media, bordas: n ? soma / n / media : 0, saturacao: mediana(fundo.map((p) => S[p])) };
}

// Limiares calibrados (carta redimensionada para 200x280) com fotos do Boss's Orders e scans da Liga:
//   reverse (foto):           variação 0,185  bordas 0,080  saturação 0,08
//   normal (mesma carta):     variação 0,068  bordas 0,024  saturação 0,03
//   holo (mesma carta):       variação 0,058  bordas 0,029  saturação 0,16
//   normais da Liga:          variação 0,05–0,16  bordas 0,017–0,12  saturação 0,22–0,49
// Só 1 exemplo de reverse: os limiares ficam no meio do caminho e a sugestão sempre pede conferência.
export function classificarReverse(m) {
  return m.variacao >= 0.13 && m.bordas >= 0.055 && m.saturacao <= 0.15 ? 'Reverse Foil' : null;
}

// Analisa a carta recortada (canvas). Devolve { extra: 'Pokeball Foil' | 'Master Ball' | 'Reverse Foil' | null, medidas }.
// Os padrões Poké Ball/Master Ball são um tipo de reverse: são testados primeiro.
export function detectarExtra(carta) {
  const amostra = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(carta, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  };
  const emblema = medirEmblema(luminancia(amostra(160, Math.round((160 * carta.height) / carta.width))));
  const bola = classificarEmblema(emblema);
  const reverse = medirReverse(amostra(200, 280));
  return { extra: bola || classificarReverse(reverse), medidas: { ...emblema, reverse } };
}
