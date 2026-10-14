// 여러 칸을 차지하는 지형지물(나무 수관, 거대 버섯, 바위, 역고드름)을 찍는다.
// 후보점은 지터 격자(블루 노이즈 근사)로 뽑고, 밀도는 군락 노이즈로 조절해
// 숲 속 빈터·작은 숲·숲 가장자리가 자연스럽게 생기게 한다.
import { smoothstep } from '../noise/curves.js';
import { deriveSeed, hash2, mulberry32 } from '../noise/rng.js';
import { B } from './blocks.js';
import { BIOME, BIOMES } from './biomes.js';
import { readSample } from './climate.js';
import { isWaterBlock } from './surface.js';

// 수관 형태: r=[최소,최대] 반경, lobes=덩어리 수, jag=가장자리 요철, z=키(겹칠 때 위에 그려지는 순서)
const SPECIES = {
  oak: { block: B.OAK_LEAVES, r: [1.7, 2.8], lobes: 1, jag: 0.22, z: 0.5 },
  birch: { block: B.BIRCH_LEAVES, r: [1.4, 2.1], lobes: 1, jag: 0.15, z: 0.55 },
  spruce: { block: B.SPRUCE_LEAVES, r: [1.2, 2.2], lobes: 1, jag: 0.3, z: 0.6 },
  mega_spruce: { block: B.SPRUCE_LEAVES, r: [2.4, 3.5], lobes: 1, jag: 0.3, z: 0.85 },
  dark_oak: { block: B.DARK_OAK_LEAVES, r: [2.4, 3.6], lobes: 2, jag: 0.25, z: 0.6 },
  jungle: { block: B.JUNGLE_LEAVES, r: [2.0, 3.0], lobes: 1, jag: 0.25, z: 0.6 },
  mega_jungle: { block: B.JUNGLE_LEAVES, r: [3.4, 5.2], lobes: 3, jag: 0.3, z: 1 },
  jungle_bush: { block: B.OAK_LEAVES, r: [0.9, 1.6], lobes: 1, jag: 0.2, z: 0.2 },
  acacia: { block: B.ACACIA_LEAVES, r: [1.6, 2.4], lobes: 2, jag: 0.2, z: 0.5, spread: 2.4 },
  swamp_oak: { block: B.OAK_LEAVES, r: [2.3, 3.2], lobes: 1, jag: 0.3, z: 0.5, wet: true, vines: true },
  mangrove: { block: B.MANGROVE_LEAVES, r: [1.9, 2.9], lobes: 2, jag: 0.25, z: 0.5, wet: true, roots: true },
  cherry: { block: B.CHERRY_LEAVES, r: [2.3, 3.3], lobes: 2, jag: 0.2, z: 0.55 },
  palm: { block: B.JUNGLE_LEAVES, r: [2.0, 3.0], z: 0.5, fronds: true },
  red_mushroom: { block: B.RED_MUSHROOM_BLOCK, r: [1.8, 2.6], lobes: 1, jag: 0.05, z: 0.45 },
  brown_mushroom: { block: B.BROWN_MUSHROOM_BLOCK, r: [2.6, 3.4], lobes: 1, jag: 0.08, z: 0.4 },
  boulder: { block: B.MOSSY_COBBLESTONE, r: [0.9, 1.8], lobes: 2, jag: 0.3, z: 0.1, rock: true },
  ice_spike: { block: B.PACKED_ICE, r: [0.7, 1.9], lobes: 1, jag: 0.35, z: 0.3, rock: true },
};

const PLANTABLE = new Set([
  B.GRASS_BLOCK,
  B.PODZOL,
  B.COARSE_DIRT,
  B.MOSS_BLOCK,
  B.SNOW,
  B.POWDER_SNOW,
  B.MUD,
]);

