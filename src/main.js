// のびのびタワー — はじまり
import { STEP, SPEEDS, NIGHT_BOOST, FLOOR_H, WIDTH, TILE_W } from './config.js';
import { Game } from './sim.js';
import { Renderer } from './render.js';
import { UI, loadLocal, saveLocal } from './ui.js';

const canvas = document.getElementById('view');
const renderer = new Renderer(canvas);
let game = loadLocal() || new Game();

function homeCamera() {
  renderer.resize();
  renderer.cam.z = Math.max(1, Math.min(2, renderer.vw / 260));
  renderer.cam.x = Math.min((renderer.vw / 2 - 34) / renderer.cam.z, WIDTH * TILE_W / 2);
  renderer.cam.y = -(renderer.vh * 0.2) / renderer.cam.z;
}
homeCamera();

const ui = new UI(game, renderer, g => {
  game = g;
  ui.setGame(g);
  saveLocal(g);
  homeCamera();
});

window.addEventListener('resize', () => renderer.resize());
document.addEventListener('visibilitychange', () => { if (document.hidden) saveLocal(game); });
window.addEventListener('pagehide', () => saveLocal(game));

let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000);
  last = now;
  const sp = SPEEDS[ui.speed] || 0;
  let mins = sp * dt;
  if (sp && game.isNight()) mins *= NIGHT_BOOST;
  acc += mins;
  let n = 0;
  while (acc >= STEP && n < 400) { game.step(); acc -= STEP; n++; }
  if (n >= 400) acc = 0;
  renderer.draw(game, now);
  ui.update(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// テスト・デバッグ用
window.__tower = { get game() { return game; }, renderer, ui };
