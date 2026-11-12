import test from 'node:test';
import assert from 'node:assert/strict';
import {
  idDaPlanilha, intervalo, letraColuna, mapearColunas, encontrarCabecalho, proximaLinha, montarEscritas,
  linhaDaMesmaCarta, quantidadeExistente, CABECALHO_PADRAO, celulaLink,
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
  assert.equal(letraColuna(25), 'Z');
  assert.equal(letraColuna(26), 'AA');
});

const registro = {
  quantidade: 1, carta: 'Pikachu (026/128)', estado: 'NM', extra: '', idioma: 'PT', liga: 'https://liga/x', quando: '12/11/2026 10:00',
};

test('o app só preenche Quantidade, Carta, Estado, Extra, Idioma e Link liga', () => {
  assert.deepEqual(CABECALHO_PADRAO, ['Quantidade', 'Carta', 'Estado', 'Preço (Liga)', 'Extra', 'Idioma', 'Erros',
    'Preço (compra)', 'Link liga', '10% off', 'opçoes', 'lance inicial', 'fechamento', 'pagamento']);
  const cab = encontrarCabecalho([CABECALHO_PADRAO]);
  assert.deepEqual(cab.mapa, { quantidade: 0, carta: 1, estado: 2, extra: 4, idioma: 5, liga: 8 });
  const e = montarEscritas('Leilão', 1, cab.mapa, { ...registro, extra: 'Master Ball', quantidade: 2 });
  assert.deepEqual(e.map((x) => [x.range, x.values[0][0]]), [
    ["'Leilão'!A2", 2], ["'Leilão'!B2", 'Pikachu (026/128)'], ["'Leilão'!C2", 'NM'],
    ["'Leilão'!E2", 'Master Ball'], ["'Leilão'!F2", 'PT'],
  ]);
});

test('Link liga vai como texto "Abrir na Liga" com o link', () => {
  const r = celulaLink(552223964, 1, 8, 'https://liga/x').updateCells;
  assert.deepEqual(r.start, { sheetId: 552223964, rowIndex: 1, columnIndex: 8 });
  const cel = r.rows[0].values[0];
  assert.equal(cel.userEnteredValue.stringValue, 'Abrir na Liga');
  assert.equal(cel.textFormatRuns[0].format.link.uri, 'https://liga/x');
});

test('colunas como Número, Nome (com Carta), Data e Preço nunca são preenchidas', () => {
  const mapa = mapearColunas(['Carta', 'Nome', 'Número', 'Data', 'Preço (Liga)', 'Estado']);
  assert.deepEqual(mapa, { carta: 0, estado: 5 });
});

test('"Nome" vale como Carta quando não existe a coluna Carta', () => {
  assert.deepEqual(mapearColunas(['Nome', 'Qualidade', 'Língua', 'Qtd.', 'Link da Liga']),
    { quantidade: 3, carta: 0, estado: 1, idioma: 2, liga: 4 });
});

test('planilha do liga_price_sheets: cabeçalho abaixo de um título, grava logo após a última linha', () => {
  const linhas = [
    ['Minha coleção'], [], ['', 'Total:', '', 'R$ 12,00'],
    ['', 'Carta', 'Qualidade', 'Preço (Liga)', 'Extra', 'Idioma', 'Link Liga', 'Erros'],
    ['', 'Mew (025/025)', 'NM', '10,00', '', 'PT', 'https://liga/mew', ''],
    ['', '', '', '=SOMA(D5)', '', '', '', 'só observação'],
  ];
  const cab = encontrarCabecalho(linhas);
  assert.equal(cab.indice, 3);
  assert.equal(proximaLinha(linhas, cab.indice, cab.mapa), 5);
});

test('linhas vazias no meio: grava abaixo da ÚLTIMA preenchida, nunca num buraco', () => {
  const linhas = [['Carta', 'Estado'], ['A', 'NM'], [], ['B', 'NM'], ['', '']];
  const cab = encontrarCabecalho(linhas);
  assert.equal(proximaLinha(linhas, cab.indice, cab.mapa), 4);
});

test('sem cabeçalho reconhecível', () => {
  assert.equal(encontrarCabecalho([['x', 'y'], ['1', '2']]), null);
  assert.equal(encontrarCabecalho([]), null);
});

// ---------- soma da quantidade ----------
const planilha = [
  ['Quantidade', 'Carta', 'Estado', 'Preço (Liga)', 'Extra', 'Idioma'],
  ['2', 'Pikachu (026/128)', 'NM', '', '', 'PT'],
  ['1', 'Pikachu (026/128)', 'NM', '', 'Reverse Foil', 'PT'],
  ['', 'Pikachu (026/128)', 'SP', '', '', 'PT'],
  ['3', 'Pikachu (026/128)', 'NM', '', '', 'EN'],
  ['1', 'Mew (151/165)', 'NM', '', 'Normal', 'KO'],
];
const cabP = encontrarCabecalho(planilha);
const achar = (r) => linhaDaMesmaCarta(planilha, cabP.indice, cabP.mapa, { ...registro, ...r });

