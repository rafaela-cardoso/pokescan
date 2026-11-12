// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Preferências e fila local (localStorage do celular). Tudo protegido: em aba anônima pode não existir.
const PREFIXO = 'pokescan.';

export function ler(chave, padrao) {
  try {
    const v = localStorage.getItem(PREFIXO + chave);
    return v == null ? padrao : JSON.parse(v);
  } catch { return padrao; }
}

export function gravar(chave, valor) {
  try { localStorage.setItem(PREFIXO + chave, JSON.stringify(valor)); } catch { /* sem armazenamento */ }
}
