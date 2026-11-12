import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizarLeitura } from '../src/visao.js';

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
  };
  const codigo = readFileSync(new URL('../proxy/AppsScript_imagens.gs', import.meta.url), 'utf8');
  const { doPost } = new Function(...Object.keys(globais), `${codigo}\nreturn { doPost };`)(...Object.values(globais));
  const r = JSON.parse(doPost({ postData: { contents: JSON.stringify({ acao: 'lerCarta', token: 't', imagem: 'A' }) } }).texto);
  assert.equal(r.ok, true);
  assert.equal(r.modelo, 'gemini-3.8-flash');
  assert.equal(chamadas.filter((u) => u.includes(':generateContent')).length, 2);
});
