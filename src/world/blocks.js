// 블록 레지스트리: 색 하나 = 블록 하나. 의존성 없는 최하위 모듈.

// [key, 이름, 색, 분류]
const DEFS = [
  // 물/얼음
  ['deep_water', '깊은 물', '#1d3b6e', 'water'],
  ['water', '물', '#2a5a9e', 'water'],
  ['shallow_water', '얕은 물', '#3c7cbf', 'water'],
  ['warm_water', '따뜻한 얕은 물', '#3aa6c4', 'water'],
  ['swamp_water', '늪 물', '#3e5f52', 'water'],
  ['ice', '얼음', '#a8c8f0', 'water'],
  ['packed_ice', '단단한 얼음', '#84a9de', 'water'],
  ['blue_ice', '푸른 얼음', '#5c8bd6', 'water'],
  // 수중 식생/산호
  ['seagrass', '해초', '#2f7d63', 'aquatic'],
  ['kelp', '켈프', '#4a6b2a', 'aquatic'],
  ['tube_coral', '관 산호', '#3657d1', 'aquatic'],
  ['brain_coral', '뇌 산호', '#d05c9e', 'aquatic'],
  ['fire_coral', '불 산호', '#c8353b', 'aquatic'],
  ['horn_coral', '뿔 산호', '#d6c444', 'aquatic'],
  ['lily_pad', '수련잎', '#2d8a3a', 'aquatic'],
  // 지면
  ['grass_block', '잔디 블록', '#6e9e45', 'ground'],
  ['coarse_dirt', '거친 흙', '#77553a', 'ground'],
  ['podzol', '회백토', '#6a4b26', 'ground'],
  ['mud', '진흙', '#3f383a', 'ground'],
  ['clay', '점토', '#9fa5b3', 'ground'],
  ['moss_block', '이끼 블록', '#587a2c', 'ground'],
  ['snow', '눈', '#f2f6f9', 'ground'],
  ['powder_snow', '가루눈', '#dce6ef', 'ground'],
  ['sand', '모래', '#dccf98', 'ground'],
  ['red_sand', '붉은 모래', '#bd6a2a', 'ground'],
  ['sandstone', '사암', '#c8b27a', 'ground'],
  ['gravel', '자갈', '#898180', 'ground'],
  // 암석
  ['stone', '돌', '#7b7b7b', 'stone'],
  ['andesite', '안산암', '#939397', 'stone'],
  ['diorite', '섬록암', '#c9c9cc', 'stone'],
  ['granite', '화강암', '#9b6a57', 'stone'],
  ['mossy_cobblestone', '이끼 낀 조약돌', '#66785a', 'stone'],
  ['terracotta', '테라코타', '#985f45', 'stone'],
  ['orange_terracotta', '주황색 테라코타', '#a2552a', 'stone'],
  ['yellow_terracotta', '노란색 테라코타', '#b9862a', 'stone'],
  ['white_terracotta', '흰색 테라코타', '#d0b4a3', 'stone'],
  ['light_gray_terracotta', '회백색 테라코타', '#886c63', 'stone'],
  ['red_terracotta', '빨간색 테라코타', '#8e3e2f', 'stone'],
  ['brown_terracotta', '갈색 테라코타', '#4f3526', 'stone'],
  // 지면 식물
  ['short_grass', '잔디', '#87b356', 'plant'],
  ['tall_grass', '큰 잔디', '#9fc566', 'plant'],
  ['fern', '고사리', '#4f7f37', 'plant'],
  ['dry_grass', '마른 풀', '#bfb267', 'plant'],
  ['dead_bush', '마른 덤불', '#8a6a3f', 'plant'],
  ['cactus', '선인장', '#3c7a2c', 'plant'],
  ['bamboo', '대나무', '#8bb33e', 'plant'],
  ['sweet_berry_bush', '달콤한 열매 덤불', '#a33a45', 'plant'],
  ['pink_petals', '분홍 꽃잎', '#f2b9d2', 'plant'],
  ['pumpkin', '호박', '#d8861c', 'plant'],
  ['poppy', '양귀비', '#d33a2c', 'flower'],
  ['dandelion', '민들레', '#f0d23a', 'flower'],
  ['cornflower', '수레국화', '#4d6fd8', 'flower'],
  ['allium', '파꽃', '#b065d8', 'flower'],
  ['oxeye_daisy', '데이지', '#eeeadb', 'flower'],
  ['blue_orchid', '파란 난초', '#2aa3d8', 'flower'],
  ['sunflower', '해바라기', '#f2a51f', 'flower'],
  // 나무/대형 식생
  ['oak_leaves', '참나무 잎', '#3d7128', 'tree'],
  ['birch_leaves', '자작나무 잎', '#6a9a3e', 'tree'],
  ['spruce_leaves', '가문비나무 잎', '#2c5537', 'tree'],
  ['jungle_leaves', '정글나무 잎', '#2f8a24', 'tree'],
  ['acacia_leaves', '아카시아나무 잎', '#6b8c2a', 'tree'],
  ['dark_oak_leaves', '짙은 참나무 잎', '#234a1c', 'tree'],
  ['cherry_leaves', '벚나무 잎', '#e58fb7', 'tree'],
  ['mangrove_leaves', '맹그로브 잎', '#4f8a2e', 'tree'],
  ['mangrove_roots', '맹그로브 뿌리', '#5b4733', 'tree'],
  ['vine', '덩굴', '#3a6420', 'tree'],
  ['red_mushroom_block', '빨간 버섯 블록', '#b52c28', 'tree'],
  ['brown_mushroom_block', '갈색 버섯 블록', '#957250', 'tree'],
];

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export const BLOCKS = DEFS.map(([key, name, color, category], id) => ({
  id,
  key,
  name,
  color,
  category,
  rgb: hexToRgb(color),
}));

// B.GRASS_BLOCK 형태의 id 상수
export const B = Object.freeze(Object.fromEntries(BLOCKS.map((b) => [b.key.toUpperCase(), b.id])));

export const BLOCK_CATEGORIES = {
  water: '물·얼음',
  aquatic: '수중 식생',
  ground: '지면',
  stone: '암석',
  plant: '식물',
  flower: '꽃',
  tree: '나무',
};
