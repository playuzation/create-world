// 지면층: 바이옴별 지면 블록 규칙 + 바이옴 사이 점이지대(눈/암반/건조 가장자리) + 잡티 정리.
import { createCellular, createFbm, createWarp, curl } from '../noise/fractal.js';
import { clamp, smoothstep } from '../noise/curves.js';
import { deriveSeed, mulberry32, rand2 } from '../noise/rng.js';
import { B } from './blocks.js';
import {
  BIOME,
  BIOMES,
  DEEP,
  SEA,
  SHALLOW,
  T_COLD,
  T_FROZEN,
  alpineTemperature,
  riverHalfWidth,
} from './biomes.js';

const WATER = new Set([B.DEEP_WATER, B.WATER, B.SHALLOW_WATER, B.WARM_WATER, B.SWAMP_WATER]);
export function isWaterBlock(id) {
  return WATER.has(id);
}

// 악지 지층 띠: 무작위 색과 두께로 쌓는다
function makeBands(seed, count = 40) {
  const palette = [
    [B.TERRACOTTA, 0.3],
    [B.ORANGE_TERRACOTTA, 0.24],
    [B.RED_TERRACOTTA, 0.12],
    [B.YELLOW_TERRACOTTA, 0.1],
    [B.BROWN_TERRACOTTA, 0.08],
    [B.WHITE_TERRACOTTA, 0.09],
    [B.LIGHT_GRAY_TERRACOTTA, 0.07],
  ];
  const rng = mulberry32(seed);
  const bands = [];
  while (bands.length < count) {
    let r = rng();
    let id = palette[0][0];
    for (const [block, p] of palette) {
      if (r < p) {
        id = block;
        break;
      }
      r -= p;
    }
    const thickness = 1 + Math.floor(rng() * 2.5);
    for (let k = 0; k < thickness; k++) bands.push(id);
  }
  return bands;
}

const CORALS = [B.TUBE_CORAL, B.BRAIN_CORAL, B.FIRE_CORAL, B.HORN_CORAL];
const STRATA = [B.STONE, B.STONE, B.ANDESITE, B.STONE, B.STONE, B.GRANITE, B.STONE, B.ANDESITE, B.ANDESITE, B.STONE];

