// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Leitura da carta com tesseract.js (o mesmo OCR do bot-leilao), direto no navegador do celular.
// A carta chega recortada (retrato, proporção 63x88). Faixas lidas separadamente:
//   nome (topo, sem o HP e o ícone de tipo), número de coleção (rodapé: esquerda, direita e faixa inteira)
//   e texto (meio, usado para o idioma).
// Cada faixa é ampliada e binarizada (Otsu), com o texto sempre escuro sobre fundo claro.
// Idioma como no bot: primeiro "eng+por"; se não reconhecer, "jpn+kor+chi_tra+chi_sim".
import { classificarTexto, LATINOS } from './idioma.js';
import { extrairNome, extrairNumero, qualidadeNome } from './carta.js';

// Regiões em frações da carta: [x, y, largura, altura]
export const REGIOES = {
  nome: [0.03, 0.025, 0.68, 0.085],
  nomeLargo: [0.03, 0.015, 0.94, 0.11],
  numeroEsq: [0.0, 0.905, 0.42, 0.08],
  numeroDir: [0.58, 0.905, 0.42, 0.08],
  numero: [0.0, 0.88, 1.0, 0.115],
  texto: [0.04, 0.45, 0.92, 0.47], // até 92%: abaixo vêm o "Illus." e o copyright, sempre em inglês
  rodapeTexto: [0.04, 0.86, 0.92, 0.10], // fraqueza/recuo e texto da Pokédex (só para separar EN de PT)
};

const T = () => {
  if (!globalThis.Tesseract) throw new Error('O OCR (tesseract.js) não carregou. Confira a conexão e recarregue a página.');
  return globalThis.Tesseract;
};

const workers = {};
let aoProgresso = () => {};

async function worker(langs) {
  workers[langs] ??= T().createWorker(langs, 1, {
    logger: (m) => { if (m.status && m.progress != null) aoProgresso(m.status, m.progress); },
  }).catch((e) => { delete workers[langs]; throw e; });
  return workers[langs];
}

// Limiar de Otsu sobre um histograma de 256 tons.
export function limiarOtsu(hist, total) {
  let soma = 0;
  for (let i = 0; i < 256; i++) soma += i * hist[i];
  let somaB = 0, pesoB = 0, melhor = 0, limiar = 127;
  for (let t = 0; t < 256; t++) {
    pesoB += hist[t];
    if (!pesoB) continue;
    const pesoF = total - pesoB;
    if (!pesoF) break;
    somaB += t * hist[t];
    const mB = somaB / pesoB, mF = (soma - somaB) / pesoF;
    const v = pesoB * pesoF * (mB - mF) ** 2;
    if (v > melhor) { melhor = v; limiar = t; }
  }
  return limiar;
}

// Recorta uma região, amplia, passa para cinza e binariza.
// O texto é a classe MINORITÁRIA de pixels: se ela sair clara (texto branco em fundo escuro), inverte.
export function recortar(origem, [fx, fy, fw, fh], larguraAlvo = 1600, binarizar = true) {
  const sx = Math.round(fx * origem.width), sy = Math.round(fy * origem.height);
  const sw = Math.max(1, Math.round(fw * origem.width)), sh = Math.max(1, Math.round(fh * origem.height));
  const escala = Math.min(4, Math.max(1, larguraAlvo / sw));
  const c = document.createElement('canvas');
  c.width = Math.round(sw * escala);
  c.height = Math.round(sh * escala);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(origem, sx, sy, sw, sh, 0, 0, c.width, c.height);

  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g;
    hist[g]++;
  }
  const n = d.length / 4;
  if (binarizar === 'adaptativo') {
    limiarAdaptativo(d, c.width, c.height);
  } else if (binarizar) {
    const t = limiarOtsu(hist, n);
    let escuros = 0;
    for (let i = 0; i <= t; i++) escuros += hist[i];
    const inverter = escuros > n / 2; // escuro é maioria = fundo escuro, texto claro
    for (let i = 0; i < d.length; i += 4) {
      let v = d[i] > t ? 255 : 0;
      if (inverter) v = 255 - v;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  } else {
    for (let i = 0; i < d.length; i += 4) d[i + 1] = d[i + 2] = d[i];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Limiar adaptativo (média local por imagem integral): o pixel vira texto se for bem mais escuro que a vizinhança.
// Aguenta fundo irregular (emblema claro, padrão foil, reflexo) melhor que um limiar único para a faixa toda.
export function limiarAdaptativo(d, w, h, janela = 41, folga = 14) {
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let linha = 0;
    for (let x = 0; x < w; x++) {
      linha += d[(y * w + x) * 4];
      integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + linha;
    }
  }
  const r = janela >> 1;
  const saida = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const soma = integral[y1 * (w + 1) + x1] - integral[y0 * (w + 1) + x1] - integral[y1 * (w + 1) + x0] + integral[y0 * (w + 1) + x0];
      const media = soma / ((x1 - x0) * (y1 - y0));
      saida[y * w + x] = d[(y * w + x) * 4] < media - folga ? 0 : 255;
    }
  }
  for (let p = 0; p < saida.length; p++) d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = saida[p];
}

