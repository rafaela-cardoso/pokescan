import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idDaPlanilha, intervalo, letraColuna, mapearColunas, encontrarCabecalho, proximaLinha, montarEscritas, CABECALHO_PADRAO,
} from '../src/planilha.js';

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc';

test('idDaPlanilha aceita link ou ID', () => {
  assert.equal(idDaPlanilha(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`), ID);
  assert.equal(idDaPlanilha(ID), ID);
  assert.equal(idDaPlanilha('https://google.com'), '');
  assert.equal(idDaPlanilha(''), '');
});

test('intervalo e letraColuna', () => {
  assert.equal(intervalo('Cartas'), "'Cartas'");
  assert.equal(intervalo("Leilão d'Ouro", 'A1'), "'Leilão d''Ouro'!A1");
  assert.equal(letraColuna(0), 'A');
  assert.equal(letraColuna(7), 'H');
  assert.equal(letraColuna(25), 'Z');
  assert.equal(letraColuna(26), 'AA');
});

const registro = {
  carta: 'Pikachu (026/128)', nome: 'Pikachu', numero: '026/128', estado: 'NM', extra: '', idioma: 'PT',
  quantidade: '1', data: '11/11/2026 10:00', liga: 'https://liga/x',
};

test('planilha do bot: cabeçalho na linha 1, carta como "Nome (nº/total)"', () => {
  const linhas = [
    ['carta', 'estado', 'preço (liga)', 'opções', 'IDIOMA', 'foto'],
    ['Darkrai (105/189)', 'NM', 'R$ 30', '', 'EN', ''],
    ['Mew (151/165)', 'SP', '', '', 'PT', ''],
  ];
  const cab = encontrarCabecalho(linhas);
  assert.equal(cab.indice, 0);
  assert.deepEqual(cab.mapa, { carta: 0, estado: 1, idioma: 4 });
  const i = proximaLinha(linhas, cab.indice, cab.mapa);
  assert.equal(i, 3);
  assert.deepEqual(montarEscritas('Leilão', i, cab.mapa, registro), [
    { range: "'Leilão'!A4", values: [['Pikachu (026/128)']] },
    { range: "'Leilão'!B4", values: [['NM']] },
    { range: "'Leilão'!E4", values: [['PT']] },
  ]);
});

test('planilha do liga_price_sheets: cabeçalho abaixo de um título, Carta "Nome (nº)", Extra e Link Liga', () => {
  const linhas = [
    ['Minha coleção'],
    [],
    ['', 'Total:', '', 'R$ 12,00'],
    ['', 'Carta', 'Qualidade', 'Preço (Liga)', 'Extra', 'Idioma', 'Link Liga', 'Erros'],
    ['', 'Mew (025/025)', 'NM', '10,00', '', 'PT', 'https://liga/mew', ''],
    ['', '', '', '=SOMA(D5)', '', '', '', 'só observação'], // colunas do app vazias
  ];
  const cab = encontrarCabecalho(linhas);
  assert.equal(cab.indice, 3);
  assert.deepEqual(cab.mapa, { carta: 1, estado: 2, extra: 4, idioma: 5, liga: 6 });
  const i = proximaLinha(linhas, cab.indice, cab.mapa);
  assert.equal(i, 5, 'vai para a linha 6, logo abaixo do Mew, sem tocar no preço nem nos erros');
  assert.deepEqual(montarEscritas('Cartas', i, cab.mapa, { ...registro, extra: 'Reverse Foil' }).map((e) => [e.range, e.values[0][0]]), [
    ["'Cartas'!B6", 'Pikachu (026/128)'],
    ["'Cartas'!C6", 'NM'],
    ["'Cartas'!E6", 'Reverse Foil'],
    ["'Cartas'!F6", 'PT'],
    ["'Cartas'!G6", 'https://liga/x'],
  ]);
});

test('coluna "Nome" no lugar de "Carta" recebe "Nome (nº/total)"', () => {
  const linhas = [['Nome', 'Estado', 'Extra', 'Idioma']];
  const cab = encontrarCabecalho(linhas);
  const e = montarEscritas('A', 1, cab.mapa, registro);
  assert.equal(e[0].range, "'A'!A2");
  assert.equal(e[0].values[0][0], 'Pikachu (026/128)');
  assert.equal(e.length, 3, 'Extra vazio (Normal) não é escrito');
});

test('cabeçalho padrão = planilha de leilão; o app só preenche as colunas dele', () => {
  assert.deepEqual(CABECALHO_PADRAO, ['Quantidade', 'Carta', 'Estado', 'Preço (Liga)', 'Extra', 'Idioma', 'Erros',
    'Preço (compra)', 'Link liga', '10% off', 'opçoes', 'lance inicial', 'fechamento', 'pagamento']);
  const cab = encontrarCabecalho([CABECALHO_PADRAO]);
  assert.deepEqual(cab.mapa, { quantidade: 0, carta: 1, estado: 2, extra: 4, idioma: 5, liga: 8 });
  const e = montarEscritas('Leilão', 1, cab.mapa, { ...registro, extra: 'Master Ball' }).map((x) => [x.range, x.values[0][0]]);
  assert.deepEqual(e, [
    ["'Leilão'!A2", '1'], ["'Leilão'!B2", 'Pikachu (026/128)'], ["'Leilão'!C2", 'NM'],
    ["'Leilão'!E2", 'Master Ball'], ["'Leilão'!F2", 'PT'], ["'Leilão'!I2", 'https://liga/x'],
  ]);
});

test('linhas vazias no meio: grava abaixo da ÚLTIMA preenchida, nunca num buraco', () => {
  const linhas = [['Carta', 'Estado'], ['A', 'NM'], [], ['B', 'NM'], ['', '']];
  const cab = encontrarCabecalho(linhas);
  assert.equal(proximaLinha(linhas, cab.indice, cab.mapa), 4);
});

test('sem cabeçalho reconhecível', () => {
  assert.equal(encontrarCabecalho([['x', 'y'], ['1', '2']]), null);
  assert.equal(encontrarCabecalho([]), null);
  assert.ok(encontrarCabecalho([CABECALHO_PADRAO]));
});

test('mapearColunas aceita variações de título', () => {
  assert.deepEqual(mapearColunas(['Nº', 'Condição', 'Língua', 'Qtd.', 'Link da Liga']),
    { numero: 0, estado: 1, idioma: 2, quantidade: 3, liga: 4 });
});
