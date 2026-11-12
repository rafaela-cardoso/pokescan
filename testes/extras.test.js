import test from 'node:test';
import assert from 'node:assert/strict';
import { medirEmblema, classificarEmblema, EMBLEMA } from '../src/extras.js';

// Carta sintética (luminância) com fundo, linhas de texto escuras e, opcionalmente, o emblema.
function carta({ emblema = null } = {}) {
  const w = 160, h = 224, l = new Float32Array(w * h);
  const { cx, cy, r } = EMBLEMA;
  const ry = r / (h / w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = x / w, fy = y / h;
      let v = 185;
      if (emblema) {
        const dx = (fx - cx) / r, dy = (fy - cy) / ry, d = Math.hypot(dx, dy);
        if (d <= 1) {
          v = 215; // emblema claro
          if (dy < -0.2) v = emblema === 'master' ? 172 : 240; // metade de cima: branca (Poké Ball) ou escura (M)
          if (Math.abs(dy) < 0.08) v = 150; // faixa horizontal
        }
      }
      if (fy > 0.62 && fy < 0.86 && (y % 9) < 2 && fx > 0.08 && fx < 0.9) v = 40; // linhas de texto
      l[y * w + x] = v;
    }
  }
  return { l, w, h };
}

test('sem emblema: nenhuma sugestão', () => {
  assert.equal(classificarEmblema(medirEmblema(carta())), null);
});

test('emblema Poké Ball', () => {
  const m = medirEmblema(carta({ emblema: 'poke' }));
  assert.ok(m.contraste > 20 && m.faixa < -20, JSON.stringify(m));
  assert.equal(classificarEmblema(m), 'Pokeball Foil');
});

test('emblema Master Ball (metade de cima escura)', () => {
  assert.equal(classificarEmblema(medirEmblema(carta({ emblema: 'master' }))), 'Master Ball');
});

test('limiares com as medidas reais das cartas de referência', () => {
  assert.equal(classificarEmblema({ contraste: 40, faixa: -32, cimaMenosBaixo: 36 }), 'Pokeball Foil');
  assert.equal(classificarEmblema({ contraste: 13, faixa: -20, cimaMenosBaixo: -9 }), 'Master Ball');
  for (const normal of [
    { contraste: -5, faixa: 6, cimaMenosBaixo: 21 }, { contraste: 0, faixa: 0, cimaMenosBaixo: 22 },
    { contraste: -2, faixa: 5, cimaMenosBaixo: 18 }, { contraste: 1, faixa: 4, cimaMenosBaixo: 9 },
  ]) assert.equal(classificarEmblema(normal), null);
});

test('Reverse Foil: limiares com as medidas reais (fotos do Boss\'s Orders e scans da Liga)', async () => {
  const { classificarReverse } = await import('../src/extras.js');
  assert.equal(classificarReverse({ variacao: 0.185, bordas: 0.080, saturacao: 0.084 }), 'Reverse Foil');
  // normal e holo da mesma carta
  assert.equal(classificarReverse({ variacao: 0.068, bordas: 0.024, saturacao: 0.03 }), null);
  assert.equal(classificarReverse({ variacao: 0.058, bordas: 0.029, saturacao: 0.16 }), null);
  // carta antiga com fundo roxo texturizado: textura alta, mas colorida
  assert.equal(classificarReverse({ variacao: 0.161, bordas: 0.12, saturacao: 0.22 }), null);
});

test('medirReverse: fundo liso x padrão metálico', async () => {
  const { medirReverse, classificarReverse } = await import('../src/extras.js');
  const img = (padrao) => {
    const width = 200, height = 280, data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let v = 200;
      if (padrao && y > 150 && y < 230) v = 160 + 50 * Math.sin(x / 3) * Math.sin(y / 3); // círculos cinza
      if (y > 157 && y < 225 && y % 12 < 2 && x > 25 && x < 170) v = 30; // texto
      const i = (y * width + x) * 4; data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255;
    }
    return { data, width, height };
  };
  assert.equal(classificarReverse(medirReverse(img(false))), null);
  assert.equal(classificarReverse(medirReverse(img(true))), 'Reverse Foil');
});
