// pokescan · Copyright © 2026 Rafaela Cardoso · PolyForm Noncommercial 1.0.0
// Confere a sintaxe de todos os .js do projeto (módulos ES) sem executá-los.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pastas = ['src', 'scripts', 'testes'];
const arquivos = ['sw.js', ...pastas.flatMap((p) => fs.readdirSync(path.join(RAIZ, p)).filter((f) => f.endsWith('.js')).map((f) => `${p}/${f}`))];

let erros = 0;
for (const f of arquivos) {
  try {
    execFileSync(process.execPath, ['--check', path.join(RAIZ, f)], { stdio: 'pipe' });
  } catch (e) {
    erros++;
    console.error(`✗ ${f}\n${e.stderr}`);
  }
}
console.log(erros ? `${erros} arquivo(s) com erro` : `✓ ${arquivos.length} arquivos sem erro de sintaxe`);
process.exit(erros ? 1 : 0);
