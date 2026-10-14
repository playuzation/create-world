// 월드 생성 파이프라인: 필드 → 바이옴 → 지면 → 잡티 정리 → 식생 → 지형지물
import { hashString } from '../noise/rng.js';
import { classifyBiome } from './biomes.js';
import { computeFields, readSample } from './climate.js';
import { createCover } from './cover.js';
import { placeFeatures } from './features.js';
import { createGround, smoothGround } from './surface.js';

export const MAP_SIZE = 512;

export function normalizeSeed(input) {
  const text = String(input).trim();
  return /^\d+$/.test(text) ? Number(text) >>> 0 : hashString(text);
}

export function generateWorld(seedInput, size = MAP_SIZE) {
  const seed = normalizeSeed(seedInput);
  const fields = computeFields(seed, size);
  const n = size * size;
  const biomes = new Uint8Array(n);
  const ground = new Uint8Array(n);
  const s = {};

  const groundAt = createGround(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      readSample(fields, x, y, s);
      s.biome = classifyBiome(s);
      biomes[s.i] = s.biome;
      ground[s.i] = groundAt(s);
    }
  }
  smoothGround(ground, size, 2);

  const blocks = Uint8Array.from(ground);
  const coverAt = createCover(seed);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      readSample(fields, x, y, s);
      s.biome = biomes[s.i];
      const c = coverAt(s, ground[s.i]);
      if (c >= 0) blocks[s.i] = c;
    }
  }
  placeFeatures(seed, fields, biomes, ground, blocks, size);

  return { seed, size, blocks, biomes };
}
