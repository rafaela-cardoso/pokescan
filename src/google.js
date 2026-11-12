// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Login com a conta Google (Google Identity Services, fluxo de token no navegador).
// Diferente do bot (conta de serviço, só leitura), aqui o app grava com a SUA conta,
// então qualquer planilha que você possa editar pode ser escolhida. Nada passa por servidor nosso.
const ESCOPO = 'https://www.googleapis.com/auth/spreadsheets';
const SCRIPT = 'https://accounts.google.com/gsi/client';

let cliente = null, clienteId = '';
let token = null; // { valor, expira }
let pedido = null;

function carregarScript() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => ok();
    s.onerror = () => erro(new Error('Não consegui carregar o login do Google. Confira a conexão.'));
    document.head.appendChild(s);
  });
}

export const conectado = () => !!token && token.expira > Date.now() + 60_000;

// Devolve um token válido; abre o login do Google se for preciso (precisa vir de um toque do usuário).
export async function obterToken(id) {
  if (!id) throw new Error('Informe o Client ID do Google nas configurações.');
  if (conectado() && id === clienteId) return token.valor;
  await carregarScript();
  if (!cliente || id !== clienteId) {
    clienteId = id;
    cliente = google.accounts.oauth2.initTokenClient({
      client_id: id,
      scope: ESCOPO,
      callback: (r) => {
        const p = pedido; pedido = null;
        if (r.error) return p?.erro(new Error(`Login do Google: ${r.error_description || r.error}`));
        token = { valor: r.access_token, expira: Date.now() + Number(r.expires_in || 3600) * 1000 };
        p?.ok(token.valor);
      },
      error_callback: (e) => {
        const p = pedido; pedido = null;
        p?.erro(new Error(e?.type === 'popup_closed' ? 'Login cancelado.' : `Login do Google: ${e?.message || e?.type || 'falhou'}`));
      },
    });
  }
  return new Promise((ok, erro) => {
    pedido = { ok, erro };
    cliente.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}

export function sair() {
  if (token && globalThis.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.valor, () => {});
  token = null;
}

// Token expirou ou foi revogado no meio do caminho: esquece para pedir de novo.
export function invalidar() { token = null; }
