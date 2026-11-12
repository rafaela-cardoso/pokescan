// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Idioma das EDIÇÕES da Liga, lido por OCR na imagem de cada carta sugerida.
// A busca da Liga não diz o idioma da edição (030/103 japonesa e 030/128 internacional vêm iguais), mas a imagem
// mostra: o app lê o texto dela, como faz com a carta escaneada.
//
// O servidor de imagens da Liga não libera a leitura dos pixels por outro site (CORS), então as imagens passam por
// um intermediário seu: um Apps Script (proxy/AppsScript_imagens.gs) que só aceita imagens da Liga.
// O idioma fica guardado POR EDIÇÃO no celular: cada edição é lida uma vez só.
import { ler, gravar } from './armazenamento.js';

// Idiomas que dividem a mesma edição na Liga: a edição internacional vende inglês, português, espanhol...
export const grupoIdioma = (i) => {
  const c = String(i ?? '').toUpperCase();
  if (!c) return '';
  if (c === 'JP') return 'JP';
  if (c === 'CH' || c === 'CHS' || c === 'ZH') return 'ZH';
  if (c === 'KO' || c === 'KR') return 'KO';
  return 'INT';
};

// Código da edição: "marketplace:cards:tcg2:15|822|030" -> "822" (ou pelo caminho da imagem ".../cd/822/...").
export function edicaoDe(c) {
  const m = String(c.id ?? '').match(/\|(\d+)\|[^|]*$/) || String(c.imagem ?? '').match(/\/cd\/(\d+)\//);
  return m ? m[1] : '';
}

let memoria = null;
const cache = () => (memoria ??= ler('idiomasEdicoes', {}));
export const idiomaConhecido = (c) => cache()[edicaoDe(c)] || '';
function guardar(edicao, idioma) {
  cache()[edicao] = idioma;
  gravar('idiomasEdicoes', memoria);
}

// O OCR nas imagens da Liga (350 px) separa bem texto latino de asiático, mas não japonês de chinês (testado:
// 7/7 latino x asiático; as chinesas saíram como japonês). Por isso a comparação é só entre essas duas classes;
// entre japonês, chinês e coreano vale o sufixo da numeração (liga.js, filtrarPorIdioma).
const classe = (i) => { const g = grupoIdioma(i); return !g ? '' : g === 'INT' ? 'INT' : 'ASIA'; };

// Tira da lista as edições cujo idioma (já lido) é da outra classe. Mantém a lista se ela ficaria vazia.
// `protegida(c)`: cartas que nunca saem (as de número igual ao lido): o OCR nas imagens pequenas da Liga erra às
// vezes, e o palpite fica guardado, escondendo a carta certa em toda leitura seguinte.
export function filtrarPorIdiomaDaEdicao(lista, idioma, conhecido = idiomaConhecido, protegida = () => false) {
  const alvo = classe(idioma);
  if (!alvo) return lista;
  const ok = lista.filter((c) => { const k = classe(conhecido(c)); return protegida(c) || !k || k === alvo; });
  return ok.length ? ok : lista;
}

// Você tocou nesta carta: a edição dela é do idioma da carta lida. Corrige um palpite errado do OCR guardado antes.
export function confirmarIdiomaDaEdicao(c, idioma) {
  const ed = edicaoDe(c);
  if (!ed || !classe(idioma) || classe(idiomaConhecido(c)) === classe(idioma)) return;
  guardar(ed, idioma);
}

// Baixa a imagem pelo intermediário e devolve um canvas com a carta.
async function imagemPeloProxy(proxy, url) {
  const r = await fetch(`${proxy}${proxy.includes('?') ? '&' : '?'}url=${encodeURIComponent(url)}`);
  if (!r.ok) throw new Error(`intermediário respondeu ${r.status}`);
  const d = await r.json();
  if (!d.ok) throw new Error(d.erro || 'intermediário recusou a imagem');
  const bytes = Uint8Array.from(atob(d.base64), (ch) => ch.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([bytes], { type: d.tipo || 'image/jpeg' }));
  const c = document.createElement('canvas');
  c.width = bmp.width * 2; c.height = bmp.height * 2; // imagens da Liga são pequenas: amplia para o OCR
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

// Lê (e guarda) o idioma das edições ainda desconhecidas da lista. `lerIdioma(canvas)` vem do ocr.js.
// Para no primeiro erro do intermediário (fora do ar, URL errada) para não travar a tela.
export async function descobrirIdiomas(lista, { proxy, lerIdioma, limite = 6, aoAvancar = () => {} }) {
  if (!proxy) return 0;
  const vistas = new Set();
  const faltam = lista.filter((c) => {
    const ed = edicaoDe(c);
    if (!ed || !c.imagem || idiomaConhecido(c) || vistas.has(ed)) return false;
    vistas.add(ed);
    return true;
  }).slice(0, limite);
  let lidas = 0;
  for (const c of faltam) {
    const idioma = await lerIdioma(await imagemPeloProxy(proxy, c.imagem));
    if (idioma) { guardar(edicaoDe(c), idioma); lidas++; }
    aoAvancar(lidas, faltam.length);
  }
  return lidas;
}
