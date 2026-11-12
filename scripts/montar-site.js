// pokescan · Copyright © 2026 Rafaela Cardoso · PolyForm Noncommercial 1.0.0
// Copia só os arquivos do app para _site/ (o que vai para o GitHub Pages).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = path.join(RAIZ, '_site');
const ITENS = ['index.html', 'estilo.css', 'manifest.webmanifest', 'icones', 'sw.js', 'LICENSE.md', 'src'];

fs.rmSync(SAIDA, { recursive: true, force: true });
fs.mkdirSync(SAIDA);
for (const item of ITENS) fs.cpSync(path.join(RAIZ, item), path.join(SAIDA, item), { recursive: true });

// Client ID do Google vindo da CI (variável do repositório POKESCAN_CLIENT_ID), para não precisar digitar no celular.
// Idem para o intermediário de imagens (variável POKESCAN_PROXY_IMAGENS).
const id = process.env.POKESCAN_CLIENT_ID?.trim();
const proxy = process.env.POKESCAN_PROXY_IMAGENS?.trim();
const planilha = process.env.POKESCAN_PLANILHA?.trim();
const aba = process.env.POKESCAN_ABA?.trim();
const pasta = process.env.POKESCAN_PASTA_DRIVE?.trim();
const cfg = path.join(SAIDA, 'src', 'config.js');
let texto = fs.readFileSync(cfg, 'utf8');
if (id) texto = texto.replace("clienteId: ''", `clienteId: ${JSON.stringify(id)}`);
if (proxy) texto = texto.replace(/proxyImagens: '[^']*'/, `proxyImagens: ${JSON.stringify(proxy)}`);
if (planilha) texto = texto.replace("planilha: ''", `planilha: ${JSON.stringify(planilha)}`);
if (aba) texto = texto.replace("aba: ''", `aba: ${JSON.stringify(aba)}`);
if (pasta) texto = texto.replace("pastaDrive: ''", `pastaDrive: ${JSON.stringify(pasta)}`);
fs.writeFileSync(cfg, texto);
const extras = [id && 'Client ID', proxy && 'intermediário de imagens', planilha && 'planilha', aba && 'aba', pasta && 'pasta do Drive'].filter(Boolean);
console.log(`Site montado em ${SAIDA}${extras.length ? ` (com ${extras.join(', ')})` : ''}`);
