import test from 'node:test';
import assert from 'node:assert/strict';
import { edicaoDe, grupoIdioma, filtrarPorIdiomaDaEdicao } from '../src/edicoes.js';
import { converter } from '../src/liga.js';

const item = (key, n, img) => converter({ __key: key, sNomeIdiomaPrincipal: `Pikachu (${n})`, sPathImage: img });
const lista = [
  item('marketplace:cards:tcg2:15|804|030', '030/128', '//repositorio.sbrauble.com/arquivos/in/pokemon_bkp/cd/804/a.jpg'),
  item('marketplace:cards:tcg2:15|822|030', '030/103', '//repositorio.sbrauble.com/arquivos/in/pokemon_bkp/cd/822/b.jpg'),
  item('marketplace:cards:tcg2:15|829|030C', '030C/103', '//repositorio.sbrauble.com/arquivos/in/pokemon_bkp/cd/829/c.jpg'),
];

test('código da edição pela chave da Liga ou pela imagem', () => {
  assert.deepEqual(lista.map(edicaoDe), ['804', '822', '829']);
  assert.equal(edicaoDe({ id: 'x', imagem: 'https://repositorio.sbrauble.com/arquivos/in/pokemon_bkp/cd/781/z.jpg' }), '781');
});

test('grupos de idioma: a edição internacional serve EN, PT e os outros idiomas ocidentais', () => {
  assert.equal(grupoIdioma('PT'), 'INT');
  assert.equal(grupoIdioma('EN'), 'INT');
  assert.equal(grupoIdioma('CHS'), 'ZH');
  assert.equal(grupoIdioma('KR'), 'KO');
  assert.equal(grupoIdioma(''), '');
});

// Idiomas lidos pelo OCR nas imagens da Liga (resultados reais: 804 -> EN, 822 -> JP, 829 -> JP)
const lidos = { 804: 'EN', 822: 'JP', 829: 'JP' };
const conhecido = (c) => lidos[edicaoDe(c)] || '';

test('Pikachu 030/128 escaneado em português: ficam só as edições latinas', () => {
  assert.deepEqual(filtrarPorIdiomaDaEdicao(lista, 'PT', conhecido).map((c) => c.numero), ['030']);
  assert.equal(filtrarPorIdiomaDaEdicao(lista, 'PT', conhecido)[0].total, '128');
});

test('carta japonesa escaneada: saem as latinas, ficam as asiáticas', () => {
  assert.deepEqual(filtrarPorIdiomaDaEdicao(lista, 'JP', conhecido).map((c) => c.numero), ['030', '030C']);
});

test('sem idioma lido (nem da carta nem das edições): nada sai', () => {
  assert.equal(filtrarPorIdiomaDaEdicao(lista, '', conhecido).length, 3);
  assert.equal(filtrarPorIdiomaDaEdicao(lista, 'PT', () => '').length, 3);
});
