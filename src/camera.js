// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Câmera traseira, moldura-guia e recorte da carta.
export const PROPORCAO = 63 / 88; // largura / altura de uma carta
// Altura máxima da carta recortada. As faixas do OCR (ampliação, limiar adaptativo) funcionam melhor nessa escala:
// a foto original do iPhone (4032 px) recortada a 2000 px deixava as letras grossas demais e a leitura piorava.
const ALTURA_SAIDA = 1200;

let fluxo = null;

export async function ligar(video) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Este navegador não dá acesso à câmera. Abra o app pelo endereço https (ou use "Foto da galeria").');
  }
  desligar();
  fluxo = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
  });
  video.srcObject = fluxo;
  await video.play();
  // foco contínuo, quando o aparelho permite
  const trilha = fluxo.getVideoTracks()[0];
  try {
    if (trilha.getCapabilities?.().focusMode?.includes('continuous')) await trilha.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
  } catch { /* opcional */ }
}

export function desligar() {
  fluxo?.getTracks().forEach((t) => t.stop());
  fluxo = null;
}

export const ligada = () => !!fluxo;

export async function lanterna(ligar) {
  const trilha = fluxo?.getVideoTracks()[0];
  if (!trilha?.getCapabilities?.().torch) return false;
  await trilha.applyConstraints({ advanced: [{ torch: !!ligar }] });
  return true;
}

// Moldura em coordenadas do vídeo (pixels reais da câmera), considerando o object-fit: cover da tela.
function molduraNoVideo(video) {
  const vw = video.videoWidth, vh = video.videoHeight;
  const cw = video.clientWidth, ch = video.clientHeight;
  const escala = Math.max(cw / vw, ch / vh);
  const visW = cw / escala, visH = ch / escala;
  const x0 = (vw - visW) / 2, y0 = (vh - visH) / 2;
  const h = Math.min(visH * 0.78, (visW * 0.86) / PROPORCAO);
  const w = h * PROPORCAO;
  return { x: x0 + (visW - w) / 2, y: y0 + (visH - h) / 2, w, h, escala, x0, y0 };
}

// Miniatura em cinza da área da moldura (para a foto automática). Devolve Uint8Array largura*altura ou null.
let telaMini = null;
export function miniaturaDaMoldura(video, largura, altura) {
  if (!video.videoWidth) return null;
  const m = molduraNoVideo(video);
  telaMini ??= document.createElement('canvas');
  telaMini.width = largura; telaMini.height = altura;
  const ctx = telaMini.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, m.x, m.y, m.w, m.h, 0, 0, largura, altura);
  const d = ctx.getImageData(0, 0, largura, altura).data;
  const cinza = new Uint8Array(largura * altura);
  for (let p = 0; p < cinza.length; p++) cinza[p] = (d[p * 4] * 77 + d[p * 4 + 1] * 150 + d[p * 4 + 2] * 29) >> 8;
  return cinza;
}

// Posiciona o elemento da moldura sobre o vídeo.
export function posicionarMoldura(video, moldura) {
  if (!video.videoWidth) return;
  const m = molduraNoVideo(video);
  Object.assign(moldura.style, {
    left: `${(m.x - m.x0) * m.escala}px`,
    top: `${(m.y - m.y0) * m.escala}px`,
    width: `${m.w * m.escala}px`,
    height: `${m.h * m.escala}px`,
  });
}

// Margem em volta da carta na foto que vai para o Drive (fração do tamanho da carta, em cada lado). A leitura usa o
// recorte justo; a foto guardada fica com um respiro de fundo, sem cortar rente às bordas.
export const MARGEM_FOTO = 0.1;

