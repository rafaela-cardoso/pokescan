import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarIdioma, classificarTexto } from '../src/idioma.js';

test('normalizarIdioma aceita siglas e nomes por extenso', () => {
  const casos = {
    EN: ['en', 'EN', 'Inglês', 'english'],
    PT: ['pt', 'PT-BR', 'português', 'Portugues'],
    JP: ['jp', 'ja', 'Japonês'],
    KO: ['kr', 'ko', 'Coreano'],
    CH: ['ch', 'zh-tw', 'Chinês tradicional', 'chinês'],
    CHS: ['chs', 'zh-cn', 'Chinês simplificado'],
  };
  for (const [codigo, valores] of Object.entries(casos)) {
    for (const v of valores) assert.equal(normalizarIdioma(v), codigo, `"${v}" deveria ser ${codigo}`);
  }
  assert.equal(normalizarIdioma(''), '');
  assert.equal(normalizarIdioma('alemão'), '');
});

test('classificarTexto reconhece cada escrita', () => {
  assert.equal(classificarTexto('ポケモンのたねをベンチにだす'), 'JP');
  assert.equal(classificarTexto('포켓몬 카드 게임 공격'), 'KO');
  assert.equal(classificarTexto('寶夢擊傷'), 'CH');
  assert.equal(classificarTexto('宝梦击伤'), 'CHS');
  assert.equal(classificarTexto('Weakness Resistance Retreat Ability: once during your turn you may draw a card'), 'EN');
  assert.equal(classificarTexto('Fraqueza Resistência Recuo Habilidade: quando você jogar esta carta do seu baralho'), 'PT');
});

test('classificarTexto devolve null quando não há certeza', () => {
  assert.equal(classificarTexto(''), null);
  assert.equal(classificarTexto('120 HP'), null);
});

test('texto chinês lido com alguns kana espúrios continua chinês', () => {
  const t = '抛掷1次硬币如果为正面则在下一个对手的回合这只宝可梦不受到招式的伤害和效果影响 のの ト ン';
  assert.notEqual(classificarTexto(t), 'JP');
  assert.equal(classificarTexto('ポケモンのたねをベンチにだす 山札'), 'JP');
});

test('português lido com erros pelo OCR (Pikachu 030/128 da Liga)', () => {
  const texto = 'veranda Na nda\nCS N 0025 Pokemon hto Altra. 0,4 m Pa 6.009\n(9) Raio Supersônico 30\nFraquesa ED x 2 | Resintinda 7 tev ox\n\nTem pequenas bolsas eletrngc as em\n'
    + 'Fraquess ED x2 | Resistinca 7 Recve\n\nTem pequenas bolsas eletrcas em\nMost. DOM suas bochechas. Quando esta em\n';
  assert.equal(classificarTexto(texto), 'PT');
});

test('inglês lido com erros pelo OCR', () => {
  assert.equal(classificarTexto('Weaknes x2 Resistanse Retreat\nDuring your turn, you may draw a card from your deck.'), 'EN');
});

test('copyright em inglês não transforma carta em português em inglesa', () => {
  assert.equal(classificarTexto('Fraqueza x2 Resistência Recuo\nQuando você jogar esta carta\n©2026 Pokémon/Nintendo/Creatures/GAME FREAK. Illus. DOM'), 'PT');
});
