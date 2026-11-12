import test from 'node:test';
import assert from 'node:assert/strict';
import { novoDetector, LARGURA, ALTURA } from '../src/automatico.js';

const N = LARGURA * ALTURA;
// "cenas" sintéticas: mesa lisa e duas cartas diferentes (com contraste)
const mesa = () => new Uint8Array(N).fill(90);
const carta = (semente) => Uint8Array.from({ length: N }, (_, i) => ((i * semente) % 7) * 35);
const mexendo = (k) => Uint8Array.from({ length: N }, (_, i) => (i + k * 13) % 255);

test('dispara quando a carta fica parada, uma vez só por carta', () => {
  const d = novoDetector();
  const a = carta(3);
  const disparos = [a, a, a, a, a, a].map((q) => d.quadro(q));
  assert.deepEqual(disparos, [false, false, false, true, false, false]);
});

test('não dispara com a moldura mexendo nem na mesa lisa', () => {
  const d = novoDetector();
  assert.ok(![0, 1, 2, 3, 4, 5].some((k) => d.quadro(mexendo(k))));
  const m = mesa();
  assert.ok(![m, m, m, m, m].some((q) => d.quadro(q)));
});

test('troca de carta: nova foto; mesa vazia ignorada não dispara de novo', () => {
  const d = novoDetector({ contrasteMinimo: 0 });
  const a = carta(3), b = carta(5), m = mesa();
  [a, a, a, a].forEach((q) => d.quadro(q));
  // tirou a carta: a mesa parada dispara uma vez; a leitura não acha carta e manda ignorar
  assert.equal([m, m, m, m].some((q) => d.quadro(q)), true);
  d.ignorar();
  assert.equal([mexendo(1), m, m, m, m].some((q) => d.quadro(q)), false, 'mesa vazia já vista');
  assert.equal([mexendo(2), b, b, b, b].some((q) => d.quadro(q)), true, 'carta nova');
});

test('foto pelo botão conta como a última: a automática não repete a mesma carta', () => {
  const d = novoDetector();
  const a = carta(3);
  d.fotoManual(a);
  assert.equal([a, a, a, a, a].some((q) => d.quadro(q)), false);
});