// Área com margem em volta do recorte da carta, sem passar dos limites da imagem de origem.
export function areaComMargem(sx, sy, sw, sh, larguraOrigem, alturaOrigem, margem = MARGEM_FOTO) {
  const mx = sw * margem, my = sh * margem;
  const x0 = Math.max(0, sx - mx), y0 = Math.max(0, sy - my);
  const x1 = Math.min(larguraOrigem, sx + sw + mx), y1 = Math.min(alturaOrigem, sy + sh + my);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function canvasCarta(origem, sx, sy, sw, sh) {
  const c = document.createElement('canvas');
  c.height = Math.min(ALTURA_SAIDA, Math.max(sh, 900));
  c.width = Math.round(c.height * PROPORCAO);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(origem, sx, sy, sw, sh, 0, 0, c.width, c.height);
  // a mesma carta com margem, na mesma escala, para a foto do Drive
  const a = areaComMargem(sx, sy, sw, sh, origem.videoWidth || origem.width, origem.videoHeight || origem.height);
  const k = c.height / sh;
  const f = document.createElement('canvas');
  f.width = Math.round(a.w * k);
  f.height = Math.round(a.h * k);
  const fctx = f.getContext('2d');
  fctx.imageSmoothingQuality = 'high';
  fctx.drawImage(origem, a.x, a.y, a.w, a.h, 0, 0, f.width, f.height);
  c.fotoComMargem = f;
  return c;
}

// Recorta a área dentro da moldura. Quando o aparelho permite (Chrome no Android), tira uma FOTO na resolução
// máxima do sensor, bem mais nítida que o quadro do vídeo; senão, usa o quadro do vídeo.
export async function capturar(video) {
  if (!video.videoWidth) throw new Error('A câmera ainda não está pronta.');
  const m = molduraNoVideo(video);
  const trilha = fluxo?.getVideoTracks()[0];
  if (trilha && 'ImageCapture' in globalThis) {
    try {
      const blob = await new ImageCapture(trilha).takePhoto();
      const bmp = await createImageBitmap(blob);
      // mesma moldura, em frações do quadro; só vale se a foto tiver a mesma proporção do vídeo
      const mesmaProporcao = Math.abs(bmp.width / bmp.height - video.videoWidth / video.videoHeight) < 0.02;
      if (mesmaProporcao && bmp.width > video.videoWidth) {
        const k = bmp.width / video.videoWidth;
        const c = canvasCarta(bmp, m.x * k, m.y * k, m.w * k, m.h * k);
        bmp.close?.();
        return c;
      }
      bmp.close?.();
    } catch { /* sem foto em alta: usa o vídeo */ }
  }
  return canvasCarta(video, m.x, m.y, m.w, m.h);
}

// Foto escolhida da galeria: acha a carta (borda amarela ou prateada); se não achar, considera que a carta ocupa a
// foto e recorta o maior retângulo 63x88 do centro.
export async function deArquivo(arquivo) {
  const bmp = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  // foto (ou scan) que já tem a proporção de uma carta é a própria carta: não procura moldura por dentro dela
  // (a moldura prateada seria confundida com fundo). Fotos de celular (3:4 = 0,75) ficam de fora desta regra.
  const jaEhCarta = Math.abs(bmp.width / bmp.height - PROPORCAO) < 0.02;
  const borda = jaEhCarta ? null : bordaAmarela(bmp) || retanguloCarta(bmp);
  let c;
  if (borda) {
    c = canvasCarta(bmp, borda.x, borda.y, borda.w, borda.h);
  } else {
    let w = bmp.width, h = bmp.height;
    if (w / h > PROPORCAO) w = h * PROPORCAO; else h = w / PROPORCAO;
    c = canvasCarta(bmp, (bmp.width - w) / 2, (bmp.height - h) / 2, w, h);
  }
  bmp.close?.();
  return c;
}

// Acha a carta numa foto com fundo pela borda amarela (cartas até Sword & Shield).
// Só vale se o retângulo tiver a proporção de uma carta; senão devolve null (e a foto é recortada pelo centro).
export function bordaAmarela(img) {
  const escala = Math.min(1, 400 / Math.max(img.width, img.height));
  const W = Math.round(img.width * escala), H = Math.round(img.height * escala);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const linhas = new Array(H).fill(0), colunas = new Array(W).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i] > 150 && d[i + 1] > 120 && d[i + 2] < 130 && d[i] - d[i + 2] > 70) { linhas[y]++; colunas[x]++; }
    }
  }
  const limites = (v) => {
    const corte = Math.max(...v) * 0.25;
    if (corte < 4) return null;
    const a = v.findIndex((n) => n > corte);
    const b = v.length - 1 - [...v].reverse().findIndex((n) => n > corte);
    return [a, b];
  };
  const ly = limites(linhas), lx = limites(colunas);
  if (!ly || !lx) return null;
  const w = (lx[1] - lx[0] + 1) / escala, h = (ly[1] - ly[0] + 1) / escala;
  if (Math.abs(w / h - PROPORCAO) > 0.04) return null; // não parece uma carta inteira
  if (w * h < img.width * img.height * 0.15) return null; // amarelo pequeno demais: é desenho, não borda
  return { x: lx[0] / escala, y: ly[0] / escala, w, h };
}

