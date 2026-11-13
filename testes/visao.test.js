import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizarLeitura, nomeDaEnergiaBasica } from '../src/visao.js';

test('resposta do Gemini vira o mesmo formato da leitura do OCR', () => {
  const l = normalizarLeitura({ nome: 'Slowbro', numero: '090', total: '084', sigla: 'pbl', idioma: 'PT' }, 'm');
  assert.equal(l.nome, 'Slowbro');
  assert.deepEqual(l.numeros, [{ numero: '090', total: '084' }]);
  assert.deepEqual(l.siglas, ['PBL']);
  assert.equal(l.idioma, 'PT');
  assert.equal(l.latino, true);
  assert.equal(l.lidoPor, 'Gemini');
  assert.ok(l.qualidadeNome >= 0.85);
});

test('número junto ("090/084"), promo sem total e idiomas asiáticos', () => {
  assert.deepEqual(normalizarLeitura({ numero: '090/084' }).numeros, [{ numero: '090', total: '084' }]);
  assert.deepEqual(normalizarLeitura({ nome: 'Rayquaza', numero: 'XY64', total: '' }).numeros, [{ numero: 'XY64', total: '' }]);
  assert.equal(normalizarLeitura({ idioma: 'KO' }).idioma, 'KO');
  assert.equal(normalizarLeitura({ idioma: 'ZH-TW' }).idioma, 'CH');
  assert.equal(normalizarLeitura({ idioma: 'ZH-CN' }).idioma, 'CHS');
  assert.equal(normalizarLeitura({ idioma: 'ja' }).idioma, 'JP');
  assert.deepEqual(normalizarLeitura({ nome: '', sigla: '' }).siglas, []);
});

// ---------- o Apps Script, rodado com os serviços do Google simulados ----------
function carregarScript({ props, tokeninfo, gemini }) {
  const chamadas = [];
  const resposta = (codigo, corpo) => ({ getResponseCode: () => codigo, getContentText: () => (typeof corpo === 'string' ? corpo : JSON.stringify(corpo)) });
  const globais = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null }) },
    UrlFetchApp: {
      fetch: (url, op) => {
        chamadas.push({ url, op });
        if (url.includes('tokeninfo')) return resposta(tokeninfo[0], tokeninfo[1]);
        return resposta(gemini[0], gemini[1]);
      },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } }) },
    Utilities: { sleep: () => {} },
  };
  const codigo = readFileSync(new URL('../proxy/AppsScript_imagens.gs', import.meta.url), 'utf8');
  const fn = new Function(...Object.keys(globais), `${codigo}\nreturn { doPost };`);
  const { doPost } = fn(...Object.values(globais));
  const post = (corpo) => JSON.parse(doPost({ postData: { contents: JSON.stringify(corpo) } }).texto);
  return { post, chamadas };
}

const PROPS = { GEMINI_API_KEY: 'chave', CLIENT_ID: 'app.apps.googleusercontent.com' };
const GEMINI_OK = [200, { candidates: [{ content: { parts: [{ text: '```json\n{"nome":"Slowbro","numero":"090","total":"084","sigla":"PBL","idioma":"PT"}\n```' }] } }] }];

test('Apps Script: lê pelo Gemini quando o login é do pokescan', () => {
  const { post, chamadas } = carregarScript({ props: PROPS, tokeninfo: [200, { aud: PROPS.CLIENT_ID }], gemini: GEMINI_OK });
  const r = post({ acao: 'lerCarta', token: 'tok', imagem: 'AAAA' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.carta, { nome: 'Slowbro', numero: '090', total: '084', sigla: 'PBL', idioma: 'PT' });
  const g = chamadas.find((c) => c.url.includes(':generateContent'));
  assert.equal(g.op.headers['x-goog-api-key'], 'chave');
  const corpo = JSON.parse(g.op.payload);
  assert.equal(corpo.contents[0].parts[0].inlineData.data, 'AAAA');
  assert.equal(corpo.generationConfig.responseMimeType, 'application/json');
});

test('Apps Script: recusa login de outro app, token inválido e falta de configuração', () => {
  assert.match(carregarScript({ props: PROPS, tokeninfo: [200, { aud: 'outro' }], gemini: GEMINI_OK }).post({ acao: 'lerCarta', token: 't', imagem: 'A' }).erro, /outro aplicativo/);
  const r = carregarScript({ props: PROPS, tokeninfo: [400, {}], gemini: GEMINI_OK }).post({ acao: 'lerCarta', token: 't', imagem: 'A' });
  assert.equal(r.login, true);
  assert.match(carregarScript({ props: {}, tokeninfo: [200, {}], gemini: GEMINI_OK }).post({ acao: 'lerCarta' }).erro, /GEMINI_API_KEY/);
  assert.match(carregarScript({ props: PROPS, tokeninfo: [200, { aud: PROPS.CLIENT_ID }], gemini: [429, {}] }).post({ acao: 'lerCarta', token: 't', imagem: 'A' }).erro, /Cota/);
});

test('Apps Script: com a cota do Flash-Lite esgotada, tenta o 3.8 Flash', () => {
  const chamadas = [];
  const resposta = (codigo, corpo) => ({ getResponseCode: () => codigo, getContentText: () => JSON.stringify(corpo) });
  const globais = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => PROPS[k] ?? null }) },
    UrlFetchApp: {
      fetch: (url) => {
        chamadas.push(url);
        if (url.includes('tokeninfo')) return resposta(200, { aud: PROPS.CLIENT_ID });
        return url.includes('flash-lite') ? resposta(429, {}) : resposta(...GEMINI_OK);
      },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } }) },
    Utilities: { sleep: () => {} },
  };
  const codigo = readFileSync(new URL('../proxy/AppsScript_imagens.gs', import.meta.url), 'utf8');
  const { doPost } = new Function(...Object.keys(globais), `${codigo}\nreturn { doPost };`)(...Object.values(globais));
  const r = JSON.parse(doPost({ postData: { contents: JSON.stringify({ acao: 'lerCarta', token: 't', imagem: 'A' }) } }).texto);
  assert.equal(r.ok, true);
  assert.equal(r.modelo, 'gemini-3.8-flash');
  assert.equal(chamadas.filter((u) => u.includes(':generateContent')).length, 2);
});

