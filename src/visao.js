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

// Energia Básica: a carta diz só "Energia Básica" (o tipo vem no símbolo), mas a Liga a chama pelo tipo: "Energia de
// Grama" / "Grass Energy". Devolve o nome em inglês da Liga ("Grass Energy"), '' se não é energia básica ou se o
// tipo não veio. O tipo vem do campo "energia" do Gemini ou do nome em inglês ("Basic Grass Energy").
const TIPOS_ENERGIA = {
  grass: 'Grass', grama: 'Grass', planta: 'Grass', fire: 'Fire', fogo: 'Fire', water: 'Water', agua: 'Water',
  lightning: 'Lightning', eletrica: 'Lightning', eletrico: 'Lightning', raio: 'Lightning', psychic: 'Psychic', psiquica: 'Psychic',
  psiquico: 'Psychic', fighting: 'Fighting', luta: 'Fighting', lutador: 'Fighting', darkness: 'Darkness', dark: 'Darkness',
  escuridao: 'Darkness', sombria: 'Darkness', metal: 'Metal', metalica: 'Metal', fairy: 'Fairy', fada: 'Fairy',
};
const ENERGIA_BASICA = /(basic|b[aá]sica|基本|기본).*(energ|エネルギー|能量|에너지)|energ\S*.*\b(basic|b[aá]sica)\b/i;
export function nomeDaEnergiaBasica(carta = {}) {
  const textos = [carta.nome, carta.nomeIngles].map((v) => String(v ?? ''));
  const tipoDado = String(carta.energia ?? '').trim();
  if (!tipoDado && !textos.some((t) => ENERGIA_BASICA.test(t))) return '';
  const sem = (t) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const t of [tipoDado, ...textos]) {
    for (const palavra of sem(t).split(/[^a-z]+/)) if (TIPOS_ENERGIA[palavra]) return `${TIPOS_ENERGIA[palavra]} Energy`;
  }
  return '';
}

// Resposta do modelo ({nome, numero, total, sigla, idioma, extra, energia}) -> o mesmo formato do lerCarta do OCR.
export function normalizarLeitura(carta = {}, modelo = '') {
  const texto = (v) => String(v ?? '').trim();
  const idioma = IDIOMAS[texto(carta.idioma).toUpperCase()] || '';
  // A Liga só tem nomes em inglês e português: carta em japonês, coreano ou chinês busca pelo nome em inglês
  const impresso = texto(carta.nome);
  const ingles = texto(carta.nomeIngles);
  const energia = nomeDaEnergiaBasica(carta);
  const nome = energia || (!LATINOS.has(idioma) && ingles ? ingles : impresso);
  let numero = texto(carta.numero).toUpperCase().replace(/\s+/g, '');
  let total = texto(carta.total).toUpperCase().replace(/\s+/g, '');
  // às vezes vem tudo junto em "numero" ("090/084")
  if (numero.includes('/') && !total) {
    const n = extrairNumero(numero);
    if (n) ({ numero, total } = n);
  }
  const sigla = texto(carta.sigla).toUpperCase().replace(/[^A-Z0-9-]/g, '');
  return {
    nome,
    nomeImpresso: impresso,
    qualidadeNome: nome ? Math.max(0.85, qualidadeNome(nome)) : 0,
    numero, total,
    numeros: numero ? [{ numero, total }] : [],
    trechosNumero: [],
    // a sigla impressa na energia básica ("MEE") é a do lote de energias, não a edição da Liga (Prize Pack, promos)
    siglas: sigla && !energia ? [sigla] : [],
    energiaBasica: !!energia,
    idioma,
    latino: LATINOS.has(idioma),
    lidoPor: 'Gemini',
    // undefined = o intermediário ainda não pede o extra (versão antiga): o app usa a análise da imagem
    extraGemini: carta.extra === undefined ? undefined
      : EXTRAS_GEMINI[texto(carta.extra).toLowerCase().replace(/[\u00e9\u00c9]/g, 'e')] ?? '',
    textos: { gemini: JSON.stringify({ modelo, ...carta }, null, 1) },
  };
}

// Um pedido ao intermediário. Erros viram exceção: .login quando o token não vale mais, .temporario quando vale
// tentar de novo (Gemini sobrecarregado, rede, cota por minuto).
async function pedir(proxy, corpo) {
  let r;
  try {
    r = await fetch(proxy, {
      method: 'POST',
      // text/plain: pedido "simples", sem a pré-consulta de CORS que o Apps Script não responde
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(corpo),
    });
  } catch (e) {
    throw Object.assign(new Error(`sem conexão com o intermediário (${e.message})`), { temporario: true });
  }
  if (!r.ok) throw Object.assign(new Error(`Gemini: HTTP ${r.status}`), { temporario: r.status >= 500 || r.status === 429 });
  const d = await r.json();
  if (!d.ok) throw Object.assign(new Error(d.erro || 'Gemini: falhou'), { login: !!d.login, temporario: !!d.temporario });
  return d;
}

// Cota grátis do Flash-Lite: 15 pedidos por minuto. Na fila, as leituras saem uma depois da outra com essa folga.
const INTERVALO_MINIMO = 4200;
let ultimoPedido = 0;
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));

// Espera a folga da cota e faz o pedido; erro temporário (503, rede): espera e tenta de novo, até 3 vezes no total.
async function comFolga(fazer, esperas) {
  for (let tentativa = 0; ; tentativa++) {
    const falta = INTERVALO_MINIMO - (Date.now() - ultimoPedido);
    if (falta > 0) await esperar(falta);
    ultimoPedido = Date.now();
    try {
      return await fazer();
    } catch (e) {
      if (!e.temporario || tentativa >= esperas.length) throw e;
      await esperar(esperas[tentativa]);
    }
  }
}

// Cartas da Liga com o mesmo nome e número (energias básicas, reimpressões em Prize Pack): o Gemini olha a foto e as
// imagens delas e diz qual é a mesma impressão. Devolve { indice (na lista, -1 = nenhuma), confianca, motivo }.
export const MAXIMO_OPCOES = 8;
export async function compararComGemini(canvas, opcoes, { proxy, token, esperas = [3000, 6000] }) {
  const imagem = fotoParaEnvio(canvas);
  const urls = opcoes.slice(0, MAXIMO_OPCOES).map((c) => c.imagem);
  const d = await comFolga(() => pedir(proxy, { acao: 'compararCartas', token, imagem, opcoes: urls }), esperas);
  const r = d.resposta || {};
  const n = Number(r.opcao);
  return {
    indice: Number.isInteger(n) && n >= 1 && n <= urls.length ? n - 1 : -1,
    confianca: String(r.confianca ?? ''),
    motivo: String(r.motivo ?? ''),
  };
}

// Manda a foto ao intermediário e devolve a leitura normalizada. Erro temporário (503, rede): espera e tenta de
// novo, até 3 vezes no total; só depois disso o app desiste e usa o OCR.
export async function lerComGemini(canvas, { proxy, token, esperas = [3000, 6000] }) {
  const imagem = fotoParaEnvio(canvas);
  const d = await comFolga(() => pedir(proxy, { acao: 'lerCarta', token, imagem }), esperas);
  return normalizarLeitura(d.carta, d.modelo);
}
