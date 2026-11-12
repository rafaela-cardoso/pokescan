// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Login com a conta Google (fluxo de token no navegador). Diferente do bot (conta de serviço, só leitura),
// aqui o app grava com a SUA conta, então qualquer planilha que você possa editar pode ser escolhida.
// Nada passa por servidor nosso.
//
// Dois jeitos de entrar:
//  - popup (Google Identity Services): no navegador. O popup só abre se for pedido no MESMO toque do usuário,
//    sem nenhum `await` antes; por isso o script e o cliente são preparados assim que o app abre.
//  - redirecionamento: no app instalado na tela inicial (o iPhone não abre popup ali) ou se o popup falhar.
//    A página vai para o Google e volta com o token no endereço (#access_token=...). Precisa do endereço do
//    app em "URIs de redirecionamento autorizados" no Google Cloud Console.
import { ler, gravar } from './armazenamento.js';
import { ESCOPO_DRIVE } from './drive.js';

const ESCOPO = 'https://www.googleapis.com/auth/spreadsheets';
// Planilha sempre; Drive só com "Salvar foto no Drive" ligado.
const escopos = (drive) => (drive ? `${ESCOPO} ${ESCOPO_DRIVE}` : ESCOPO);
const temEscopos = (t, drive) => !drive || String(t?.escopos ?? '').split(' ').includes(ESCOPO_DRIVE);
const SCRIPT = 'https://accounts.google.com/gsi/client';
const AUTORIZACAO = 'https://accounts.google.com/o/oauth2/v2/auth';

let cliente = null, clienteId = '';
// { valor, expira, cliente, escopos }: guardado para o app instalado não pedir login a cada vez que o iPhone o recarrega
let token = ler('token', null);
let pedido = null;
let carregando = null;
// O que precisa terminar antes de a página sair para o login (ex.: guardar a foto da carta no celular).
const antesDeSair = new Set();
export function esperarAntesDeSair(promessa) {
  const p = Promise.resolve(promessa).catch(() => {});
  antesDeSair.add(p);
  p.then(() => antesDeSair.delete(p));
}

function carregarScript() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  carregando ??= new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => { carregando = null; s.remove(); erro(new Error('Não consegui carregar o login do Google. Confira a conexão.')); };
    document.head.appendChild(s);
  });
  return carregando;
}

function guardar(t) { token = t; gravar('token', t); }

export const conectado = (id, { drive = false } = {}) =>
  !!token && token.expira > Date.now() + 60_000 && (!id || token.cliente === id) && temEscopos(token, drive);

// App aberto pelo ícone da tela inicial (sem barra do navegador).
export const instalado = () =>
  globalThis.navigator?.standalone === true || !!globalThis.matchMedia?.('(display-mode: standalone)').matches;

// Endereço para onde o Google devolve o login: a página do app, sem "index.html", busca nem âncora.
export const enderecoRetorno = (loc = location) => loc.origin + loc.pathname.replace(/index\.html$/, '');

function criarCliente(id) {
  if (cliente && id === clienteId) return;
  clienteId = id;
  cliente = google.accounts.oauth2.initTokenClient({
    client_id: id,
    scope: ESCOPO,
    callback: (r) => {
      const p = pedido; pedido = null;
      if (r.error) return p?.erro(new Error(`Login do Google: ${r.error_description || r.error}`));
      guardar({ valor: r.access_token, expira: Date.now() + Number(r.expires_in || 3600) * 1000, cliente: id, escopos: r.scope || '' });
      if (!temEscopos(token, p?.drive)) return p?.erro(new Error('Login do Google: o acesso ao Drive não foi liberado (marque a caixa do Drive ao entrar).'));
      p?.ok(token.valor);
    },
    error_callback: (e) => {
      const p = pedido; pedido = null;
      if (!p) return;
      // o navegador barrou o popup: entra pelo redirecionamento
      if (e?.type === 'popup_failed_to_open') return redirecionar(id, p.depois, p.drive).catch(p.erro);
      p.erro(new Error(e?.type === 'popup_closed' ? 'Login cancelado.' : `Login do Google: ${e?.message || e?.type || 'falhou'}`));
    },
  });
}

