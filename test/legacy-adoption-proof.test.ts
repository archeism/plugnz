import { expect, test } from 'bun:test';
import { adoptionDigest, canonicalAdoptionJson } from '../src/legacy-adoption-proof';

test('adoption canonical bytes pin scalar key ordering, integer keys, and finite number spelling', () => {
  const input = { '😀': 'astral', '\ue000': 'bmp', a: -0, '2': 2, '10': 10 };
  expect(canonicalAdoptionJson(input)).toBe('{"10":10,"2":2,"a":0,"":"bmp","😀":"astral"}');
  expect(adoptionDigest('plugnz/test/v1', input)).toBe('sha256:d37666bcbac63575b1f0badadb06361b053afc7386ebb204161ce9f2c2e808db');
  expect(canonicalAdoptionJson({ b: [true, null, 1e21], a: 'é' })).toBe('{"a":"é","b":[true,null,1e+21]}');
});

test('adoption canonical bytes reject values JSON.stringify would silently drop or rewrite', () => {
  const sparse = new Array(1);
  const accessor = Object.defineProperty({}, 'a', { enumerable: true, get: () => 'not JSON' });
  const symbol = { [Symbol('hidden')]: 'not JSON' };
  for (const value of [undefined, NaN, Infinity, { a: undefined }, '\ud800', '\udc00',
    { '\ud800': 1 }, new Date(0), sparse, accessor, symbol]) {
    let rejected = false;
    try { canonicalAdoptionJson(value); } catch { rejected = true; }
    expect(rejected).toBe(true);
  }
});