// 바이옴별 나무 밀도와 수종. 반환: [밀도, 수종 선택 함수]
function forestry(biome, s) {
  switch (biome) {
    case BIOME.PLAINS:
    case BIOME.SUNFLOWER_PLAINS:
      return [0.004 + 0.45 * smoothstep(0.9, 0.98, s.patch), (r) => (r < 0.85 ? 'oak' : 'birch')];
    case BIOME.MEADOW:
      return [0.006 + 0.3 * smoothstep(0.93, 0.99, s.patch), (r) => (r < 0.6 ? 'birch' : 'oak')];
    case BIOME.FOREST: {
      const birchy = 0.15 + 0.6 * smoothstep(0.55, 0.8, s.region);
      return [0.62 * smoothstep(0.06, 0.3, s.patch), (r) => (r < birchy ? 'birch' : 'oak')];
    }
    case BIOME.FLOWER_FOREST:
      return [0.32 * smoothstep(0.15, 0.4, s.patch), (r) => (r < 0.3 ? 'birch' : 'oak')];
    case BIOME.BIRCH_FOREST:
      return [0.6 * smoothstep(0.05, 0.25, s.patch), (r) => (r < 0.92 ? 'birch' : 'oak')];
    case BIOME.DARK_FOREST:
      return [0.9, (r) => (r < 0.03 ? 'red_mushroom' : r < 0.06 ? 'brown_mushroom' : r < 0.9 ? 'dark_oak' : 'oak')];
    case BIOME.CHERRY_GROVE:
      return [0.38 * smoothstep(0.1, 0.35, s.patch), () => 'cherry'];
    case BIOME.TAIGA:
      return [0.25 + 0.4 * smoothstep(0.2, 0.7, s.region), (r) => (r < 0.06 ? 'mega_spruce' : 'spruce')];
    case BIOME.OLD_GROWTH_TAIGA:
      return [0.72, (r) => (r < 0.45 ? 'mega_spruce' : 'spruce')];
    case BIOME.SNOWY_TAIGA:
      return [0.45 * smoothstep(0.05, 0.3, s.patch), () => 'spruce'];
    case BIOME.SNOWY_PLAINS:
      return [0.015, () => 'spruce'];
    case BIOME.WINDSWEPT_HILLS:
      return [0.08 * smoothstep(0.3, 0.7, s.patch), (r) => (r < 0.6 ? 'spruce' : 'oak')];
    case BIOME.SNOWY_SLOPES:
      return [0.012, () => 'spruce'];
    case BIOME.SAVANNA:
      return [0.03 + 0.07 * smoothstep(0.4, 0.6, s.h), (r) => (r < 0.82 ? 'acacia' : 'oak')];
    case BIOME.DESERT:
      return [0.5, () => 'palm']; // 오아시스 풀밭에서만 자란다
    case BIOME.WOODED_BADLANDS:
      return [0.35, () => 'oak'];
    case BIOME.JUNGLE:
      return [0.95, (r) => (r < 0.2 ? 'mega_jungle' : r < 0.65 ? 'jungle' : 'jungle_bush')];
    case BIOME.SPARSE_JUNGLE:
      return [0.22 + 0.2 * smoothstep(0.6, 0.75, s.h), (r) => (r < 0.6 ? 'jungle' : 'jungle_bush')];
    case BIOME.BAMBOO_JUNGLE:
      return [0.3, (r) => (r < 0.3 ? 'jungle' : 'jungle_bush')];
    case BIOME.SWAMP:
      return [0.2, () => 'swamp_oak'];
    case BIOME.MANGROVE_SWAMP:
      return [0.5, () => 'mangrove'];
    default:
      return [0, null];
  }
}

function rockFor(biome) {
  switch (biome) {
    case BIOME.TAIGA:
      return [0.18, 'boulder'];
    case BIOME.OLD_GROWTH_TAIGA:
      return [0.4, 'boulder'];
    case BIOME.WINDSWEPT_HILLS:
      return [0.3, 'boulder'];
    default:
      return [0, null];
  }
}