test('mesma carta = mesma Carta, Estado, Extra e Idioma', () => {
  assert.equal(achar({}), 1);
  assert.equal(achar({ extra: 'Reverse Foil' }), 2);
  assert.equal(achar({ estado: 'SP' }), 3);
  assert.equal(achar({ idioma: 'EN' }), 4);
  assert.equal(achar({ estado: 'MP' }), -1, 'outro estado: linha nova');
  assert.equal(achar({ idioma: 'JP' }), -1, 'outro idioma: linha nova');
  assert.equal(achar({ carta: 'Pikachu (027/128)' }), -1);
});

test('comparação tolera maiúsculas/espaços, "Normal" = extra vazio e KR = KO', () => {
  assert.equal(achar({ carta: 'pikachu (026/128) ', estado: 'nm' }), 1);
  assert.equal(achar({ carta: 'Mew (151/165)', extra: '', idioma: 'KR' }), 5);
});

test('sem coluna Quantidade não há onde somar: vai para linha nova', () => {
  const semQtd = [['Carta', 'Estado'], ['Pikachu (026/128)', 'NM']];
  const c = encontrarCabecalho(semQtd);
  assert.equal(linhaDaMesmaCarta(semQtd, c.indice, c.mapa, registro), -1);
});

test('quantidade que já estava: número soma; vazio conta 1; texto não é tocado', () => {
  assert.equal(quantidadeExistente('2'), 2);
  assert.equal(quantidadeExistente(' 10 '), 10);
  assert.equal(quantidadeExistente(''), 1);
  assert.equal(quantidadeExistente('dois'), null);
});

// ---------- adicionarCarta com a API do Sheets simulada ----------
async function comSheetsFalso(linhas, registroLido) {
  const { adicionarCarta } = await import('../src/planilha.js');
  const enviados = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, op = {}) => {
    if (op.method === 'POST') enviados.push(JSON.parse(op.body));
    const corpo = op.method ? {}
      : String(url).includes('fields=') ? { properties: { title: 'Cartas' }, sheets: [{ properties: { title: 'Leilão', sheetId: 77 } }] }
        : { values: linhas };
    return { ok: true, status: 200, json: async () => corpo };
  };
  try {
    const r = await adicionarCarta('token', 'id', 'Leilão', registroLido);
    return { r, enviados };
  } finally {
    globalThis.fetch = original;
  }
}

test('carta que já está na planilha: soma a quantidade na mesma linha e não escreve mais nada', async () => {
  const { r, enviados } = await comSheetsFalso(planilha, { ...registro, quantidade: 3 });
  assert.deepEqual(r, { linha: 2, somada: true, quantidade: 5 });
  assert.deepEqual(enviados, [{ valueInputOption: 'RAW', data: [{ range: "'Leilão'!A2", values: [[5]] }] }]);
});

test('carta nova: vai para a linha de baixo, só nas 6 colunas', async () => {
  const { r, enviados } = await comSheetsFalso(planilha, { ...registro, carta: 'Eevee (133/165)', quantidade: 2 });
  assert.deepEqual(r, { linha: 7, somada: false, quantidade: 2 });
  assert.deepEqual(enviados[0].data.map((d) => [d.range, d.values[0][0]]), [
    ["'Leilão'!A7", 2], ["'Leilão'!B7", 'Eevee (133/165)'], ["'Leilão'!C7", 'NM'], ["'Leilão'!F7", 'PT'],
  ]);
});

test('quantidade vazia na planilha conta como 1 ao somar', async () => {
  const { r } = await comSheetsFalso(planilha, { ...registro, estado: 'SP', quantidade: 1 });
  assert.deepEqual(r, { linha: 4, somada: true, quantidade: 2 });
});

test('gid da aba no link da planilha', async () => {
  const { gidDaPlanilha } = await import('../src/planilha.js');
  assert.equal(gidDaPlanilha(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=552223964#gid=552223964`), '552223964');
  assert.equal(gidDaPlanilha(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`), '0');
  assert.equal(gidDaPlanilha(`https://docs.google.com/spreadsheets/d/${ID}/edit`), '');
});

test('carta nova com coluna Link liga: grava o hyperlink "Abrir na Liga" na mesma linha', async () => {
  const { r, enviados } = await comSheetsFalso([CABECALHO_PADRAO], { ...registro, carta: 'Eevee (133/165)' });
  assert.equal(r.linha, 2);
  assert.ok(!enviados[0].data.some((d) => d.range.includes('!I')), 'o link não vai como texto puro');
  assert.deepEqual(enviados[1], { requests: [celulaLink(77, 1, 8, 'https://liga/x')] });
});
