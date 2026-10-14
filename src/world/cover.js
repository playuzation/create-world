// 지면 위 한 칸짜리 식생(풀, 꽃, 덤불, 선인장, 수련 등).
// 매끄러운 군락 마스크 안에서만 확률적으로 찍어 소금-후추 잡음을 피한다.
import { deriveSeed, hash2, rand2 } from '../noise/rng.js';
import { B } from './blocks.js';
import { BIOME, T_COLD } from './biomes.js';

const MEADOW_FLOWERS = [B.DANDELION, B.POPPY, B.CORNFLOWER, B.ALLIUM, B.OXEYE_DAISY];
const FOREST_FLOWERS = [B.POPPY, B.DANDELION];

// 호숫가에 수련이 뜨는 바이옴
const LILY_LAKE_BIOMES = new Set([
  BIOME.PLAINS,
  BIOME.SUNFLOWER_PLAINS,
  BIOME.MEADOW,
  BIOME.FOREST,
  BIOME.FLOWER_FOREST,
  BIOME.BIRCH_FOREST,
  BIOME.DARK_FOREST,
  BIOME.CHERRY_GROVE,
  BIOME.TAIGA,
  BIOME.OLD_GROWTH_TAIGA,
  BIOME.SAVANNA,
  BIOME.JUNGLE,
  BIOME.SPARSE_JUNGLE,
  BIOME.BAMBOO_JUNGLE,
]);

// 지터 격자의 점 하나에만 true: 서로 간격을 둔 산포(블루 노이즈 근사)
function scatter(x, y, spacing, density, seed) {
  const cx = Math.floor(x / spacing);
  const cy = Math.floor(y / spacing);
  const h = hash2(cx, cy, seed);
  if ((h & 0xffff) / 65536 >= density) return false;
  return x === cx * spacing + (((h >>> 16) & 0xff) % spacing) && y === cy * spacing + ((h >>> 24) % spacing);
}