test('extra pelo Gemini vira o nome da coluna Extra; sem o campo, fica para a análise da imagem', () => {
  assert.equal(normalizarLeitura({ extra: 'Reverse Foil' }).extraGemini, 'Reverse Foil');
  assert.equal(normalizarLeitura({ extra: 'Poké Ball Foil' }).extraGemini, 'Pokeball Foil');
  assert.equal(normalizarLeitura({ extra: 'master ball' }).extraGemini, 'Master Ball');
  assert.equal(normalizarLeitura({ extra: 'Normal' }).extraGemini, 'Normal');
  assert.equal(normalizarLeitura({ extra: '' }).extraGemini, '', 'não deu para ver o brilho');
  assert.equal(normalizarLeitura({ nome: 'X' }).extraGemini, undefined, 'intermediário antigo, sem o campo');
});

test('Apps Script: Gemini sobrecarregado (503) é tentado de novo antes de desistir', () => {
  let n = 0;
  // o Gemini responde 503 duas vezes, depois ok
  const codigo = readFileSync(new URL('../proxy/AppsScript_imagens.gs', import.meta.url), 'utf8');
  const resposta = (c, corpo) => ({ getResponseCode: () => c, getContentText: () => JSON.stringify(corpo) });
  const globais = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => PROPS[k] ?? null }) },
    UrlFetchApp: { fetch: (url) => (url.includes('tokeninfo') ? resposta(200, { aud: PROPS.CLIENT_ID }) : (++n <= 2 ? resposta(503, {}) : resposta(...GEMINI_OK))) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } }) },
    Utilities: { sleep: () => {} },
  };
  const { doPost } = new Function(...Object.keys(globais), `${codigo}\nreturn { doPost };`)(...Object.values(globais));
  const r = JSON.parse(doPost({ postData: { contents: JSON.stringify({ acao: 'lerCarta', token: 't', imagem: 'A' }) } }).texto);
  assert.equal(r.ok, true);
  assert.equal(n, 3);
});

test('lerComGemini tenta de novo em erro temporário e só então desiste', async () => {
  const { lerComGemini } = await import('../src/visao.js');
  const original = globalThis.fetch;
  globalThis.document = { createElement: () => ({}) };
  const canvas = { width: 10, height: 14, toDataURL: () => 'data:image/jpeg;base64,AAAA' };
  let n = 0;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => (++n < 3 ? { ok: false, erro: 'Gemini sobrecarregado (HTTP 503).', temporario: true } : { ok: true, modelo: 'm', carta: { nome: 'Slowbro', numero: '090', total: '084' } }) });
  try {
    const l = await lerComGemini(canvas, { proxy: 'p', token: 't', esperas: [1, 1] });
    assert.equal(l.nome, 'Slowbro');
    assert.equal(n, 3);
    n = -100; // sempre falha
    await assert.rejects(lerComGemini(canvas, { proxy: 'p', token: 't', esperas: [1, 1] }), /sobrecarregado/);
  } finally {
    globalThis.fetch = original;
    delete globalThis.document;
  }
});

