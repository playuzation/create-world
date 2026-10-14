// 월드 생성을 메인 스레드 밖에서 실행해 UI가 멈추지 않게 한다.
import { generateWorld } from './world/generator.js';

self.onmessage = (event) => {
  const { id, seed } = event.data;
  const t0 = performance.now();
  const world = generateWorld(seed);
  const ms = performance.now() - t0;
  self.postMessage({ id, world, ms }, [world.blocks.buffer, world.biomes.buffer]);
};