export function createCover(seed) {
  const randSeed = deriveSeed(seed, 301);
  const bushSeed = deriveSeed(seed, 302);
  const cactusSeed = deriveSeed(seed, 303);
  const pumpkinSeed = deriveSeed(seed, 304);

  // 같은 종이 무리 지어 피도록 중규모 필드로 종을 고른다
  const clusterFlower = (s, list) => list[Math.floor(s.region * 9 + s.grain * 0.8) % list.length];

  return function coverAt(s, ground) {
    const r = rand2(s.x, s.y, randSeed);

    if (ground === B.SHALLOW_WATER && s.t > T_COLD && LILY_LAKE_BIOMES.has(s.biome)) {
      return r < 0.06 ? B.LILY_PAD : -1; // 호수 가장자리 수련
    }

    switch (s.biome) {
      case BIOME.PLAINS:
      case BIOME.SUNFLOWER_PLAINS:
      case BIOME.MEADOW: {
        if (ground !== B.GRASS_BLOCK) return -1;
        if (scatter(s.x, s.y, 37, 0.25, pumpkinSeed)) return B.PUMPKIN;
        const meadow = s.biome === BIOME.MEADOW;
        if (s.biome === BIOME.SUNFLOWER_PLAINS && s.patch > 0.55 && r < 0.35) {
          return s.grain > 0.15 ? B.SUNFLOWER : B.DANDELION;
        }
        const flowerPatch = meadow ? 0.5 : s.t < T_COLD ? 0.95 : 0.86;
        if (s.patch > flowerPatch && r < (meadow ? 0.4 : 0.3)) return clusterFlower(s, MEADOW_FLOWERS);
        if (s.fine > (meadow ? 0.35 : 0.52) && r < 0.5) return B.TALL_GRASS;
        return r < 0.2 ? B.SHORT_GRASS : -1;
      }
      case BIOME.FOREST:
      case BIOME.BIRCH_FOREST:
        if (ground !== B.GRASS_BLOCK) return -1;
        if (s.patch > 0.9 && r < 0.25) return clusterFlower(s, FOREST_FLOWERS);
        if (r < 0.04) return B.FERN;
        return r < 0.16 ? B.SHORT_GRASS : -1;
      case BIOME.FLOWER_FOREST:
        if (ground !== B.GRASS_BLOCK) return -1;
        if (s.patch > 0.3 && r < 0.45) return MEADOW_FLOWERS[Math.floor(s.fine * 7.5) % MEADOW_FLOWERS.length];
        return r < 0.6 ? B.SHORT_GRASS : -1;
      case BIOME.CHERRY_GROVE:
        if (ground !== B.GRASS_BLOCK) return -1;
        if (s.fine > 0.38 && r < 0.75) return B.PINK_PETALS;
        return r < 0.1 ? B.SHORT_GRASS : -1;
      case BIOME.DARK_FOREST:
        if (ground !== B.GRASS_BLOCK && ground !== B.MOSS_BLOCK) return -1;
        if (r < 0.1) return B.FERN;
        return r < 0.18 ? B.SHORT_GRASS : -1;
      case BIOME.TAIGA:
      case BIOME.OLD_GROWTH_TAIGA:
      case BIOME.SNOWY_TAIGA:
        if (ground !== B.GRASS_BLOCK && ground !== B.PODZOL) return -1;
        if (s.patch < 0.25 && s.fine > 0.7 && r < 0.3) return B.SWEET_BERRY_BUSH;
        if (scatter(s.x, s.y, 41, 0.2, pumpkinSeed)) return B.PUMPKIN;
        if (s.fine > 0.45 && r < 0.3) return B.FERN;
        return r < 0.1 ? B.SHORT_GRASS : -1;
      case BIOME.SAVANNA:
      case BIOME.WOODED_BADLANDS:
        if (ground !== B.GRASS_BLOCK) break;
        if (r < (s.fine < 0.2 ? 0.12 : 0.5)) return B.DRY_GRASS;
        return r < 0.58 ? B.SHORT_GRASS : -1;
      case BIOME.JUNGLE:
      case BIOME.SPARSE_JUNGLE:
      case BIOME.BAMBOO_JUNGLE: {
        if (ground !== B.GRASS_BLOCK && ground !== B.PODZOL) return -1;
        const grove = s.biome === BIOME.BAMBOO_JUNGLE ? s.patch > 0.35 : s.patch > 0.9;
        if (grove && r < 0.65) return B.BAMBOO;
        if (r < 0.2) return B.FERN;
        return r < 0.45 ? B.SHORT_GRASS : -1;
      }
      case BIOME.SWAMP:
        if (ground === B.SWAMP_WATER) return r < 0.14 ? B.LILY_PAD : -1;
        if (ground !== B.GRASS_BLOCK) return -1;
        if (s.patch > 0.42 && s.patch < 0.5 && r < 0.3) return B.BLUE_ORCHID;
        return r < 0.2 ? B.SHORT_GRASS : -1;
      case BIOME.MANGROVE_SWAMP:
        if (ground === B.SWAMP_WATER) return r < 0.05 ? B.LILY_PAD : -1;
        return -1;
      case BIOME.WINDSWEPT_HILLS:
      case BIOME.STONY_PEAKS:
        if (ground !== B.GRASS_BLOCK) return -1;
        return r < 0.12 ? B.SHORT_GRASS : -1;
      default:
        break;
    }

    // 건조 지대: 간격을 둔 마른 덤불과 선인장
    if (s.biome === BIOME.DESERT || s.biome === BIOME.BADLANDS || s.biome === BIOME.WOODED_BADLANDS) {
      const sandy = ground === B.SAND || ground === B.RED_SAND;
      if (sandy && scatter(s.x, s.y, s.biome === BIOME.DESERT ? 13 : 16, 0.45, cactusSeed)) return B.CACTUS;
      if ((sandy || ground === B.SANDSTONE || ground === B.TERRACOTTA) && scatter(s.x, s.y, 9, 0.5, bushSeed)) {
        return B.DEAD_BUSH;
      }
    }
    return -1;
  };
}
