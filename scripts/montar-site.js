// pokescan · Copyright © 2026 Rafaela Cardoso · PolyForm Noncommercial 1.0.0
// Copia só os arquivos do app para _site/ (o que vai para o GitHub Pages).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, '_site');
const ITENS = ['index.html', 'estilo.css', 'manifest.webmanifest', 'icone.svg', 'sw.js', 'LICENSE.md', 'src'];

fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(SAIDA);
for (const item of ITENS) fs.cpSync(path.join(RAIZ, item), path.join(SAIDA, item), { recursive: true });

// Client ID do Google vindo da CI (variável do repositório POKESCAN_CLIENT_ID), para não precisar digitar no celular.
// Idem para o intermediário de imagens (variável POKESCAN_PROXY_IMAGENS).
const id = process.env.POKESCAN_CLIENT_ID?.trim();
const proxy = process.env.POKESCAN_PROXY_IMAGENS?.trim();
const cfg = path.join(SAIDA, 'src', 'config.js');
let texto = fs.readFileSync(cfg, 'utf8');
if (id) texto = texto.replace("clienteId: ''", `clienteId: ${JSON.stringify(id)}`);
if (proxy) texto = texto.replace(/proxyImagens: '[^']*'/, `proxyImagens: ${JSON.stringify(proxy)}`);
fs.writeFileSync(cfg, texto);
console.log(`Site montado em ${SAIDA}${id ? ' (com Client ID)' : ''}${proxy ? ' (com intermediário de imagens)' : ''}`);
