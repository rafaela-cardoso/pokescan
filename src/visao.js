// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Leitura da carta por um modelo de visão (Gemini), pelo intermediário Apps Script (proxy/AppsScript_imagens.gs),
// que guarda a chave e só atende o login Google do app. Bem mais confiável que o OCR para nome, número e sigla;
// o OCR (ocr.js) continua como reserva quando não há login, internet ou cota.
import { LATINOS } from './idioma.js';
import { extrairNumero, qualidadeNome } from './carta.js';

const LADO_MAXIMO = 1280; // px no lado maior: legível para o modelo e leve para enviar

// Canvas da carta -> JPEG em base64 (sem o prefixo "data:").
export function fotoParaEnvio(canvas) {
  const escala = Math.min(1, LADO_MAXIMO / Math.max(canvas.width, canvas.height));
  let c = canvas;
  if (escala < 1) {
    c = document.createElement('canvas');
    c.width = Math.round(canvas.width * escala);
    c.height = Math.round(canvas.height * escala);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(canvas, 0, 0, c.width, c.height);
  }
  return c.toDataURL('image/jpeg', 0.88).split(',')[1];
}

// Idioma devolvido pelo modelo -> código do app (o mesmo do OCR: KO e ZH viram KR e CH na tela).
const IDIOMAS = { EN: 'EN', PT: 'PT', JP: 'JP', JA: 'JP', KO: 'KO', KR: 'KO', 'ZH-TW': 'CH', 'ZH-CN': 'CHS', ZH: 'ZH', CH: 'CH', CHS: 'CHS' };

// Extra devolvido pelo modelo -> nome da coluna Extra ('Normal' = sem extra; '' = não deu para ver).
const EXTRAS_GEMINI = { normal: 'Normal', foil: 'Foil', holo: 'Foil', 'reverse foil': 'Reverse Foil', reverse: 'Reverse Foil',
  'pokeball foil': 'Pokeball Foil', 'poke ball foil': 'Pokeball Foil', 'master ball': 'Master Ball', 'masterball': 'Master Ball' };

// Resposta do modelo ({nome, numero, total, sigla, idioma, extra}) -> o mesmo formato do lerCarta do OCR.
export function normalizarLeitura(carta = {}, modelo = '') {
  const texto = (v) => String(v ?? '').trim();
  const nome = texto(carta.nome);
  let numero = texto(carta.numero).toUpperCase().replace(/\s+/g, '');
  let total = texto(carta.total).toUpperCase().replace(/\s+/g, '');
  // às vezes vem tudo junto em "numero" ("090/084")
  if (numero.includes('/') && !total) {
    const n = extrairNumero(numero);
    if (n) ({ numero, total } = n);
  }
  const idioma = IDIOMAS[texto(carta.idioma).toUpperCase()] || '';
  const sigla = texto(carta.sigla).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return {
    nome,
    qualidadeNome: nome ? Math.max(0.85, qualidadeNome(nome)) : 0,
    numero, total,
    numeros: numero ? [{ numero, total }] : [],
    trechosNumero: [],
    siglas: sigla ? [sigla] : [],
    idioma,
    latino: LATINOS.has(idioma),
    lidoPor: 'Gemini',
    // undefined = o intermediário ainda não pede o extra (versão antiga): o app usa a análise da imagem
    extraGemini: carta.extra === undefined ? undefined
      : EXTRAS_GEMINI[texto(carta.extra).toLowerCase().replace(/[\u00e9\u00c9]/g, 'e')] ?? '',
    textos: { gemini: JSON.stringify({ modelo, ...carta }, null, 1) },
  };
}

// Manda a foto ao intermediário e devolve a leitura normalizada. Erros viram exceção (com .login quando o token
// não vale mais).
export async function lerComGemini(canvas, { proxy, token }) {
  const r = await fetch(proxy, {
    method: 'POST',
    // text/plain: pedido "simples", sem a pré-consulta de CORS que o Apps Script não responde
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ acao: 'lerCarta', token, imagem: fotoParaEnvio(canvas) }),
  });
  if (!r.ok) throw new Error(`Gemini: HTTP ${r.status}`);
  const d = await r.json();
  if (!d.ok) {
    const e = new Error(d.erro || 'Gemini: falhou');
    e.login = !!d.login;
    throw e;
  }
  return normalizarLeitura(d.carta, d.modelo);
}