// Carrega o login do Google em segundo plano, para o toque em "Entrar" abrir o popup na hora.
export function preparar(id) {
  if (!id || instalado()) return;
  carregarScript().then(() => criarCliente(id)).catch(() => {});
}

// Vai para a página de login do Google; a página volta com o token (ver capturarRetorno).
// `depois` diz o que fazer na volta ('ajustes', 'abas', 'reenviar'). Devolve uma promessa rejeitada
// com `redirecionando: true`, para quem chamou guardar o que precisa ANTES de a página sair.
function redirecionar(id, depois = '', drive = false) {
  const estado = Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
  gravar('login', { estado, id, depois });
  const url = new URL(AUTORIZACAO);
  url.search = new URLSearchParams({
    client_id: id,
    redirect_uri: enderecoRetorno(),
    response_type: 'token',
    scope: escopos(drive),
    state: estado,
    include_granted_scopes: 'true',
  });
  // sai depois que o que estava sendo guardado terminar (no máximo 3 s)
  const espera = Promise.race([Promise.all([...antesDeSair]), new Promise((ok) => setTimeout(ok, 3000))]);
  setTimeout(() => espera.then(() => location.assign(url.href)), 50);
  const e = new Error('Abrindo o login do Google…');
  e.redirecionando = true;
  return Promise.reject(e);
}

// Lê a volta do login por redirecionamento (#access_token=... ou #error=...) e limpa o endereço.
// Devolve null (não era uma volta do login), { depois } (deu certo) ou { erro, depois }.
export function capturarRetorno(loc = location) {
  const p = new URLSearchParams(loc.hash.replace(/^#/, ''));
  if (!p.has('access_token') && !p.has('error')) return null;
  const pedidoSalvo = ler('login', null);
  gravar('login', null);
  try { history.replaceState(null, '', loc.pathname + loc.search); } catch { /* sem history */ }
  if (!pedidoSalvo || p.get('state') !== pedidoSalvo.estado) return { erro: 'Login do Google não confere. Tente entrar de novo.', depois: '' };
  const { depois = '' } = pedidoSalvo;
  if (p.has('error')) {
    return { erro: p.get('error') === 'access_denied' ? 'Login cancelado.' : `Login do Google: ${p.get('error')}`, depois };
  }
  guardar({
    valor: p.get('access_token'), expira: Date.now() + Number(p.get('expires_in') || 3600) * 1000,
    cliente: pedidoSalvo.id, escopos: p.get('scope') || '',
  });
  return { depois };
}

// Devolve um token válido; abre o login do Google se for preciso (precisa vir de um toque do usuário).
// De propósito NÃO é `async`: com o script já carregado, o popup é pedido no mesmo toque, sem esperar nada.
// `drive`: pede também o acesso ao Drive (para salvar a foto da carta).
export function obterToken(id, { depois = '', drive = false } = {}) {
  if (!id) return Promise.reject(new Error('Informe o Client ID do Google nas configurações.'));
  if (conectado(id, { drive })) return Promise.resolve(token.valor);
  if (instalado()) return redirecionar(id, depois, drive);
  const pedir = () => {
    criarCliente(id);
    return new Promise((ok, erro) => {
      pedido = { ok, erro, depois, drive };
      const novoEscopo = drive && token && !temEscopos(token, true);
      cliente.requestAccessToken({ prompt: token && !novoEscopo ? '' : 'consent', scope: escopos(drive), include_granted_scopes: true });
    });
  };
  // script ainda não carregado (conexão lenta): tenta assim mesmo; se o popup for barrado, cai no redirecionamento
  return globalThis.google?.accounts?.oauth2 ? pedir() : carregarScript().then(pedir);
}

export function sair() {
  if (token) {
    if (globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.valor, () => {});
    else fetch('https://oauth2.googleapis.com/revoke', { method: 'POST', body: new URLSearchParams({ token: token.valor }) }).catch(() => {});
  }
  guardar(null);
}

// Token expirou ou foi revogado no meio do caminho: esquece para pedir de novo.
export function invalidar() { guardar(null); }
