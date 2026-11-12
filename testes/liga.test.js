import test from 'node:test';
import assert from 'node:assert/strict';
import { separarNomeLiga, converter, linkLiga, semelhancaNumero, pontuar, consultas, urlBusca, variacoesNumero } from '../src/liga.js';

// Respostas reais da API de busca da Liga (query "026/128").
const ITENS = [
  { __key: 'marketplace:cards:tcg2:6|781|026', sNomeIdiomaPrincipal: 'Buizel (026/128)', sNomeIdiomaSecundario: 'Buizel (026/128)', sPathImage: '//repositorio.sbrauble.com/a.jpg' },
  { __key: 'marketplace:cards:tcg2:15|804|026', sNomeIdiomaPrincipal: 'Pikachu (026/128)', sNomeIdiomaSecundario: 'Pikachu (026/128)', sPathImage: '//repositorio.sbrauble.com/b.jpg' },
  { __key: 'marketplace:cards:tcg2:336|534|026', sNomeIdiomaPrincipal: 'Rattata (026/128)', sNomeIdiomaSecundario: 'Rattata (026/128)' },
  { __key: 'marketplace:cards:tcg2:9|1|009', sNomeIdiomaPrincipal: 'Juiz (009/026)', sNomeIdiomaSecundario: 'Judge (009/026)' },
];
const cartas = ITENS.map(converter);

test('separarNomeLiga e entidades HTML', () => {
  assert.deepEqual(separarNomeLiga('Pikachu (026/128)'), { nome: 'Pikachu', numero: '026', total: '128' });
  assert.deepEqual(separarNomeLiga('Pok&eacute; Pad (126/128)'), { nome: 'Poké Pad', numero: '126', total: '128' });
  assert.deepEqual(separarNomeLiga('Sem número'), { nome: 'Sem número', numero: '', total: '' });
});

test('converter: nome PT, nome EN, imagem com https e link da Liga', () => {
  assert.equal(cartas[1].nome, 'Pikachu');
  assert.equal(cartas[1].imagem, 'https://repositorio.sbrauble.com/b.jpg');
  assert.equal(cartas[3].nome, 'Juiz');
  assert.equal(cartas[3].nomeEN, 'Judge');
  assert.equal(linkLiga(cartas[1].nomeLiga),
    'https://www.ligapokemon.com.br/?view=cards%2Fcard&tipo=1&card=Pikachu%20(026%2F128)');
});

test('semelhancaNumero tolera dígitos trocados pelo OCR', () => {
  assert.equal(semelhancaNumero('TG05', 'TG5'), 1);
  assert.equal(semelhancaNumero('026', '26'), 1);
  assert.ok(semelhancaNumero('128', '125') > 0.7, '8 lido como 5');
  assert.ok(semelhancaNumero('128', '147') < 0.5);
  assert.equal(semelhancaNumero('128', '1280'), 0);
});

test('leitura real ruim (nome ilegível, total 125): Pikachu 026/128 fica entre os primeiros', () => {
  const lido = { nome: 'Er', numero: '026', total: '125' };
  const notas = cartas.map((c) => [c.nome, pontuar(c, lido)]).sort((a, b) => b[1] - a[1]);
  assert.ok(notas.slice(0, 3).some(([n]) => n === 'Pikachu'));
  assert.ok(notas[0][1] > notas.at(-1)[1]);
});

test('com o nome bem lido, o Pikachu vence com folga', () => {
  const lido = { nome: 'Pikachu', numero: '026', total: '125' };
  const notas = cartas.map((c) => [c.nome, pontuar(c, lido)]).sort((a, b) => b[1] - a[1]);
  assert.equal(notas[0][0], 'Pikachu');
  assert.ok(notas[0][1] - notas[1][1] > 0.2);
});

test('nome em inglês também casa (Judge -> Juiz)', () => {
  const nota = pontuar(cartas[3], { nome: 'Judge', numero: '009', total: '026' });
  assert.ok(nota > 0.95);
});