export function createGround(seed) {
  const sd = (salt) => deriveSeed(seed, salt);
  const duneN = createFbm(sd(201), { frequency: 1 / 40, octaves: 2 });
  const windPotential = createFbm(sd(202), { frequency: 1 / 220, octaves: 2 });
  const bandN = createFbm(sd(203), { frequency: 1 / 95, octaves: 3 });
  const bandWarp = createWarp(sd(204), { frequency: 1 / 50, octaves: 2, amplitude: 10 });
  const floeC = createCellular(sd(205), { frequency: 1 / 11 });
  const floeWarp = createWarp(sd(212), { frequency: 1 / 18, octaves: 2, amplitude: 5 });
  const reefN = createFbm(sd(206), { frequency: 1 / 26, octaves: 3 });
  const strataN = createFbm(sd(207), { frequency: 1 / 36, octaves: 2 });
  const strataWarp = createWarp(sd(208), { frequency: 1 / 45, octaves: 2, amplitude: 12 });
  const bands = makeBands(sd(209));
  const windAngle = rand2(1, 2, sd(210)) * Math.PI * 2;
  const floeSeed = sd(211);
  const tmp = [0, 0, 0];
  const flow = [0, 0];

  // 깊이에 따른 물 블록
  function water(s) {
    if (s.c < DEEP) return B.DEEP_WATER;
    if (s.c < SHALLOW) return B.WATER;
    return B.SHALLOW_WATER;
  }

  function ocean(s) {
    const shallow = s.c >= SHALLOW;
    switch (s.biome) {
      case BIOME.FROZEN_OCEAN: {
        if (s.c > SEA - 0.012 + 0.008 * s.fine) return B.ICE; // 해안에 붙은 정착빙
        floeWarp(s.x, s.y, tmp);
        floeC(tmp[0], tmp[1], tmp);
        const r = rand2(tmp[2] & 0xffff, tmp[2] >>> 16, floeSeed);
        const cover = 0.15 + 0.8 * smoothstep(T_FROZEN, 0.04, s.t) - (s.c < DEEP ? 0.3 : 0);
        if (r < cover && tmp[1] - tmp[0] > 0.06 + 0.1 * s.grain) {
          if (s.c < SHALLOW && r < cover * 0.3) return tmp[0] < 0.18 ? B.BLUE_ICE : B.PACKED_ICE;
          return B.ICE;
        }
        return water(s);
      }
      case BIOME.COLD_OCEAN:
        if (!shallow && s.c > DEEP && s.patch > 0.7 && s.grain > 0.3) return B.KELP;
        if (shallow && s.patch > 0.75) return s.fine > 0.5 ? B.GRAVEL : B.SEAGRASS;
        return water(s);
      case BIOME.OCEAN:
        if (shallow && s.patch > 0.6 && s.grain > 0.3) return B.SEAGRASS;
        if (!shallow && s.c > DEEP && s.patch > 0.86 && s.grain > 0.35) return B.KELP;
        return water(s);
      case BIOME.LUKEWARM_OCEAN:
        if (shallow && s.patch > 0.45 && s.grain > 0.25) return B.SEAGRASS;
        return water(s);
      case BIOME.WARM_OCEAN: {
        if (s.c > SEA - 0.008 && s.fine > 0.8) return B.SAND; // 모래톱
        if (s.c > SHALLOW - 0.05) {
          const reef = reefN(s.x, s.y);
          if (reef > 0.2 && s.grain > 0.25) {
            return CORALS[Math.floor(s.region * 9 + s.patch * 2) % CORALS.length];
          }
          return shallow ? B.WARM_WATER : B.WATER;
        }
        return water(s);
      }
      default:
        return water(s);
    }
  }

  function river(s) {
    const hw = riverHalfWidth(s);
    if (s.biome === BIOME.FROZEN_RIVER) return B.ICE;
    if (s.t < 0.22 && s.fine > 0.35 + 2.5 * (s.t - 0.16)) return B.ICE; // 반쯤 언 강
    if (s.h > 0.78 && s.t > T_COLD && s.c < SEA + 0.12) return B.SWAMP_WATER;
    return s.riverDist < hw * 0.45 && hw > 1.6 ? B.WATER : B.SHALLOW_WATER;
  }

  function shore(s) {
    if (s.biome === BIOME.STONY_SHORE) {
      if (s.patch > 0.6) return B.GRAVEL;
      return s.fine > 0.8 ? B.ANDESITE : B.STONE;
    }
    if (s.biome === BIOME.SNOWY_BEACH) {
      if (s.fine > 0.85) return B.GRAVEL;
      return s.patch > 0.62 ? B.SAND : B.SNOW;
    }
    const cold = smoothstep(0.45, 0.22, s.t);
    if (s.fine > 0.88 || s.patch < 0.35 * cold) return B.GRAVEL;
    return B.SAND;
  }

  // 호수 비율: 습하고 추울수록(빙하호) 많고, 건조하거나 산악이면 적다
  function lakeFraction(s) {
    const wet = smoothstep(0.45, 0.9, s.h);
    const glacial = smoothstep(T_COLD + 0.06, T_FROZEN, s.t);
    const arid = smoothstep(0.4, 0.15, s.h) * smoothstep(0.55, 0.8, s.t);
    return clamp(0.012 + 0.04 * wet + 0.055 * glacial - 0.03 * arid - 0.05 * s.mount, 0.004, 0.12);
  }

  // 강둑/호숫가 블록. -1 이면 둑 없이 원래 지면 유지.
  function bank(s, isLake) {
    switch (s.biome) {
      case BIOME.DESERT:
        return isLake ? B.GRASS_BLOCK : B.SAND; // 오아시스
      case BIOME.SAVANNA:
        return B.SAND;
      case BIOME.BADLANDS:
      case BIOME.WOODED_BADLANDS:
        return B.RED_SAND;
      case BIOME.SWAMP:
      case BIOME.MANGROVE_SWAMP:
        return s.fine > 0.7 ? B.CLAY : B.MUD;
      case BIOME.SNOWY_PLAINS:
      case BIOME.SNOWY_TAIGA:
      case BIOME.ICE_SPIKES:
      case BIOME.SNOWY_SLOPES:
        return s.fine > 0.6 ? B.GRAVEL : -1;
      case BIOME.TAIGA:
      case BIOME.OLD_GROWTH_TAIGA:
      case BIOME.WINDSWEPT_HILLS:
      case BIOME.STONY_PEAKS:
      case BIOME.JAGGED_PEAKS:
        return s.fine < 0.55 ? B.GRAVEL : -1;
      case BIOME.JUNGLE:
      case BIOME.SPARSE_JUNGLE:
      case BIOME.BAMBOO_JUNGLE:
        return s.fine > 0.55 ? B.SAND : s.fine < 0.15 ? B.MUD : -1;
      default:
        if (s.fine < 0.42) return B.SAND;
        if (s.fine < 0.56) return B.CLAY;
        if (s.fine < 0.66) return B.GRAVEL;
        return -1;
    }
  }

  // 바람 벡터장(우세풍 + 컬 노이즈 난류, 발산 0)을 따라 휘는 물결(사구·눈더미). 반환 [-1, 1]
  function windRipple(s, wavelength) {
    curl(windPotential, s.x, s.y, flow, 2);
    const a = Math.atan2(Math.sin(windAngle) + 70 * flow[1], Math.cos(windAngle) + 70 * flow[0]);
    const phase = (s.x * Math.cos(a) + s.y * Math.sin(a)) / wavelength + 2.2 * duneN(s.x, s.y);
    return Math.sin(phase * Math.PI * 2);
  }

  function desert(s) {
    // 악지 쪽으로 갈수록 붉은 모래가 섞인다
    if (s.w > 0.5 && s.patch < (s.w - 0.5) * 4.5) return B.RED_SAND;
    // 암석 사막(하마다)
    const rocky = smoothstep(0.4, 0.22, s.region);
    if (s.patch > 1 - 0.6 * rocky) return s.fine > 0.72 ? B.GRAVEL : B.SANDSTONE;
    // 사구: 바람 방향 벡터장을 따라 휘어지는 물결 무늬
    const dunes = smoothstep(0.38, 0.65, s.region);
    if (dunes > 0 && windRipple(s, 15) > 1 - 0.45 * dunes && s.fine < 0.85) return B.SANDSTONE;
    return B.SAND;
  }

  function badlands(s) {
    bandWarp(s.x, s.y, tmp);
    const mesa = bandN(tmp[0], tmp[1]) + 0.25 * (s.region - 0.5);
    const wooded = s.biome === BIOME.WOODED_BADLANDS;
    if (mesa < -0.08) return s.fine > 0.85 ? B.COARSE_DIRT : B.RED_SAND; // 협곡 바닥
    const level = (mesa + 1) * 15;
    const layer = Math.floor(level);
    if (level - layer < 0.42) {
      // 계단식 대지의 윗면
      if (wooded) return s.fine > 0.45 ? B.GRASS_BLOCK : B.COARSE_DIRT;
      return s.fine > 0.86 ? B.COARSE_DIRT : B.RED_SAND;
    }
    return bands[layer % bands.length]; // 지층이 드러난 비탈
  }

  function mountain(s) {
    const at = alpineTemperature(s);
    // 북향 사면과 완만한 곳에 눈이 더 오래 남는다
    const snowLine = 0.22 + 0.07 * s.north - 0.05 * s.slope + 0.05 * (s.fine - 0.5) + 0.03 * (s.grain - 0.5);
    if (at < snowLine) {
      // 가파른 남향 사면과 능선 마루는 눈이 쌓이지 못해 암반이 드러난다
      const exposed = s.slope - 0.22 * s.north + 0.2 * (s.fine - 0.5);
      if (exposed > 0.62 || (s.peaks > 0.95 && s.elev > 0.6)) return rockAt(s, at);
      if (s.elev > 0.8 && s.slope < 0.35 && s.relief > 0.8) return B.PACKED_ICE; // 빙하
      return s.slope < 0.3 && s.patch > 0.6 ? B.POWDER_SNOW : B.SNOW;
    }
    // 수목한계선: 골짜기(낮은 고도)는 초원, 능선으로 갈수록 암석
    const treeline = (s.biome === BIOME.WINDSWEPT_HILLS ? 0.6 : 0.52) + 0.12 * (s.patch - 0.5);
    if (s.elev < treeline && s.slope < 0.8 && at > T_FROZEN) return B.GRASS_BLOCK;
    if (s.peaks > 0.93 && s.elev > 0.6) return B.ANDESITE; // 능선 마루
    if (s.elev < treeline + 0.05 && s.fine > 0.5) return B.GRAVEL; // 비탈 아래 너덜지대
    return rockAt(s, at);
  }

  // 수평 지층이 고도 등고선을 따라 띠로 드러나 능선 형태가 읽히게 한다
  function rockAt(s, at) {
    strataWarp(s.x, s.y, tmp);
    const layer = Math.floor(s.elev * 16 + 1.2 * strataN(tmp[0], tmp[1]) + 8);
    const rock = STRATA[layer % STRATA.length];
    return rock === B.GRANITE && at < 0.42 ? B.DIORITE : rock;
  }

  function landBase(s) {
    switch (s.biome) {
      case BIOME.PLAINS:
      case BIOME.SUNFLOWER_PLAINS:
      case BIOME.MEADOW: {
        const arid = smoothstep(0.32, 0.16, s.h) * smoothstep(0.55, 0.85, s.t);
        if (s.patch > 1 - 0.45 * arid) return s.fine > 0.6 ? B.SAND : B.COARSE_DIRT;
        return B.GRASS_BLOCK;
      }
      case BIOME.FOREST:
      case BIOME.FLOWER_FOREST:
      case BIOME.BIRCH_FOREST:
      case BIOME.CHERRY_GROVE:
        if (s.patch > 0.94) return B.COARSE_DIRT;
        if (s.fine > 0.9 && s.h > 0.45) return B.MOSS_BLOCK;
        return B.GRASS_BLOCK;
      case BIOME.DARK_FOREST:
        if (s.patch > 0.72) return B.MOSS_BLOCK;
        if (s.patch < 0.12 && s.fine > 0.5) return B.PODZOL;
        return B.GRASS_BLOCK;
      case BIOME.TAIGA:
      case BIOME.OLD_GROWTH_TAIGA: {
        const podzol = s.biome === BIOME.OLD_GROWTH_TAIGA ? 0.35 : 0.7;
        if (s.patch > podzol) return s.fine > 0.94 ? B.MOSS_BLOCK : B.PODZOL;
        if (s.patch < 0.06) return B.COARSE_DIRT;
        return B.GRASS_BLOCK;
      }
      case BIOME.SNOWY_TAIGA:
        if (s.patch > 0.94) return B.PODZOL;
        if (s.fine > 0.84 && s.patch > 0.5) return B.POWDER_SNOW;
        return B.SNOW;
      case BIOME.SNOWY_PLAINS:
        if (s.relief > 0.93) return s.fine > 0.5 ? B.STONE : B.GRAVEL; // 바람에 드러난 언덕
        if (s.region > 0.45 && windRipple(s, 11) > 0.55 + 0.4 * (1 - s.patch)) return B.POWDER_SNOW; // 눈더미
        if (s.fine > 0.9) return B.POWDER_SNOW;
        return B.SNOW;
      case BIOME.ICE_SPIKES:
        if (s.patch > 0.62) return s.fine > 0.7 ? B.ICE : B.PACKED_ICE;
        return B.SNOW;
      case BIOME.SAVANNA: {
        const arid = smoothstep(0.3, 0.12, s.h) * smoothstep(0.76, 0.9, s.t);
        if (s.fine > 1 - 0.6 * arid) return B.SAND;
        if (s.patch > 0.8 && s.fine > 0.45) return B.COARSE_DIRT;
        return B.GRASS_BLOCK;
      }
      case BIOME.DESERT:
        return desert(s);
      case BIOME.BADLANDS:
      case BIOME.WOODED_BADLANDS:
        return badlands(s);
      case BIOME.JUNGLE:
      case BIOME.SPARSE_JUNGLE:
      case BIOME.BAMBOO_JUNGLE:
        if (s.patch > 0.8) return B.PODZOL;
        if (s.fine < 0.07) return B.MOSS_BLOCK;
        if (s.fine > 0.93 && s.h > 0.8) return B.MUD;
        return B.GRASS_BLOCK;
      case BIOME.SWAMP: {
        const pool = s.patch * 0.55 + s.fine * 0.45;
        if (pool > 0.6) return B.SWAMP_WATER;
        if (s.patch < 0.16) return B.MUD;
        if (s.fine > 0.9) return B.CLAY;
        return B.GRASS_BLOCK;
      }
      case BIOME.MANGROVE_SWAMP: {
        const pool = s.patch * 0.55 + s.fine * 0.45;
        if (pool > 0.54) return B.SWAMP_WATER;
        if (s.fine > 0.92) return B.CLAY;
        return s.patch < 0.22 ? B.GRASS_BLOCK : B.MUD;
      }
      default:
        return mountain(s);
    }
  }

  // 인접 바이옴으로 이어지는 연속 기후 기반 점이 효과
  function ecotone(s, block) {
    const kind = BIOMES[s.biome].kind;
    if (kind === 'land') {
      const rock = smoothstep(0.08, 0.4, s.mount);
      if (rock > 0 && s.relief > 1 - 0.3 * rock) return s.fine > 0.7 ? B.ANDESITE : B.STONE;
    }
    if (block !== B.SNOW && block !== B.POWDER_SNOW && s.t < T_FROZEN + 0.07 && kind !== 'mountain') {
      const snowy = smoothstep(T_FROZEN + 0.07, T_FROZEN, s.t);
      if (s.patch * 0.6 + s.fine * 0.4 < snowy * 0.7) return B.SNOW;
    }
    return block;
  }

  return function groundAt(s) {
    const kind = BIOMES[s.biome].kind;
    if (kind === 'ocean') return ocean(s);
    if (kind === 'river') return river(s);
    if (kind === 'shore') return shore(s);

    const lf = lakeFraction(s);
    if (s.lake < lf) {
      if (s.t < 0.17 || alpineTemperature(s) < 0.17) return s.lake < lf * 0.35 ? B.PACKED_ICE : B.ICE;
      if (s.biome === BIOME.SWAMP || s.biome === BIOME.MANGROVE_SWAMP) return B.SWAMP_WATER;
      return s.lake < lf * 0.4 ? B.WATER : B.SHALLOW_WATER;
    }
    const shoreWidth = s.biome === BIOME.DESERT ? 0.02 : 0.009;
    if (s.lake < lf + shoreWidth) {
      const b = bank(s, true);
      if (b >= 0) return b;
    }
    if (s.riverDist < riverHalfWidth(s) + 1.2 + 1.6 * s.grain) {
      const b = bank(s, false);
      if (b >= 0) return b;
    }
    return ecotone(s, landBase(s));
  };
}

// 다수결 필터: 같은 블록 이웃이 1개 이하인 외톨이 픽셀을 주변 다수 블록으로 바꾼다
export function smoothGround(ground, size, passes = 2) {
  let src = ground;
  let dst = new Uint8Array(ground.length);
  const counts = new Uint16Array(256);
  const nb = new Int32Array(8);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const v = src[i];
        let k = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= size) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            if ((dx === 0 && dy === 0) || xx < 0 || xx >= size) continue;
            nb[k++] = src[yy * size + xx];
          }
        }
        let same = 0;
        for (let j = 0; j < k; j++) if (nb[j] === v) same++;
        if (same >= 2) {
          dst[i] = v;
          continue;
        }
        let best = v;
        let bestN = 0;
        for (let j = 0; j < k; j++) {
          const c = ++counts[nb[j]];
          if (c > bestN) {
            bestN = c;
            best = nb[j];
          }
        }
        for (let j = 0; j < k; j++) counts[nb[j]] = 0;
        dst[i] = best;
      }
    }
    const t = src;
    src = dst;
    dst = t;
  }
  if (src !== ground) ground.set(src);
  return ground;
}
