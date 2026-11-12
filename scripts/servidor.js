// pokescan · Copyright © 2026 Rafaela Cardoso · PolyForm Noncommercial 1.0.0
// Servidor local para testar no computador: npm start -> http://localhost:5173
// (A câmera só funciona em "localhost" ou em https. No celular, use o endereço publicado no GitHub Pages.)
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = Number(process.env.PORT) || 5173;
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

// Intermediário de imagens para testes locais (o mesmo contrato do proxy/AppsScript_imagens.gs).
// Em Configurar -> "Intermediário de imagens", use http://localhost:5173/proxy-imagem
async function proxyImagem(req, res) {
  const json = (o) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(o));
  const url = new URL(req.url, 'http://x').searchParams.get('url') || '';
  let host = '';
  try { host = new URL(url).hostname; } catch { /* inválida */ }
  if (!url.startsWith('https://') || host !== 'repositorio.sbrauble.com') return json({ ok: false, erro: 'Endereço não permitido.' });
  try {
    const r = await fetch(url);
    if (!r.ok) return json({ ok: false, erro: `HTTP ${r.status}` });
    const tipo = r.headers.get('content-type') || 'image/jpeg';
    if (!tipo.startsWith('image/')) return json({ ok: false, erro: 'Não é uma imagem.' });
    return json({ ok: true, tipo, base64: Buffer.from(await r.arrayBuffer()).toString('base64') });
  } catch (e) {
    return json({ ok: false, erro: e.message });
  }
}

http.createServer(async (req, res) => {
  if (req.url.startsWith('/proxy-imagem')) return proxyImagem(req, res);
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const arq = path.join(RAIZ, p);
  if (!arq.startsWith(RAIZ + path.sep) || /[\\/](node_modules|\.git)[\\/]/.test(arq)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const dados = await fs.readFile(arq);
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(dados);
  } catch {
    res.writeHead(404).end('não encontrado');
  }
}).listen(PORTA, () => console.log(`pokescan em http://localhost:${PORTA}`));