test('variacoesNumero (como o gerarVariacoesNumero do liga_price_sheets)', () => {
  assert.deepEqual(variacoesNumero('26/128'), ['26/128', '026/128']);
  assert.deepEqual(variacoesNumero('025/025'), ['025/025', '025/25', '25/025', '25/25']);
  assert.deepEqual(variacoesNumero('TG5/TG30'), ['TG5/TG30', 'TG5/TG030', 'TG005/TG30', 'TG005/TG030']);
  assert.deepEqual(variacoesNumero('SVP045'), ['SVP045']);
});

test('consultas geradas: nome+número primeiro, depois só número e buscas mais soltas', () => {
  assert.deepEqual(consultas({ nome: 'Pikachu', numero: '026', total: '125' }),
    ['Pikachu (26/125)', 'Pikachu (026/125)', 'Pikachu (026', '26/125', '026/125', '026/12', '026/', 'pikachu',
      'Pikachu (826', 'Pikachu (025', 'Pikachu (028', '/125']);
  // nome ilegível: não entra na busca
  assert.deepEqual(consultas({ nome: 'Er sSNEi', qualidadeNome: 0.1, numero: '026', total: '128' }),
    ['26/128', '026/128', '026/12', '026/', '826/128', '025/128', '028/128', '/128']);
  assert.deepEqual(consultas({ nome: 'Er', numero: '', total: '' }), []);
  assert.equal(new URL(urlBusca('026/128')).searchParams.get('query'), '026/128');
});

test('sem nome legível: busca também números com um dígito trocado (032 lido no lugar de 092)', () => {
  const q = consultas({ nome: '飄飄雛', qualidadeNome: 0.1, numero: '032', total: '207' });
  assert.ok(q.includes('092/207'), q.join(' | '));
  assert.ok(!q.some((c) => c.includes('飄')));
  assert.ok(semelhancaNumero('092', '032') > 0.7);
});

test('apóstrofo curvo lido pelo OCR vira apóstrofo normal na busca', () => {
  assert.ok(consultas({ nome: 'Boss’s Orders' }).includes("boss's orders"));
});

test('número embaralhado na foto ("1541320"): nome + começo do número acham a impressão certa', async () => {
  const { apareceNosTrechos, numerosProvaveis } = await import('../src/liga.js');
  const lido = { nome: 'Boss’s Orders', numero: '154', total: '320', trechosNumero: ['1541320', '22'] };
  const q = consultas(lido);
  assert.ok(q.includes("Boss's Orders (154"), q.join(' | '));
  assert.ok(apareceNosTrechos('154', lido.trechosNumero));
  assert.ok(!apareceNosTrechos('189', lido.trechosNumero));
  assert.deepEqual(numerosProvaveis(['1541320']), ['154', '541', '413', '132']);
  // várias impressões do mesmo nome: a 154/192 ganha das outras
  const imp = ['154/192', '189/192', '200/192', '006/020'].map((n) => converter({
    __key: n, sNomeIdiomaPrincipal: `Ordem da Chefia (${n})`, sNomeIdiomaSecundario: `Boss's Orders (${n})`,
  }));
  const notas = imp.map((c) => [c.numero, pontuar(c, lido)]).sort((a, b) => b[1] - a[1]);
  assert.equal(notas[0][0], '154');
  assert.ok(notas[0][1] - notas[1][1] > 0.2, JSON.stringify(notas));
});

test('sem número nenhum, mas com trechos de dígitos: o número ainda decide', async () => {
  const lido = { nome: 'Boss’s Orders', numero: '', total: '', trechosNumero: ['3154', '92'] };
  const a = pontuar(converter({ __key: 'a', sNomeIdiomaPrincipal: "Boss's Orders (154/192)" }), lido);
  const b = pontuar(converter({ __key: 'b', sNomeIdiomaPrincipal: "Boss's Orders (189/192)" }), lido);
  assert.ok(a > b + 0.2);
});