async function reconhecer(w, imagem, parametros) {
  await w.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: '3', ...parametros });
  const { data } = await w.recognize(imagem);
  return data.text || '';
}

const SO_NUMERO = { tessedit_char_whitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ', tessedit_pageseg_mode: '11' };

const SO_DIGITOS = { tessedit_char_whitelist: '0123456789/', tessedit_pageseg_mode: '11' };

// Lê o número de coleção. Ele SEMPRE é procurado, mesmo com o nome lido: é o que separa as várias impressões
// da mesma carta. Passadas: cantos (Otsu), cantos e faixa com limiar adaptativo (aguenta foto pequena, sleeve e
// reflexo) e faixa inteira. Devolve { achados: [{numero,total}], trechos: ['1541320', ...] } — os trechos de dígitos
// servem de pista quando o número não sai inteiro (ex.: "154" lido e a barra/total embaralhados).
async function lerNumero(w, carta, textos) {
  const achados = [];
  const trechos = new Set();
  const tentar = async (rotulo, regiao, larg, params, binarizar = true) => {
    const t = await reconhecer(w, recortar(carta, regiao, larg, binarizar), params);
    textos[rotulo] = t;
    for (const d of t.match(/\d{2,}/g) || []) trechos.add(d);
    const n = extrairNumero(t);
    if (n && !achados.some((a) => a.numero === n.numero && a.total === n.total)) achados.push(n);
  };
  await tentar('numeroEsq', REGIOES.numeroEsq, 1400, SO_NUMERO);
  await tentar('numeroDir', REGIOES.numeroDir, 1400, SO_NUMERO);
  await tentar('numeroEsqAdapt', REGIOES.numeroEsq, 1400, SO_DIGITOS, 'adaptativo');
  if (!achados.length) {
    await tentar('numeroEsqAdapt7', REGIOES.numeroEsq, 1400, { ...SO_DIGITOS, tessedit_pageseg_mode: '7' }, 'adaptativo');
    await tentar('numeroDirAdapt', REGIOES.numeroDir, 1400, SO_DIGITOS, 'adaptativo');
    await tentar('numero', REGIOES.numero, 2000, SO_NUMERO);
    await tentar('numeroAdapt', REGIOES.numero, 2000, SO_DIGITOS, 'adaptativo');
  }
  return { achados, trechos: [...trechos] };
}

// Lê o nome em duas versões de faixa e fica com a mais "legível".
async function lerNome(w, carta, textos) {
  const opcoes = [];
  for (const [rotulo, regiao, psm] of [['nome', REGIOES.nome, '7'], ['nomeLargo', REGIOES.nomeLargo, '6']]) {
    const t = await reconhecer(w, recortar(carta, regiao, 1600), { tessedit_pageseg_mode: psm });
    textos[rotulo] = t;
    const nome = extrairNome(t);
    opcoes.push({ nome, q: qualidadeNome(nome) });
    if (opcoes[0].q >= 0.85) break; // a faixa justa já deu um nome limpo
  }
  opcoes.sort((a, b) => b.q - a.q);
  return opcoes[0];
}

// Lê a carta. Devolve { nome, qualidadeNome, numero, total, numeros, idioma, textos } — campos podem vir vazios.
export async function lerCarta(carta, { progresso } = {}) {
  aoProgresso = progresso || (() => {});
  const lat = await worker('eng+por');
  const textos = {};

  const { achados: numeros, trechos: trechosNumero } = await lerNumero(lat, carta, textos);
  const textoImg = recortar(carta, REGIOES.texto, 1400, 'adaptativo');
  textos.texto = await reconhecer(lat, textoImg);
  let melhorNome = await lerNome(lat, carta, textos);

  let idioma = classificarTexto(`${textos.nome}\n${textos.texto}`);
  // Já há texto latino de verdade (só não deu para decidir entre EN e PT, ou a foto está ruim): a carta não é
  // japonesa/chinesa/coreana, e o OCR asiático só "inventaria" kana a partir das letras latinas.
  // Texto real tem palavras de 4+ letras em minúsculas (ou só a inicial maiúscula: "Fraqueza"); o lixo que o OCR
  // latino tira de ideogramas ou do brilho do holo sai em MAIÚSCULAS ou em pedaços de 2-3 letras ("cet", "fn").
  const palavrasLatinas = (textos.texto.match(/(?<![A-Za-zÀ-ÿ])(?:[A-ZÀ-Ý][a-zà-ÿ]{3,}|[a-zà-ÿ]{4,})(?![A-Za-zÀ-ÿ])/g) || []).length;
  // Latino, mas sem decidir entre inglês e português: lê também o rodapé da caixa de texto (fraqueza/recuo e o texto
  // da Pokédex, onde costuma estar a frase mais longa). O copyright em inglês do rodapé não atrapalha: não tem
  // nenhuma das palavras-chave de EN/PT.
  if (!idioma && palavrasLatinas >= 3) {
    textos.rodapeTexto = await reconhecer(lat, recortar(carta, REGIOES.rodapeTexto, 1400, 'adaptativo'));
    idioma = classificarTexto(`${textos.nome}\n${textos.texto}\n${textos.rodapeTexto}`);
  }
  if (!idioma && palavrasLatinas < 3) {
    const cjk = await worker('jpn+kor+chi_tra+chi_sim');
    textos.textoCJK = await reconhecer(cjk, textoImg);
    idioma = classificarTexto(textos.textoCJK);
    if (idioma && !LATINOS.has(idioma)) {
      const t = await reconhecer(cjk, recortar(carta, REGIOES.nome, 1600), { tessedit_pageseg_mode: '7' });
      textos.nomeCJK = t;
      const nome = extrairNome(t).replace(/\s+/g, '');
      melhorNome = { nome, q: 0.1 }; // nome em outra escrita não ajuda a achar a carta na Liga (que usa EN/PT)
    }
  }
  if (!numeros.length) {
    const n = extrairNumero(textos.texto);
    if (n) numeros.push(n);
  }

  const n = numeros[0] || {};
  return {
    nome: melhorNome.nome, qualidadeNome: melhorNome.q,
    numero: n.numero || '', total: n.total || '', numeros, trechosNumero,
    // texto latino de verdade, mesmo sem dar para separar EN de PT: basta para tirar as edições asiáticas
    latino: LATINOS.has(idioma) || (!idioma && palavrasLatinas >= 3),
    idioma: idioma || '', textos,
  };
}

// Só o idioma de uma carta (usado nas imagens das edições sugeridas pela Liga). Mesma regra do lerCarta:
// latino primeiro; o OCR asiático só roda se não houver texto latino de verdade. Devolve o código ou null.
export async function lerIdioma(carta) {
  const textoImg = recortar(carta, REGIOES.texto, 1400, 'adaptativo'); // mesma faixa do lerCarta
  const nomeImg = recortar(carta, REGIOES.nome, 1600);
  const lat = await worker('eng+por');
  const texto = await reconhecer(lat, textoImg);
  const nome = await reconhecer(lat, nomeImg, { tessedit_pageseg_mode: '7' });
  let idioma = classificarTexto(`${nome}\n${texto}`);
  const palavrasLatinas = (texto.match(/(?<![A-Za-zÀ-ÿ])(?:[A-ZÀ-Ý][a-zà-ÿ]{3,}|[a-zà-ÿ]{4,})(?![A-Za-zÀ-ÿ])/g) || []).length;
  if (!idioma && palavrasLatinas >= 3) return 'EN'; // latino, só não deu para separar EN de PT: basta para a edição
  if (!idioma) {
    const cjk = await worker('jpn+kor+chi_tra+chi_sim');
    idioma = classificarTexto(`${await reconhecer(cjk, nomeImg, { tessedit_pageseg_mode: '7' })}\n${await reconhecer(cjk, textoImg)}`);
  }
  return idioma || null;
}

// Pré-carrega o OCR latino em segundo plano (a 1ª leitura fica mais rápida).
export function aquecer() {
  worker('eng+por').catch(() => {});
}
