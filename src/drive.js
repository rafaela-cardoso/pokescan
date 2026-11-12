// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Foto da carta no Google Drive (API REST v3, com o token do usuário), na pasta escolhida em Configurar.
// O nome da foto é o mesmo texto da coluna Carta, com "-" no lugar de "/": "Gabite da Cíntia (110-217).jpg".
// Enquanto não sobe, a foto fica guardada no celular (IndexedDB): sobrevive ao login por redirecionamento e a
// falhas de conexão, e é enviada junto com as pendentes.

// Escopo do Drive inteiro: com o escopo restrito (drive.file) o app não pode gravar numa pasta que ele não criou.
export const ESCOPO_DRIVE = 'https://www.googleapis.com/auth/drive';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name';

// Link da pasta (".../drive/folders/ID?hl=pt-br") ou o próprio ID -> ID.
export function idDaPasta(urlOuId) {
  const s = String(urlOuId ?? '').trim();
  const m = s.match(/\/folders\/([a-zA-Z0-9_-]{10,})/) || s.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  return /^[a-zA-Z0-9_-]{10,}$/.test(s) ? s : '';
}

// "Gabite da Cíntia (110/217)" -> "Gabite da Cíntia (110-217).jpg"
export const nomeDaFoto = (carta) => `${String(carta ?? '').trim().replace(/\//g, '-') || 'carta'}.jpg`;

// Corpo multipart/related: metadados (JSON) + a imagem.
export function corpoMultipart(metadados, imagem, fronteira) {
  return new Blob([
    `--${fronteira}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadados)}\r\n`,
    `--${fronteira}\r\nContent-Type: ${imagem.type || 'image/jpeg'}\r\n\r\n`,
    imagem,
    `\r\n--${fronteira}--`,
  ]);
}

// Envia a foto para a pasta. Devolve { id, name } do arquivo criado.
export async function enviarFoto(token, pastaId, nome, imagem) {
  const fronteira = `pokescan${Math.random().toString(36).slice(2)}`;
  const r = await fetch(UPLOAD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${fronteira}` },
    body: corpoMultipart({ name: nome, parents: [pastaId], mimeType: imagem.type || 'image/jpeg' }, imagem, fronteira),
  });
  if (!r.ok) {
    let msg = `${r.status}`;
    try { msg = (await r.json()).error?.message || msg; } catch { /* corpo sem JSON */ }
    if (/has not been used|is disabled/i.test(msg)) msg = 'ative a Google Drive API no Google Cloud Console';
    else if (r.status === 404) msg = 'pasta não encontrada: confira o link da pasta em Configurar';
    else if (r.status === 403) msg = `sem permissão para gravar na pasta (${msg})`;
    const e = new Error(`Google Drive: ${msg}`);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

// Foto (canvas da carta recortada) -> JPEG.
export const fotoEmJpeg = (canvas) => new Promise((ok, erro) => {
  canvas.toBlob((b) => (b ? ok(b) : erro(new Error('Não consegui gerar a foto da carta.'))), 'image/jpeg', 0.9);
});

// ---------- fila de fotos no celular (IndexedDB) ----------
let banco = null;
function abrir() {
  banco ??= new Promise((ok, erro) => {
    const r = indexedDB.open('pokescan', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('fotos');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { banco = null; erro(r.error); };
  });
  return banco;
}
async function operar(modo, acao) {
  const db = await abrir();
  return new Promise((ok, erro) => {
    const t = db.transaction('fotos', modo);
    const r = acao(t.objectStore('fotos'));
    t.oncomplete = () => ok(r?.result);
    t.onerror = () => erro(t.error);
  });
}
export const guardarFoto = (id, imagem) => operar('readwrite', (s) => s.put(imagem, id));
export const lerFoto = (id) => operar('readonly', (s) => s.get(id));
export const apagarFoto = (id) => operar('readwrite', (s) => s.delete(id)).catch(() => {});