test('trechos respeitam a ordem: número no começo, total depois (132/154 não ganha de 154/192)', async () => {
  const { apareceNosTrechos, totalNosTrechos } = await import('../src/liga.js');
  const tr = ['1541320'];
  assert.ok(apareceNosTrechos('154', tr));
  assert.ok(!apareceNosTrechos('132', tr), '132 está no meio do trecho');
  assert.ok(totalNosTrechos('026', '128', ['0261128']));
  assert.ok(!totalNosTrechos('154', '132', ['3154']));
  const lido = { nome: 'Boss’s Orders', numero: '154', total: '320', trechosNumero: tr };
  const certa = pontuar(converter({ __key: 'a', sNomeIdiomaPrincipal: 'Ordem da Chefia (154/192)', sNomeIdiomaSecundario: "Boss's Orders (154/192)" }), lido);
  const errada = pontuar(converter({ __key: 'b', sNomeIdiomaPrincipal: 'Ordem da Chefia (132/154)', sNomeIdiomaSecundario: "Boss's Orders (132/154)" }), lido);
  assert.ok(certa > errada + 0.2, `${certa} x ${errada}`);
});

test('nome legível: só as cartas com esse nome ficam na grade (as 4 Ordens da Chefia)', async () => {
  const { filtrarPorNome } = await import('../src/liga.js');
  const item = (pt, en, n) => converter({ __key: n, sNomeIdiomaPrincipal: `${pt} (${n})`, sNomeIdiomaSecundario: `${en} (${n})` });
  const lista = [
    item('Ordem da Chefia', "Boss's Orders", '154/192'), item('Ordem da Chefia', "Boss's Orders", '132/163'),
    item('Choi', 'Choy', '154/128'), item('Ordem da Chefia', "Boss's Orders", '132/154'),
    item('Ordem da Chefia', "Boss's Orders", '132/172'), item('Juiz', 'Judge', '154/175'), item('Leon', 'Leon', '154/185'),
  ];
  const f = filtrarPorNome(lista, 'Boss’s Orders', 1);
  assert.deepEqual(f.map((c) => c.numero + '/' + c.total), ['154/192', '132/163', '132/154', '132/172']);
  // nome ilegível ou que não bate com nada: mantém tudo
  assert.equal(filtrarPorNome(lista, 'sSNÉi', 0.1).length, lista.length);
  assert.equal(filtrarPorNome(lista, 'Xyzzy', 1).length, lista.length);
});

test('Pikachu 030/128 em português: saem a edição japonesa (030/103) e a chinesa (030C/103)', async () => {
  const { filtrarPorIdioma, filtrarPorTotal, idiomaDaEdicao } = await import('../src/liga.js');
  const item = (n) => converter({ __key: n, sNomeIdiomaPrincipal: `Pikachu (${n})`, sNomeIdiomaSecundario: `Pikachu (${n})` });
  const lista = ['030/128', '030/103', '030C/103'].map(item);
  assert.equal(idiomaDaEdicao(lista[2]), 'ZH');
  assert.equal(idiomaDaEdicao(item('026K/069')), 'KO');
  assert.equal(idiomaDaEdicao(lista[0]), null);
  // idioma: português tira a chinesa
  assert.deepEqual(filtrarPorIdioma(lista, 'PT').map((c) => c.numero), ['030', '030']);
  // total lido (128) identifica a coleção: sai a japonesa também
  assert.deepEqual(filtrarPorTotal(lista, { numero: '030', total: '128' }).map((c) => `${c.numero}/${c.total}`), ['030/128']);
  // carta chinesa escaneada: existe a edição marcada como chinesa, então só ela fica
  assert.deepEqual(filtrarPorIdioma(lista, 'CH').map((c) => c.numero), ['030C']);
  // total mal lido (126, não existe): nada é tirado
  assert.equal(filtrarPorTotal(lista, { numero: '030', total: '126' }).length, 3);
});

test('nome legível e número com dígito trocado (030 lido como 050): busca também "Pikachu (030"', () => {
  assert.ok(consultas({ nome: 'Pikachu', numero: '050', total: '126' }).includes('Pikachu (030'));
});

test('sufixo JP da Liga ("008JP/032") é edição japonesa', async () => {
  const { idiomaDaEdicao, filtrarPorIdioma } = await import('../src/liga.js');
  const c = converter({ __key: 'x', sNomeIdiomaPrincipal: 'Pikachu (008JP/032)' });
  assert.equal(idiomaDaEdicao(c), 'JP');
  const outra = converter({ __key: 'y', sNomeIdiomaPrincipal: 'Pikachu (030/128)' });
  assert.deepEqual(filtrarPorIdioma([c, outra], 'PT').map((x) => x.numero), ['030']);
});
