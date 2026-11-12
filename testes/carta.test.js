import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairNumero, extrairNome, numeroCatalogo, semelhanca, formatarCarta, qualidadeNome } from '../src/carta.js';

test('extrairNumero: número normal no rodapé', () => {
  assert.deepEqual(extrairNumero('Illus. 5ban Graphics  025/165 ★ G'), { numero: '025', total: '165' });
  assert.deepEqual(extrairNumero('SV1 EN 185/165'), { numero: '185', total: '165' });
  assert.deepEqual(extrairNumero('105 / 189'), { numero: '105', total: '189' });
});

test('extrairNumero: corrige O e I lidos no lugar de dígitos', () => {
  assert.deepEqual(extrairNumero('O25/I65'), { numero: '025', total: '165' });
  assert.deepEqual(extrairNumero('lllus. ABC 0l2/O98'), { numero: '012', total: '098' });
  assert.deepEqual(extrairNumero('SVI 0261128'), { numero: '026', total: '128' });
  // leitura real (carta chinesa): símbolo de raridade colado virou "6"
  assert.deepEqual(extrairNumero('20009\n\nO 092/2076\n\nG9NSPM'), { numero: '092', total: '207' });
});

test('extrairNumero: subcoleções e promos', () => {
  assert.deepEqual(extrairNumero('TG05/TG30'), { numero: 'TG05', total: 'TG30' });
  assert.deepEqual(extrairNumero('GG 12 / GG70'), { numero: 'GG12', total: 'GG70' });
  assert.deepEqual(extrairNumero('SWSH 123'), { numero: 'SWSH123', total: '' });
  assert.deepEqual(extrairNumero('SVP 45'), { numero: 'SVP045', total: '' });
});

test('extrairNumero: nada reconhecível', () => {
  assert.equal(extrairNumero(''), null);
  assert.equal(extrairNumero('Illus. Ken Sugimori'), null);
});

test('numeroCatalogo tira zeros à esquerda só de números', () => {
  assert.equal(numeroCatalogo('025'), '25');
  assert.equal(numeroCatalogo('100'), '100');
  assert.equal(numeroCatalogo('TG05'), 'TG05');
});

test('extrairNome remove HP, estágio e sobras', () => {
  assert.equal(extrairNome('BASIC Pikachu HP 60'), 'Pikachu');
  assert.equal(extrairNome('STAGE 2\nCharizard ex 330 HP'), 'Charizard ex');
  assert.equal(extrairNome('Básico\nPikachu PS 70'), 'Pikachu');
  assert.equal(extrairNome('« Darkrai VSTAR 280 ©'), 'Darkrai VSTAR');
  assert.equal(extrairNome('Mewtwo vmax'), 'Mewtwo VMAX');
  assert.equal(extrairNome(''), '');
});

test('extrairNome descarta lixo misturado com dígitos (leitura real ruim)', () => {
  const nome = extrairNome('Er sSNÉi. 0 Õ55HH5 7 M2 i22000008');
  assert.ok(!/\d/.test(nome), nome);
  assert.ok(qualidadeNome(nome) < 0.7, `${nome} deveria ter nota baixa`);
  assert.equal(extrairNome('© Pikachu 70 ©'), 'Pikachu');
  assert.equal(extrairNome('pés? Pikachu'), 'Pikachu');
  assert.equal(extrairNome('Pikachu ex'), 'Pikachu ex');
});

test('extrairNome junta a inicial separada e mantém "da" (Scarlet & Violet)', () => {
  // leituras reais da Gabite da Cíntia (110/217)
  assert.equal(extrairNome('G abite da Cíntia'), 'Gabite da Cíntia');
  assert.equal(qualidadeNome('Gabite da Cíntia'), 1);
  assert.ok(qualidadeNome('TARA') < 0.85, 'palavra toda em maiúsculas é suspeita');
  assert.equal(qualidadeNome('Mewtwo VMAX'), 1);
});

test('extrairNome tira sobras depois do nome (leituras reais da Slowbro)', () => {
  assert.equal(extrairNome('Slowbro ya'), 'Slowbro');
  assert.equal(extrairNome('Sowbro BOS'), 'Sowbro');
  assert.equal(extrairNome('ESTAGIO | Slowbro\nEvoluide Slowpoke comp'), 'Slowbro', '"Evolui de" lido sem espaço não é nome');
  assert.equal(extrairNome('Pikachu VMAX'), 'Pikachu VMAX');
  assert.equal(extrairNome('Charizard ex'), 'Charizard ex');
});

test('qualidadeNome', () => {
  assert.equal(qualidadeNome('Pikachu'), 1);
  assert.equal(qualidadeNome('Charizard ex'), 1);
  assert.ok(qualidadeNome('sSNÉi') < 0.6);
  assert.equal(qualidadeNome(''), 0);
});

test('semelhanca', () => {
  assert.equal(semelhanca('Pikachu', 'pikachu'), 1);
  assert.ok(semelhanca('Pikachu', 'Plkachu') > 0.8);
  assert.ok(semelhanca('Charizard ex', 'Charizard') > 0.8);
  assert.ok(semelhanca('Pikachu', 'Bulbasaur') < 0.3);
  assert.equal(semelhanca('', 'x'), 0);
});

test('formatarCarta segue o formato do bot', () => {
  assert.equal(formatarCarta({ nome: 'Darkrai', numero: '105', total: '189' }), 'Darkrai (105/189)');
  assert.equal(formatarCarta({ nome: 'Pikachu', numero: 'SWSH020', total: '' }), 'Pikachu (SWSH020)');
  assert.equal(formatarCarta({ nome: 'Mew' }), 'Mew');
  assert.equal(formatarCarta({ nome: '', numero: '1', total: '2' }), '1/2');
});
