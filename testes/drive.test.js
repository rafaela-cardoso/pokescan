import test from 'node:test';
import assert from 'node:assert/strict';
import { idDaPasta, nomeDaFoto, corpoMultipart, enviarFoto } from '../src/drive.js';

const PASTA = '1AbCdEfGhIjKlMnOpQrStUvWxYz0_pasta';

test('idDaPasta aceita o link da pasta (com ?hl=) ou o ID', () => {
  assert.equal(idDaPasta(`https://drive.google.com/drive/folders/${PASTA}?hl=pt-br`), PASTA);
  assert.equal(idDaPasta(`https://drive.google.com/drive/u/0/folders/${PASTA}`), PASTA);
  assert.equal(idDaPasta(PASTA), PASTA);
  assert.equal(idDaPasta('https://drive.google.com/'), '');
  assert.equal(idDaPasta(''), '');
});

test('nome da foto = texto da coluna Carta com "-" no lugar de "/"', () => {
  assert.equal(nomeDaFoto('Gabite da Cíntia (110/217)'), 'Gabite da Cíntia (110-217).jpg');
  assert.equal(nomeDaFoto('Pikachu (TG05/TG30)'), 'Pikachu (TG05-TG30).jpg');
  assert.equal(nomeDaFoto('Mew'), 'Mew.jpg');
});

test('envio ao Drive: multipart com nome e pasta', async () => {
  const original = globalThis.fetch;
  let pedido;
  globalThis.fetch = async (url, op) => { pedido = { url, op }; return { ok: true, status: 200, json: async () => ({ id: 'x', name: 'n' }) }; };
  try {
    const img = new Blob(['jpeg'], { type: 'image/jpeg' });
    assert.deepEqual(await enviarFoto('tok', PASTA, 'Gabite da Cíntia (110-217).jpg', img), { id: 'x', name: 'n' });
    assert.match(pedido.url, /upload\/drive\/v3\/files\?uploadType=multipart/);
    assert.equal(pedido.op.headers.Authorization, 'Bearer tok');
    const corpo = await pedido.op.body.text();
    assert.ok(corpo.includes(JSON.stringify({ name: 'Gabite da Cíntia (110-217).jpg', parents: [PASTA], mimeType: 'image/jpeg' })));
    assert.ok(corpo.includes('Content-Type: image/jpeg\r\n\r\njpeg\r\n--'));
  } finally {
    globalThis.fetch = original;
  }
});

test('erros do Drive viram mensagens claras', async () => {
  const original = globalThis.fetch;
  const responder = (status, message) => { globalThis.fetch = async () => ({ ok: false, status, json: async () => ({ error: { message } }) }); };
  const img = new Blob(['x'], { type: 'image/jpeg' });
  try {
    responder(403, 'Google Drive API has not been used in project 123 before or it is disabled.');
    await assert.rejects(enviarFoto('t', PASTA, 'a.jpg', img), /ative a Google Drive API/);
    responder(404, 'File not found');
    await assert.rejects(enviarFoto('t', PASTA, 'a.jpg', img), /pasta não encontrada/);
  } finally {
    globalThis.fetch = original;
  }
});

test('corpo multipart termina com a fronteira de fechamento', async () => {
  const t = await corpoMultipart({ name: 'a' }, new Blob(['z'], { type: 'image/jpeg' }), 'B').text();
  assert.ok(t.startsWith('--B\r\nContent-Type: application/json'));
  assert.ok(t.endsWith('\r\n--B--'));
});
