// 월드 데이터 → RGBA 픽셀. DOM에 의존하지 않아 캔버스/파일 출력 모두에 쓸 수 있다.
import { BIOMES } from '../world/biomes.js';
import { BLOCKS } from '../world/blocks.js';

function toLut(entries) {
  const lut = new Uint8Array(256 * 3);
  for (const { id, color } of entries) {
    const v = parseInt(color.slice(1), 16);
    lut[id * 3] = (v >> 16) & 255;
    lut[id * 3 + 1] = (v >> 8) & 255;
    lut[id * 3 + 2] = v & 255;
  }
  return lut;
}

const LUTS = { blocks: toLut(BLOCKS), biomes: toLut(BIOMES) };

// mode: 'blocks' | 'biomes'. rgba 길이는 size*size*4.
export function paint(world, mode, rgba) {
  const src = mode === 'biomes' ? world.biomes : world.blocks;
  const lut = LUTS[mode];
  for (let i = 0, o = 0; i < src.length; i++, o += 4) {
    const k = src[i] * 3;
    rgba[o] = lut[k];
    rgba[o + 1] = lut[k + 1];
    rgba[o + 2] = lut[k + 2];
    rgba[o + 3] = 255;
  }
  return rgba;
}

// id별 개수
export function histogram(ids) {
  const counts = new Uint32Array(256);
  for (let i = 0; i < ids.length; i++) counts[ids[i]]++;
  return counts;
}