export function placeFeatures(seed, fields, biomes, ground, blocks, size) {
  const zbuf = new Float32Array(size * size).fill(-1);
  const s = {};

  function canCover(i, sp) {
    const kind = BIOMES[biomes[i]].kind;
    if (kind === 'ocean') return false;
    const g = ground[i];
    if (isWaterBlock(g) || g === B.ICE || g === B.PACKED_ICE) return !!sp.wet && g !== B.ICE;
    return true;
  }

  function put(x, y, block, z, sp) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = y * size + x;
    if (z <= zbuf[i] || !canCover(i, sp)) return;
    zbuf[i] = z;
    blocks[i] = block;
  }

  // 각도에 따라 반경이 흔들리는 덩어리(수관/바위) 하나를 찍는다
  function blob(cx, cy, radius, sp, z, rng) {
    const ph1 = rng() * 6.283;
    const ph2 = rng() * 6.283;
    const R = Math.ceil(radius * (1 + sp.jag) + 1);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        const a = Math.atan2(dy, dx);
        const rr = radius * (1 + sp.jag * (0.6 * Math.sin(3 * a + ph1) + 0.4 * Math.sin(5 * a + ph2)));
        const px = Math.round(cx + dx);
        const py = Math.round(cy + dy);
        if (d <= rr) put(px, py, sp.block, z, sp);
        else if (sp.vines && d <= rr + 1.2 && rng() < 0.45) put(px, py, B.VINE, z - 0.05, sp);
        else if (sp.roots && d <= rr + 2 && rng() < 0.3) put(px, py, B.MANGROVE_ROOTS, z - 0.3, sp);
      }
    }
  }

  function stamp(px, py, sp, rng) {
    const z = sp.z + 0.3 * rng();
    const radius = sp.r[0] + (sp.r[1] - sp.r[0]) * rng();
    if (sp.fronds) {
      // 야자: 중심에서 뻗는 잎줄기
      const count = 5 + Math.floor(rng() * 3);
      const a0 = rng() * 6.283;
      put(px, py, sp.block, z, sp);
      for (let k = 0; k < count; k++) {
        const a = a0 + (k / count) * 6.283 + (rng() - 0.5) * 0.4;
        for (let t = 1; t <= radius; t += 0.5) {
          put(Math.round(px + Math.cos(a) * t), Math.round(py + Math.sin(a) * t + 0.15 * t * t), sp.block, z, sp);
        }
      }
      return;
    }
    const lobes = sp.lobes > 1 ? 1 + Math.floor(rng() * sp.lobes) : 1;
    const spread = sp.spread ?? radius * 0.6;
    const a0 = rng() * 6.283;
    for (let k = 0; k < lobes; k++) {
      const off = k === 0 ? 0 : spread * (0.6 + 0.4 * rng());
      const a = a0 + k * 2.4;
      const r = k === 0 ? radius : radius * (0.6 + 0.3 * rng());
      blob(px + Math.cos(a) * off, py + Math.sin(a) * off, r, sp, z, rng);
    }
  }

  // 후보점 루프: cell 크기의 격자마다 점 하나
  function scatterPass(cell, salt, choose) {
    const passSeed = deriveSeed(seed, salt);
    const cells = Math.ceil(size / cell);
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const rng = mulberry32(hash2(cx, cy, passSeed));
        const px = Math.min(size - 1, cx * cell + Math.floor(rng() * cell));
        const py = Math.min(size - 1, cy * cell + Math.floor(rng() * cell));
        // 바이옴을 약간 흔든 위치에서 읽어 숲 가장자리가 서로 스며들게 한다
        const bx = Math.max(0, Math.min(size - 1, px + Math.round((rng() - 0.5) * 10)));
        const by = Math.max(0, Math.min(size - 1, py + Math.round((rng() - 0.5) * 10)));
        const biome = biomes[by * size + bx];
        readSample(fields, px, py, s);
        const pick = choose(biome, s, rng);
        if (!pick) continue;
        const sp = SPECIES[pick];
        const g = ground[py * size + px];
        if (sp.rock) {
          if (isWaterBlock(g) || BIOMES[biomes[py * size + px]].kind === 'ocean') continue;
        } else if (biome === BIOME.DESERT ? g !== B.GRASS_BLOCK : !(PLANTABLE.has(g) || (sp.wet && isWaterBlock(g)))) {
          continue;
        }
        stamp(px, py, sp, rng);
      }
    }
  }

  scatterPass(14, 401, (biome, _s, rng) => {
    const [density, kind] = rockFor(biome);
    return rng() < density ? kind : null;
  });
  scatterPass(7, 402, (biome, _s, rng) => (biome === BIOME.ICE_SPIKES && rng() < 0.4 ? 'ice_spike' : null));
  scatterPass(4, 403, (biome, smp, rng) => {
    const [density, pickSpecies] = forestry(biome, smp);
    return pickSpecies && rng() < density ? pickSpecies(rng()) : null;
  });
}