test('Energia Básica vira o nome da Liga pelo tipo ("Grass Energy") e ignora a sigla do lote de energias', () => {
  const l = normalizarLeitura({ nome: 'Energia Básica', nomeIngles: 'Basic Energy', numero: '001', total: '', sigla: 'MEE', idioma: 'PT', energia: 'Grass' });
  assert.equal(l.nome, 'Grass Energy');
  assert.equal(l.nomeImpresso, 'Energia Básica');
  assert.equal(l.energiaBasica, true);
  assert.deepEqual(l.siglas, []);
  assert.deepEqual(l.numeros, [{ numero: '001', total: '' }]);
  // intermediário antigo, sem o campo energia: o tipo vem do nome em inglês ou do nome impresso
  assert.equal(nomeDaEnergiaBasica({ nome: 'Energia Básica', nomeIngles: 'Basic Grass Energy' }), 'Grass Energy');
  assert.equal(nomeDaEnergiaBasica({ nome: 'Energia de Água Básica' }), 'Water Energy');
  assert.equal(nomeDaEnergiaBasica({ nome: '基本超エネルギー', nomeIngles: 'Basic Psychic Energy' }), 'Psychic Energy');
  assert.equal(nomeDaEnergiaBasica({ nome: 'Energia Básica', energia: 'Darkness' }), 'Darkness Energy');
  // sem o tipo, não dá para buscar pelo nome da Liga: fica o nome lido
  assert.equal(nomeDaEnergiaBasica({ nome: 'Energia Básica' }), '');
  // energias especiais e outras cartas seguem normais
  assert.equal(nomeDaEnergiaBasica({ nome: 'Energia Dupla Turbo', nomeIngles: 'Double Turbo Energy', energia: '' }), '');
  assert.equal(nomeDaEnergiaBasica({ nome: 'Slowbro', nomeIngles: 'Slowbro', energia: '' }), '');
  assert.equal(normalizarLeitura({ nome: 'Slowbro', sigla: 'PBL', energia: '' }).energiaBasica, false);
});

test('Apps Script: compara a foto com as imagens da Liga e devolve a opção escolhida', () => {
  const chamadas = [];
  const resposta = (c, corpo) => ({ getResponseCode: () => c, getContentText: () => JSON.stringify(corpo) });
  const globais = {
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => PROPS[k] ?? null }) },
    UrlFetchApp: {
      fetch: (url, op) => {
        chamadas.push({ url, op });
        if (url.includes('tokeninfo')) return resposta(200, { aud: PROPS.CLIENT_ID });
        if (url.includes('sbrauble')) return { getResponseCode: () => 200, getBlob: () => ({ getContentType: () => 'image/jpeg', getBytes: () => [1, 2, 3] }) };
        return resposta(200, { candidates: [{ content: { parts: [{ text: '{"opcao": 2, "confianca": "alta", "motivo": "selo dentro da arte"}' }] } }] });
      },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ texto: t, setMimeType() { return this; } }) },
    Utilities: { sleep: () => {}, base64Encode: (b) => `b64:${b.length}` },
  };
  const codigo = readFileSync(new URL('../proxy/AppsScript_imagens.gs', import.meta.url), 'utf8');
  const { doPost } = new Function(...Object.keys(globais), `${codigo}\nreturn { doPost };`)(...Object.values(globais));
  const post = (corpo) => JSON.parse(doPost({ postData: { contents: JSON.stringify(corpo) } }).texto);
  const opcoes = ['https://repositorio.sbrauble.com/a.jpg', 'https://repositorio.sbrauble.com/b.jpg'];
  const r = post({ acao: 'compararCartas', token: 't', imagem: 'FOTO', opcoes });
  assert.equal(r.ok, true);
  assert.deepEqual(r.resposta, { opcao: 2, confianca: 'alta', motivo: 'selo dentro da arte' });
  const partes = JSON.parse(chamadas.find((c) => c.url.includes(':generateContent')).op.payload).contents[0].parts;
  assert.equal(partes.filter((p) => p.inlineData).length, 3, 'a foto e as duas opções');
  assert.equal(partes[1].inlineData.data, 'FOTO');
  // só imagens da Liga e ao menos duas opções
  assert.match(post({ acao: 'compararCartas', token: 't', imagem: 'F', opcoes: ['https://exemplo.com/x.jpg', opcoes[0]] }).erro, /não permitido/);
  assert.match(post({ acao: 'compararCartas', token: 't', imagem: 'F', opcoes: [opcoes[0]] }).erro, /duas opções/);
});

test('compararComGemini devolve o índice da opção (−1 se nenhuma)', async () => {
  const { compararComGemini } = await import('../src/visao.js');
  const original = globalThis.fetch;
  globalThis.document = { createElement: () => ({}) };
  const canvas = { width: 10, height: 14, toDataURL: () => 'data:image/jpeg;base64,AAAA' };
  let corpo, opcao = 2;
  globalThis.fetch = async (_, op) => { corpo = JSON.parse(op.body); return { ok: true, status: 200, json: async () => ({ ok: true, resposta: { opcao, confianca: 'alta', motivo: 'm' } }) }; };
  try {
    const opcoes = [{ imagem: 'https://x/1.jpg' }, { imagem: 'https://x/2.jpg' }, { imagem: 'https://x/3.jpg' }];
    const r = await compararComGemini(canvas, opcoes, { proxy: 'p', token: 't' });
    assert.equal(r.indice, 1);
    assert.equal(corpo.acao, 'compararCartas');
    assert.deepEqual(corpo.opcoes, ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg']);
    opcao = 0;
    assert.equal((await compararComGemini(canvas, opcoes, { proxy: 'p', token: 't' })).indice, -1);
  } finally {
    globalThis.fetch = original;
    delete globalThis.document;
  }
});
