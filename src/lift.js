// のびのびタワー — エレベーターの絵（こまかいドット：1ドット＝0.5）
import { FLOOR_H, DWELL } from './config.js';
import { drawFigure, blinking } from './people.js';

const cache = new Map();
function mk(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w * 2, h * 2) : Object.assign(document.createElement('canvas'), { width: w * 2, height: h * 2 });
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  return [c, ctx];
}
function P(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

// 1階ぶんのシャフト（32×24）
export function shaftFine() {
  let c = cache.get('shaft');
  if (c) return c;
  const [cv, ctx] = mk(32, FLOOR_H);
  P(ctx, 0, 0, 32, FLOOR_H, '#2a2f3b');
  P(ctx, 5, 0, 22, FLOOR_H, '#262a35');
  // ガイドレール
  for (const x of [3, 27.5]) {
    P(ctx, x, 0, 1.5, FLOOR_H, '#5a6274'); P(ctx, x, 0, 0.5, FLOOR_H, '#7a8398');
    for (let y = 3; y < FLOOR_H; y += 8) P(ctx, x - 0.5, y, 2.5, 1, '#454c5c');
  }
  // 両はしの壁
  P(ctx, 0, 0, 2, FLOOR_H, '#3e4454'); P(ctx, 30, 0, 2, FLOOR_H, '#3e4454');
  P(ctx, 1.5, 0, 0.5, FLOOR_H, '#555d70'); P(ctx, 30, 0, 0.5, FLOOR_H, '#22262f');
  // 床のふち
  P(ctx, 0, 22, 32, 2, '#474c59'); P(ctx, 0, 22, 32, 0.5, '#5f6575');
  // ランプの台
  P(ctx, 12, 0.5, 8, 2.5, '#1b1e26'); P(ctx, 12, 0.5, 8, 0.5, '#3a3f4c');
  cache.set('shaft', cv);
  return cv;
}

// 乗り場のランプ（上・下・かごが止まっている）
export function drawLamps(ctx, x, y, up, down, here) {
  P(ctx, x + 13, y + 1, 1.5, 1.5, up ? '#ffd54f' : '#3c4150');
  if (up) P(ctx, x + 13.5, y + 1, 0.5, 0.5, '#fff6c8');
  P(ctx, x + 17.5, y + 1, 1.5, 1.5, down ? '#ffd54f' : '#3c4150');
  if (down) P(ctx, x + 18, y + 2, 0.5, 0.5, '#fff6c8');
  P(ctx, x + 15, y + 1, 2, 1.5, here ? '#ff9f43' : '#2c303b');
}

// かご（24×19）。open：0〜1
function carBody(n) {
  const key = `car|${n}`;
  let c = cache.get(key);
  if (c) return c;
  const [cv, ctx] = mk(24, 19);
  P(ctx, 0, 0, 24, 19, '#7f8899');
  P(ctx, 0, 0, 24, 1.5, '#5f6777'); P(ctx, 0, 0, 24, 0.5, '#9aa3b4');
  P(ctx, 1, 1.5, 22, 16.5, '#f1ead2');            // 中の壁
  P(ctx, 1, 1.5, 22, 1, '#fff7d0');                // あかり
  P(ctx, 3, 2.5, 18, 0.5, 'rgba(255,248,210,0.6)');
  P(ctx, 1, 10.5, 22, 0.5, '#c9b98e');             // 手すり
  P(ctx, 1, 11, 22, 0.5, '#e8dcb6');
  P(ctx, 1, 16.5, 22, 1.5, '#b3a27c');             // 床
  P(ctx, 0, 18, 24, 1, '#5f6777');
  if (n > 0) {                                      // かごの番号
    P(ctx, 1.5, 2, 3, 2.5, '#263238');
    for (let i = 0; i < Math.min(n, 3); i++) P(ctx, 2 + i * 0.75, 2.75, 0.5, 1, '#ffeb3b');
  }
  cache.set(key, cv);
  return cv;
}

export function doorOpen(car) {
  if (!(car.dwell > 0)) return 0;
  const ramp = DWELL * 0.25;
  return Math.max(0, Math.min(1, (DWELL - car.dwell) / ramp, car.dwell / ramp));
}

export function drawCarFine(ctx, x, y, car, n, real) {
  ctx.drawImage(carBody(n), x, y, 24, 19);
  // 乗っている人（うしろの列 → 前の列）
  const pass = car.pass.slice(0, 12);
  const front = pass.slice(0, 6), back = pass.slice(6);
  back.forEach((p, k) => drawFigure(ctx, x + 4.5 + k * 3.2, y + 16.5, p, 'stand', blinking(p, real) ? 'blink' : 'normal', 0, k % 2 === 1, null));
  front.forEach((p, k) => drawFigure(ctx, x + 3.5 + k * 3.4, y + 17.5, p, 'stand', blinking(p, real) ? 'blink' : 'normal', 0, k % 2 === 1, null));
  // ドア（ガラスつき。ひらくと左右へ）
  const f = doorOpen(car);
  const pw = 10.5 * (1 - f) + 0.5;
  for (const side of [0, 1]) {
    const px = side ? x + 23 - pw : x + 1;
    ctx.fillStyle = 'rgba(196,206,220,0.92)'; ctx.fillRect(px, y + 3, pw, 13.5);
    if (pw > 3) {
      ctx.fillStyle = 'rgba(170,214,240,0.42)'; ctx.fillRect(px + 1, y + 4, pw - 2, 7.5);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(px + 1.5, y + 4.5, 1, 3);
    }
    P(ctx, side ? px : px + pw - 0.5, y + 3, 0.5, 13.5, '#8d97a8');
    P(ctx, px, y + 3, pw, 0.5, '#e6ebf2');
  }
  P(ctx, x + 1, y + 2.5, 22, 0.5, '#6b7383');
}
