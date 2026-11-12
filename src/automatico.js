// GitHub Repo and Documentation: https://github.com/rafaela-cardoso/pokescan
// Copyright © 2026 Rafaela Cardoso. All rights reserved.
// Licensed under the PolyForm Noncommercial License, Version 1.0.0 (https://polyformproject.org/licenses/noncommercial/1.0.0/)
// Required Notice: Copyright © 2026 Rafaela Cardoso (https://github.com/rafaela-cardoso/pokescan)

// Foto automática: olha a moldura algumas vezes por segundo (em miniatura, cinza) e dispara quando a imagem
// fica PARADA por um instante e é DIFERENTE da última foto tirada (carta nova). O botão continua funcionando.
//
// Parte pura (testável): `novoDetector()` recebe miniaturas (Uint8Array de cinza, mesmo tamanho) e diz quando
// disparar. Imagens que não deram carta (mesa vazia) entram em `ignorar()`, para não disparar de novo nelas.

// miniatura pequena da moldura (proporção de carta): a redução já borra o tremor da mão e o ruído da câmera
export const LARGURA = 24, ALTURA = 34;

// Diferença média (0-255) entre duas miniaturas.
export function diferenca(a, b) {
  if (!a || !b || a.length !== b.length) return 255;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

// Contraste (desvio padrão): moldura com algo além de um fundo liso.
export function contraste(a) {
  let m = 0;
  for (const v of a) m += v;
  m /= a.length;
  let s = 0;
  for (const v of a) s += (v - m) ** 2;
  return Math.sqrt(s / a.length);
}

// parado: diferença média (0-255) entre quadros seguidos que ainda conta como parado (mão segurando o celular
// treme); mudou: diferença mínima para ser outra carta; contrasteMinimo: abaixo disso é fundo liso
export function novoDetector({ parado = 9, mudou = 16, quadrosParado = 3, contrasteMinimo = 14 } = {}) {
  let anterior = null, estavel = 0, ultimoMovimento = 0;
  let ultimaFoto = null;
  const ignoradas = [];
  return {
    // Mais um quadro. Devolve true quando é hora de tirar a foto.
    quadro(q) {
      const mov = diferenca(q, anterior);
      ultimoMovimento = mov;
      anterior = q;
      estavel = mov < parado ? estavel + 1 : 0;
      if (estavel < quadrosParado) return false;
      if (contraste(q) < contrasteMinimo) { ultimaFoto = null; return false; } // moldura vazia: a mesma carta pode voltar
      if (ultimaFoto && diferenca(q, ultimaFoto) < mudou) return false; // ainda a mesma carta
      if (ignoradas.some((x) => diferenca(q, x) < mudou)) return false; // mesa vazia já vista
      ultimaFoto = q;
      estavel = 0;
      return true;
    },
    // A última foto não tinha carta (mesa vazia, mão): não dispara de novo para a mesma cena.
    ignorar() {
      if (ultimaFoto) ignoradas.unshift(ultimaFoto);
      ignoradas.length = Math.min(ignoradas.length, 4);
    },
    // Foto tirada pelo botão: conta como a última, para a automática não repetir a mesma carta.
    fotoManual(q) { if (q) ultimaFoto = q; estavel = 0; },
    get parado() { return estavel; },
    get movimento() { return ultimoMovimento; },
  };
}