// Acha a carta pelas bordas retas (qualquer cor de moldura: prateada nas coleções Scarlet & Violet, amarela antes).
// Procura as linhas horizontais e verticais com mais contraste e testa os retângulos que elas formam: vale o que tiver
// proporção de carta, lados com contraste forte e uma faixa de moldura uniforme logo por dentro.
// Carta reta (sem rotação) e ocupando pelo menos ~20% da foto. Devolve { x, y, w, h } ou null.
export function retanguloCarta(img) {
  const escala = Math.min(1, 360 / Math.max(img.width, img.height));
  const W = Math.round(img.width * escala), H = Math.round(img.height * escala);
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const dados = ctx.getImageData(0, 0, W, H);
  // fundo liso (mesa, tapete, papel): recorta o que difere do fundo; senão, procura pelas bordas retas
  const r = recortarDoFundo(dados) || encontrarRetangulo(dados);
  return r && { x: r.x / escala, y: r.y / escala, w: r.w / escala, h: r.h / escala };
}

// Fundo liso: a cor do fundo é estimada pelas margens da foto; a carta é o bloco que difere dela.
// Pega até borda prateada sobre fundo cinza/branco (basta uma diferença pequena de cor ou brilho).
export function recortarDoFundo({ data, width: W, height: H }) {
  const m = Math.max(2, Math.round(Math.min(W, H) * 0.02));
  const amostras = [[], [], []];
  const pegar = (x, y) => { const i = (y * W + x) * 4; for (let k = 0; k < 3; k++) amostras[k].push(data[i + k]); };
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (x < m || y < m || x >= W - m || y >= H - m) pegar(x, y);
  const med = amostras.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
  // fundo precisa ser liso: se as margens variam muito (madeira, estampa), este método não serve
  const dp = amostras.map((v, k) => Math.sqrt(v.reduce((s, a) => s + (a - med[k]) ** 2, 0) / v.length));
  if (Math.max(...dp) > 18) return null;
  const limiar = Math.max(14, 3 * Math.max(...dp));
  const linhas = new Uint32Array(H), colunas = new Uint32Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const dif = Math.max(Math.abs(data[i] - med[0]), Math.abs(data[i + 1] - med[1]), Math.abs(data[i + 2] - med[2]));
      if (dif > limiar) { linhas[y]++; colunas[x]++; }
    }
  }
  const limites = (v, n) => {
    const corte = Math.max(...v) * 0.5;
    if (corte < n * 0.1) return null;
    const a = v.findIndex((q) => q > corte);
    let b = v.length - 1;
    while (b > a && !(v[b] > corte)) b--;
    return [a, b];
  };
  const ly = limites(linhas, W), lx = limites(colunas, H);
  if (!ly || !lx) return null;
  const w = lx[1] - lx[0] + 1, h = ly[1] - ly[0] + 1;
  if (Math.abs(w / h - PROPORCAO) > 0.045 || w * h < W * H * 0.15) return null;
  return { x: lx[0], y: ly[0], w, h };
}

