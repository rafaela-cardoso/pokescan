// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Monta src/edicoes-liga.js (número da edição na Liga -> sigla e nome) a partir da página de edições da Liga
// salva no navegador. A página é protegida pelo Cloudflare, por isso não é baixada daqui:
//   1. abra https://www.ligapokemon.com.br/?view=cards/edicoes no seu navegador;
//   2. Ctrl+S, "Página da Web, somente HTML", salve em _teste/edicoes.html;
//   3. npm run edicoes   (ou: node scripts/atualizar-edicoes.js caminho/da/pagina.html)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const origem = process.argv[2] || path.join(raiz, '_teste', 'edicoes.html');
const html = readFileSync(origem, 'utf8');

// A página traz as edições como objetos JSON: {"id":"792","acronym":"PBL","name":"Escuridão Absoluta",...}
const edicoes = new Map();
for (const m of html.matchAll(/\{"id":"\d+","acronym":[^{}]*\}/g)) {
  const e = JSON.parse(m[0]);
  if (e.acronym) edicoes.set(e.id, [e.acronym, e.name]);
}
if (edicoes.size < 100) {
  console.error(`Só achei ${edicoes.size} edições em ${origem}. A página foi salva inteira (somente HTML)?`);
  process.exit(1);
}

const ordenadas = [...edicoes].sort((a, b) => Number(b[0]) - Number(a[0]));
const linhas = ordenadas.map(([id, v]) => `  ${JSON.stringify(id)}: ${JSON.stringify(v)},`);
const saida = `// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Edições da Liga Pokémon: número da edição (o do meio em "494|792|013", na busca) -> [sigla, nome].
// A sigla é a que vem impressa na carta ao lado do número (ASC, PBL, DLR...).
// Gerado por scripts/atualizar-edicoes.js em ${new Date().toISOString().slice(0, 10)} (${edicoes.size} edições). Não edite à mão.
export const EDICOES = {
${linhas.join('\n')}
};
`;
writeFileSync(path.join(raiz, 'src', 'edicoes-liga.js'), saida);
console.log(`✓ ${edicoes.size} edições gravadas em src/edicoes-liga.js`);