// Parte pura (testável): ImageData -> { x, y, w, h, nota } ou null.
export function encontrarRetangulo({ data, width: W, height: H }) {
  const L = new Float32Array(W * H);
  for (let p = 0; p < L.length; p++) L[p] = 0.299 * data[p * 4] + 0.587 * data[p * 4 + 1] + 0.114 * data[p * 4 + 2];
  const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const p = y * W + x;
      gx[p] = Math.abs(L[p + 1] - L[p - 1]);
      gy[p] = Math.abs(L[p + W] - L[p - W]);
    }
  }
  // perfis: força das linhas horizontais (por y) e verticais (por x)
  const linha = new Float32Array(H), coluna = new Float32Array(W);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { linha[y] += gy[y * W + x]; coluna[x] += gx[y * W + x]; }
  const picos = (perfil, n) => {
    const idx = [];
    for (let i = 2; i < perfil.length - 2; i++) {
      if (perfil[i] >= perfil[i - 1] && perfil[i] >= perfil[i + 1] && perfil[i] > 0) idx.push(i);
    }
    return idx.sort((a, b) => perfil[b] - perfil[a]).slice(0, n);
  };
  const ys = picos(linha, 14), xs = picos(coluna, 14);
  const mediaGrad = (gx.reduce((s, v) => s + v, 0) + gy.reduce((s, v) => s + v, 0)) / (2 * W * H) || 1;

  // força média de um lado (só no trecho do retângulo)
  const ladoH = (y, x0, x1) => { let s = 0; for (let x = x0; x <= x1; x++) s += gy[y * W + x]; return s / (x1 - x0 + 1); };
  const ladoV = (x, y0, y1) => { let s = 0; for (let y = y0; y <= y1; y++) s += gx[y * W + x]; return s / (y1 - y0 + 1); };
  // uniformidade da faixa da moldura (3% para dentro): desvio padrão baixo = moldura lisa
  const moldura = (x0, y0, x1, y1) => {
    const e = Math.max(2, Math.round((x1 - x0) * 0.03));
    const v = [];
    for (let y = y0 + 1; y <= y1 - 1; y += 2) for (const x of [x0 + 1 + (e >> 1), x1 - 1 - (e >> 1)]) v.push(L[y * W + x]);
    for (let x = x0 + 1; x <= x1 - 1; x += 2) for (const y of [y0 + 1 + (e >> 1), y1 - 1 - (e >> 1)]) v.push(L[y * W + x]);
    const m = v.reduce((s, a) => s + a, 0) / v.length;
    return Math.sqrt(v.reduce((s, a) => s + (a - m) ** 2, 0) / v.length);
  };

  let melhor = null;
  for (const y0 of ys) for (const y1 of ys) {
    if (y1 - y0 < H * 0.3) continue;
    for (const x0 of xs) for (const x1 of xs) {
      const w = x1 - x0, h = y1 - y0;
      if (w < W * 0.2 || Math.abs(w / h - PROPORCAO) > 0.045) continue;
      if (w * h < W * H * 0.2) continue;
      const lados = [ladoH(y0, x0, x1), ladoH(y1, x0, x1), ladoV(x0, y0, y1), ladoV(x1, y0, y1)];
      const fraco = Math.min(...lados) / mediaGrad; // o lado mais fraco precisa ser uma borda de verdade
      if (fraco < 2) continue;
      const nota = fraco + (lados.reduce((s, v) => s + v, 0) / 4) / mediaGrad / 2 - moldura(x0, y0, x1, y1) / 20 + (w * h) / (W * H);
      if (!melhor || nota > melhor.nota) melhor = { x: x0, y: y0, w, h, nota };
    }
  }
  if (!melhor) return null;

  // Em fundo claro, a borda de fora da moldura prateada quase some e o retângulo achado é o de DENTRO da moldura.
  // Procura uma borda paralela, à mesma distância nos quatro lados (largura da moldura: 1,5% a 8% da carta),
  // com contraste baixo mas presente; se achar, usa o retângulo de fora.
  const { x, y, w, h } = melhor;
  let fora = null;
  for (let d = Math.max(2, Math.round(w * 0.015)); d <= Math.round(w * 0.08); d++) {
    const x0 = x - d, y0 = y - d, x1 = x + w + d, y1 = y + h + d;
    if (x0 < 1 || y0 < 1 || x1 >= W - 1 || y1 >= H - 1) break;
    const lados = [ladoH(y0, x0, x1), ladoH(y1, x0, x1), ladoV(x0, y0, y1), ladoV(x1, y0, y1)];
    const fraco = Math.min(...lados) / mediaGrad;
    if (fraco >= 0.8 && moldura(x0, y0, x1, y1) < 25 && (!fora || fraco > fora.fraco)) fora = { d, fraco };
  }
  if (fora) return { x: x - fora.d, y: y - fora.d, w: w + 2 * fora.d, h: h + 2 * fora.d, nota: melhor.nota };
  return melhor;
}
