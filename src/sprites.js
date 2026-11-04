// のびのびタワー — 部屋のドット絵（こまかいドット：1ドット＝0.5）
// 2倍の大きさのキャンバスに描いておき（cache）、置くときに半分の大きさにする
// 人の背は12（足もと21・頭9）。家具はこれに合わせる：机の天板17.5、いすの座面19、ベッド17.5
import { TILE_W, FLOOR_H, FAC, DWELL } from './config.js';
import { shaftFine, drawCarFine } from './lift.js';
import { drawFigure, blinking } from './people.js';

const cache = new Map();
const WIN = new Map(); // 部屋ごとの窓の場所（夜に暗くする）

function mk(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w * 2, h * 2) : Object.assign(document.createElement('canvas'), { width: w * 2, height: h * 2 });
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  return [c, ctx];
}
function P(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
// 箱：上にあかり、下と右にかげ
function box(ctx, x, y, w, h, c, hi, lo) {
  P(ctx, x, y, w, h, c);
  if (hi) P(ctx, x, y, w, 0.5, hi);
  if (lo) { P(ctx, x, y + h - 0.5, w, 0.5, lo); P(ctx, x + w - 0.5, y + 0.5, 0.5, h - 0.5, lo); }
}
function floorShadow(ctx, x, w) { P(ctx, x, 21, w, 0.5, 'rgba(40,30,20,0.18)'); }

const ITEM = ['#ef5350', '#42a5f5', '#ffca28', '#66bb6a', '#ab47bc', '#ff7043', '#26c6da', '#f48fb1'];

// ---------- 部屋のわく ----------
// o: wall / stripe / low（腰板）/ lowY / panel / base（巾木）/ floor：[面, あかり, もよう]
function frame(ctx, W, o) {
  P(ctx, 0, 0, W, FLOOR_H, o.wall);
  if (o.stripe) for (let x = 1.5; x < W; x += o.gap || 3) P(ctx, x, 2.5, 0.5, 17.5, o.stripe);
  if (o.dots) for (let y = 4; y < 14; y += 3) for (let x = 2 + ((y / 3) % 2) * 1.5; x < W - 1; x += 3) P(ctx, x, y, 0.5, 0.5, o.dots);
  if (o.low) {
    const ly = o.lowY ?? 15;
    P(ctx, 0, ly, W, 20 - ly, o.low);
    P(ctx, 0, ly - 0.5, W, 0.5, o.lowHi); P(ctx, 0, ly, W, 0.5, o.lowLo);
    if (o.panel) for (let x = 2; x < W - 1; x += o.panel) { P(ctx, x, ly + 1.5, 0.5, 20 - ly - 2.5, o.lowLo); P(ctx, x + 0.5, ly + 1.5, 0.5, 20 - ly - 2.5, o.lowHi); }
  }
  // 巾木
  P(ctx, 0, 20, W, 1, o.base || '#8a7864'); P(ctx, 0, 20, W, 0.5, o.baseHi || 'rgba(255,255,255,0.18)');
  // 天井
  P(ctx, 0, 0, W, 1.5, '#4a4e59'); P(ctx, 0, 1.5, W, 0.5, '#6d7280'); P(ctx, 0, 2, W, 0.5, 'rgba(0,0,0,0.10)');
  // 床
  const [f0, f1, pat] = o.floor;
  P(ctx, 0, 21, W, 1, f0); P(ctx, 0, 21.5, W, 0.5, f1);
  if (pat === 'plank') for (let x = 0; x < W; x += 6) { P(ctx, x, 21, 0.5, 0.5, 'rgba(0,0,0,0.18)'); P(ctx, x + 3, 21.5, 0.5, 0.5, 'rgba(0,0,0,0.18)'); }
  if (pat === 'tile') for (let x = 0; x < W; x += 2) P(ctx, x, (x / 2) % 2 ? 21 : 21.5, 2, 0.5, 'rgba(255,255,255,0.16)');
  if (pat === 'fleck') for (let x = 1; x < W; x += 2.5) P(ctx, x, (x * 2) % 2 ? 21 : 21.5, 0.5, 0.5, 'rgba(255,255,255,0.14)');
  // 床のふち（コンクリート）
  P(ctx, 0, 22, W, 2, '#585049'); P(ctx, 0, 22, W, 0.5, '#6e655c'); P(ctx, 0, 23.5, W, 0.5, '#463f39');
  // 左右のしきり
  P(ctx, 0, 0, 0.5, FLOOR_H, 'rgba(0,0,0,0.30)'); P(ctx, 0.5, 2.5, 0.5, 17.5, 'rgba(0,0,0,0.07)');
  P(ctx, W - 0.5, 0, 0.5, FLOOR_H, 'rgba(0,0,0,0.22)');
}
function ceilLamp(ctx, x, w) {
  P(ctx, x, 2, w, 0.5, '#cfd4dc'); P(ctx, x + 0.5, 2.5, w - 1, 0.5, '#fffbe2');
  P(ctx, x - 0.5, 3, w + 1, 1, 'rgba(255,250,220,0.16)');
}
function pendant(ctx, x, shade, cord = 2.5) {
  P(ctx, x + 1.5, 2, 0.5, cord, '#4b4f5a');
  const y = 2 + cord;
  P(ctx, x + 0.5, y, 2.5, 0.5, shade); P(ctx, x, y + 0.5, 3.5, 1, shade);
  P(ctx, x, y + 0.5, 3.5, 0.5, 'rgba(255,255,255,0.25)');
  P(ctx, x + 0.5, y + 1.5, 2.5, 0.5, '#fff1b8');
  P(ctx, x - 0.5, y + 2, 4.5, 1.5, 'rgba(255,240,190,0.14)');
}
function win(ctx, reg, x, y, w, h, fc = '#f3f1ec') {
  P(ctx, x, y, w, h, fc);
  P(ctx, x + 0.5, y + 0.5, w - 1, h - 1, '#a7d9f3');
  P(ctx, x + 0.5, y + 0.5, w - 1, Math.floor(h * 0.8) / 2, '#8ccbef');
  // 雲
  P(ctx, x + 1.5, y + h * 0.5 - 0.5 | 0, 3, 0.5, '#e8f6fd'); P(ctx, x + 2, y + (h * 0.5 | 0) - 1, 1.5, 0.5, '#e8f6fd');
  // 向こうのビル
  P(ctx, x + w - 4, y + h - 3.5, 1.5, 3, '#c3dbe9'); P(ctx, x + w - 2.5, y + h - 2.5, 1.5, 2, '#b5d0e1');
  const mid = x + Math.round(w) / 2 - 0.5;
  P(ctx, mid, y, 0.5, h, fc);
  P(ctx, x + 1, y + 1, 0.5, 2, 'rgba(255,255,255,0.65)'); P(ctx, x + 1.5, y + 1, 0.5, 1, 'rgba(255,255,255,0.65)');
  P(ctx, x - 0.5, y + h, w + 1, 0.5, fc); P(ctx, x - 0.5, y + h + 0.5, w + 1, 0.5, 'rgba(0,0,0,0.12)');
  reg.push([x + 0.5, y + 0.5, w - 1, h - 1]);
}
function curtains(ctx, x, y, w, h, c, c2) {
  P(ctx, x - 1, y - 1, w + 2, 0.5, '#8d7a66');
  for (const cx of [x - 1, x + w - 1]) {
    P(ctx, cx, y - 0.5, 2, h + 1.5, c);
    P(ctx, cx + 0.5, y - 0.5, 0.5, h + 1.5, c2); P(ctx, cx + 1.5, y, 0.5, h + 1, c2);
    P(ctx, cx, y + h * 0.55 | 0, 2, 0.5, c2);
  }
}
function frameArt(ctx, x, y, w, h, kind) {
  box(ctx, x, y, w, h, '#a5774e', '#c49466', '#7e5636');
  const ix = x + 0.5, iy = y + 0.5, iw = w - 1, ih = h - 1;
  if (kind === 'sea') { P(ctx, ix, iy, iw, ih, '#bfe6f7'); P(ctx, ix, iy + ih * 0.55, iw, ih * 0.45, '#4f9fd0'); P(ctx, ix + iw - 2, iy + 0.5, 1.5, 1.5, '#ffd54f'); P(ctx, ix + 1, iy + ih * 0.55 - 0.5, 2.5, 0.5, '#ffffff'); }
  else if (kind === 'hill') { P(ctx, ix, iy, iw, ih, '#d9f0fb'); P(ctx, ix, iy + ih - 2, iw, 2, '#7cbf5a'); P(ctx, ix + 1, iy + ih - 3, iw * 0.5, 1, '#94d06e'); P(ctx, ix + iw - 2.5, iy + 0.5, 1.5, 1.5, '#ffb74d'); }
  else if (kind === 'sunset') { P(ctx, ix, iy, iw, ih, '#ffcc80'); P(ctx, ix, iy, iw, ih * 0.4, '#f48fb1'); P(ctx, ix + iw / 2 - 1, iy + ih * 0.5, 2, 1, '#fff3c4'); P(ctx, ix, iy + ih - 1.5, iw, 1.5, '#7e57c2'); }
  else { P(ctx, ix, iy, iw, ih, '#f5f0e6'); P(ctx, ix + 1, iy + 1, iw * 0.4, ih * 0.5, '#ef9a9a'); P(ctx, ix + iw * 0.45, iy + ih * 0.35, iw * 0.45, ih * 0.5, '#90caf9'); P(ctx, ix + 1.5, iy + ih - 1.5, iw - 3, 0.5, '#ffd54f'); }
}
function plantPot(ctx, x, big) {
  // x：はちの左。はちの幅4
  const top = big ? 7 : 11;
  box(ctx, x, 17, 4, 4, '#c47a48', '#e0975f', '#9a5a33');
  P(ctx, x - 0.5, 16.5, 5, 0.5, '#d68955');
  P(ctx, x + 1.75, top + 2, 0.5, 15 - top, '#3f7a35');
  const L = [[-1.5, top + 3, 2.5, 1.5], [2.5, top + 1.5, 2.5, 1.5], [-0.5, top, 2, 2], [1.5, top - 1, 2, 2.5], [3, top + 5, 2.5, 1.5], [-2, top + 6.5, 3, 1.5], [0.5, top + 4.5, 3, 1.5]];
  if (!big) L.length = 5;
  L.forEach(([dx, dy, w, h], i) => {
    P(ctx, x + dx, dy, w, h, i % 2 ? '#4caf50' : '#2e8b3e');
    P(ctx, x + dx, dy, w, 0.5, '#7fd17a');
  });
}
function chairSide(ctx, cx, facing, c, hi) {
  // facing：1 右むき（せもたれは左）、-1 左むき
  const bx = facing > 0 ? cx - 3 : cx + 2.5;
  P(ctx, bx, 13.5, 0.5, 6, c); P(ctx, bx + (facing > 0 ? 0.5 : -0.5), 13.5, 0.5, 0.5, hi);
  P(ctx, cx - 2.5, 19, 5, 0.5, hi); P(ctx, cx - 2.5, 19.5, 5, 0.5, c);
  P(ctx, cx - 2.5, 20, 0.5, 1, c); P(ctx, cx + 2, 20, 0.5, 1, c);
}
function vacantSign(ctx, W, at) {
  const x = at ?? Math.floor(W / 2) - 5;
  // 立て看板
  P(ctx, x + 1.5, 15, 0.5, 6, '#7a6a5a'); P(ctx, x + 8, 15, 0.5, 6, '#7a6a5a');
  box(ctx, x, 8, 10, 7.5, '#fbfbf7', '#ffffff', '#c9c9c0');
  P(ctx, x, 8, 10, 2, '#d84343'); P(ctx, x, 8, 10, 0.5, '#ef6a6a');
  for (let i = 0; i < 4; i++) P(ctx, x + 1 + i * 2.25, 8.75, 1.5, 0.5, '#ffffff');
  P(ctx, x + 1, 11, 5, 0.5, '#8a96a3'); P(ctx, x + 1, 12, 7, 0.5, '#8a96a3'); P(ctx, x + 1, 13, 4, 0.5, '#8a96a3');
  // かぎ
  P(ctx, x + 7, 13, 1.5, 1.5, '#e8c247'); P(ctx, x + 7.5, 13.5, 0.5, 0.5, '#fbfbf7'); P(ctx, x + 8.5, 13.5, 1, 0.5, '#e8c247');
  // ダンボール
  box(ctx, 3, 17, 5, 4, '#c89a62', '#ddb57f', '#a47a46'); P(ctx, 5.25, 17, 0.5, 1.5, '#e6d3b0');
  box(ctx, 4, 14, 3.5, 3, '#c89a62', '#ddb57f', '#a47a46');
  box(ctx, W - 8, 18, 4.5, 3, '#c89a62', '#ddb57f', '#a47a46');
  floorShadow(ctx, 3, 5); floorShadow(ctx, W - 8, 4.5);
}

// ---------- 部屋ごと ----------
const DRAW = {
  lobby(ctx, W, s, v, reg) {
    frame(ctx, W, { wall: '#f4ead6', low: '#e5d7bb', lowY: 14.5, lowHi: '#d9b766', lowLo: '#cbb892', panel: 4, base: '#9c8258', floor: ['#ece2cf', '#d9ccb2'] });
    // 大理石の床
    for (let x = 0; x < W; x += 2) { P(ctx, x, 21, 2, 0.5, (x / 2) % 2 ? '#f6efe2' : '#ddd0b6'); P(ctx, x, 21.5, 2, 0.5, (x / 2) % 2 ? '#d6c8ab' : '#efe6d4'); }
    for (const x of [2, 10, 22, 30]) P(ctx, x, 2.5, 0.5, 11.5, '#e8dcc3');
    // 柱
    P(ctx, 13.5, 2.5, 5, 1, '#e9dcc0'); P(ctx, 13.5, 2.5, 5, 0.5, '#fbf5e8'); P(ctx, 14, 3.5, 4, 0.5, '#d2bf98');
    P(ctx, 14.5, 4, 3, 15, '#efe4cc'); P(ctx, 14.5, 4, 0.5, 15, '#fbf6ea'); P(ctx, 17, 4, 0.5, 15, '#d3c29f');
    P(ctx, 15.5, 4.5, 0.5, 14, '#e0d2b5'); P(ctx, 16.25, 4.5, 0.5, 14, '#e0d2b5');
    P(ctx, 13.5, 19, 5, 1, '#e0d1b0'); P(ctx, 13.5, 19, 5, 0.5, '#f7efdd');
    // かべのあかり
    for (const lx of [6, 24.5]) {
      P(ctx, lx + 0.5, 7, 0.5, 1.5, '#b08d4a'); P(ctx, lx - 0.5, 5.5, 2.5, 1.5, '#fff4c8'); P(ctx, lx - 0.5, 5.5, 2.5, 0.5, '#ffffff');
      P(ctx, lx - 1.5, 4.5, 4.5, 4, 'rgba(255,236,170,0.18)');
    }
    if (v === 0) { plantPot(ctx, 9, true); floorShadow(ctx, 9, 4); }
    else if (v === 1) {
      frameArt(ctx, 19.5, 4, 8, 6, 'sea');
      P(ctx, 19.5, 18, 8, 1, '#a0714a'); P(ctx, 19.5, 18, 8, 0.5, '#c4925f'); P(ctx, 20, 19, 7, 0.5, '#7e5636');
      P(ctx, 20, 19.5, 0.5, 1.5, '#5d4630'); P(ctx, 26.5, 19.5, 0.5, 1.5, '#5d4630'); floorShadow(ctx, 19.5, 8);
    } else {
      // 案内板
      box(ctx, 6.5, 4.5, 6, 8, '#3c3f4c', '#5a5e6e', '#2a2c36');
      for (let i = 0; i < 5; i++) { P(ctx, 7.5, 6 + i * 1.25, 2, 0.5, '#e8c247'); P(ctx, 10, 6 + i * 1.25, 1.5, 0.5, '#c8ccd8'); }
      // 花の台
      P(ctx, 21.5, 16.5, 4, 0.5, '#8d6a46'); P(ctx, 23.25, 17, 0.5, 4, '#6d5034'); P(ctx, 22, 20.5, 3, 0.5, '#6d5034');
      P(ctx, 22.5, 14, 2, 2.5, '#9fd3e8'); P(ctx, 22.5, 14, 2, 0.5, '#d6eff8');
      P(ctx, 22, 12, 1, 1, '#f48fb1'); P(ctx, 23.5, 11.5, 1, 1, '#ffd54f'); P(ctx, 24.5, 12.5, 1, 1, '#ef5350'); P(ctx, 23, 13, 0.5, 1, '#4caf50'); P(ctx, 24, 13, 0.5, 1, '#4caf50');
      floorShadow(ctx, 22, 3);
    }
  },
  stairs(ctx, W) {
    P(ctx, 0, 0, W, FLOOR_H, '#ebe2cf');
    for (let x = 1; x < W; x += 3) P(ctx, x, 3, 0.5, 17, 'rgba(120,100,70,0.06)');
    P(ctx, 0, 0, 10, 1.5, '#4a4e59'); P(ctx, 0, 1.5, 10, 0.5, '#6d7280'); P(ctx, 10, 0, 0.5, 2, '#3a3d46');
    P(ctx, 0, 20, W, 1, '#8a7864');
    P(ctx, 0, 21, W, 1, '#c9b998'); P(ctx, 0, 22, W, 2, '#585049'); P(ctx, 0, 22, W, 0.5, '#6e655c');
    const top = i => Math.round((21 - (i + 1) * 24 / 14) * 2) / 2;
    // だんの下（三角の板）と小さな物入れ
    for (let i = 0; i < 14; i++) {
      const x = 1.5 + i, y = Math.max(0, top(i));
      P(ctx, x, y, 1, 21 - y, '#d6c39c');
      P(ctx, x, y + 2, 1, 21 - y - 2, '#c9b48a');
      P(ctx, x, y + 2, 1, 0.5, '#a88f66');
    }
    P(ctx, 10, 15, 3.5, 6, '#b39c74'); P(ctx, 10.5, 15.5, 2.5, 5.5, '#c2ab82'); P(ctx, 12, 18, 0.5, 0.5, '#7d6a4a');
    // 踏み面とけこみ
    for (let i = 0; i < 14; i++) {
      const x = 1.5 + i, y = top(i);
      if (y + 0.5 <= 0) continue;
      P(ctx, x, Math.max(0, y), 1, 0.5, '#f3e8cf');
      P(ctx, x, Math.max(0, y) + 0.5, 0.5, 1.25, '#b8a07c');
    }
    // 手すり
    for (let xs = 1.5; xs < 15.5; xs += 0.5) {
      const ry = Math.round((21 - (xs - 1.5) * 24 / 14 - 6.5) * 2) / 2;
      if (ry > -1) P(ctx, xs, Math.max(0, ry), 0.5, ry < 0 ? 1 + ry : 1, '#7d5a3c');
    }
    for (let i = 1; i < 12; i += 2) {
      const xs = 2 + i, ry = Math.round((21 - (xs - 1.5) * 24 / 14 - 5.5) * 2) / 2, ty = top(i);
      if (ry > 0) P(ctx, xs, ry, 0.5, Math.max(0, ty - ry), '#a7a7a7');
    }
  },
  office(ctx, W, s, v, reg) {
    const walls = ['#e9eef4', '#efeae2', '#e6f0ec'];
    frame(ctx, W, { wall: walls[v], stripe: 'rgba(110,130,160,0.05)', gap: 2, low: ['#d6dee9', '#e0d6c6', '#d3e3dc'][v], lowY: 15.5, lowHi: '#f4f7fb', lowLo: 'rgba(0,0,0,0.08)', base: '#6f7787', floor: [['#7f8ca3', '#6e7a90', 'fleck'], ['#9a8670', '#86735f', 'fleck'], ['#7c9a90', '#6a877e', 'fleck']][v] });
    for (const lx of [5, 21, 37, 53]) ceilLamp(ctx, lx, 6);
    if (s === 'vacant') { vacantSign(ctx, W); return; }
    // かべ（左の打ち合わせ）
    if (v === 0) {
      box(ctx, 1.5, 4.5, 10.5, 7, '#9aa4b2', '#b9c1cc', '#7c8594'); P(ctx, 2, 5, 9.5, 6, '#fbfcfd');
      P(ctx, 2.5, 6, 4, 0.5, '#e05a5a'); P(ctx, 2.5, 7, 6, 0.5, '#5a8fe0');
      for (let i = 0; i < 4; i++) P(ctx, 3 + i * 1.75, 10.5 - (i + 1) * 0.75, 1, (i + 1) * 0.75, ['#7cc4f0', '#ffca28', '#81c784', '#ef9a9a'][i]);
      P(ctx, 1.5, 11.5, 10.5, 0.5, '#8a93a1'); P(ctx, 4, 11.5, 1.5, 0.5, '#e05a5a'); P(ctx, 6, 11.5, 1.5, 0.5, '#2b303b');
    } else if (v === 1) {
      // 窓とブラインド
      win(ctx, reg, 1.5, 4, 10.5, 8, '#e8e2d6');
      for (let y = 4.5; y < 9; y += 1) P(ctx, 2, y, 9.5, 0.5, 'rgba(240,236,228,0.85)');
      P(ctx, 6.5, 4, 0.5, 5.5, '#bdb3a2');
    } else {
      // コルクボード
      box(ctx, 1.5, 4.5, 10.5, 7, '#c99a64', '#ddb27e', '#a8794a'); P(ctx, 2, 5, 9.5, 6, '#d9ae78');
      const N = [[2.5, 5.5, '#fff59d'], [5.5, 5.5, '#ffcc80'], [8.5, 6, '#b3e5fc'], [3, 8.5, '#c5e1a5'], [6.5, 8.5, '#f8bbd0']];
      for (const [nx, ny, c] of N) { P(ctx, nx, ny, 2.5, 2, c); P(ctx, nx + 0.5, ny + 0.5, 1.5, 0.5, 'rgba(0,0,0,0.18)'); P(ctx, nx + 1, ny, 0.5, 0.5, '#e53935'); }
    }
    // とけい
    P(ctx, 28.5, 4.5, 3, 3, '#4b5160'); P(ctx, 29, 5, 2, 2, '#ffffff'); P(ctx, 29.75, 5.25, 0.5, 1, '#2b303b'); P(ctx, 30, 5.75, 0.75, 0.5, '#2b303b');
    // ポスター
    if (v !== 1) frameArt(ctx, 41, 4.5, 6, 5, v === 0 ? 'hill' : 'sea');
    else { box(ctx, 41, 4.5, 6, 5, '#ffffff', null, '#d8dde5'); P(ctx, 41.5, 5, 5, 1.5, '#5a8fe0'); P(ctx, 42, 7, 4, 0.5, '#9aa4b2'); P(ctx, 42, 8, 3, 0.5, '#9aa4b2'); }
    // 机・パソコン・いす
    for (const cx of [23, 39, 55]) {
      const dx = cx - 10.5;
      floorShadow(ctx, dx, 8.5);
      box(ctx, dx, 17.5, 8.5, 0.75, ['#d9c09a', '#c9a77a', '#e8e4dc'][v], '#f0dcc0', '#a98d68');
      P(ctx, dx, 18.25, 8.5, 0.25, 'rgba(0,0,0,0.15)');
      box(ctx, dx + 0.5, 18.5, 3, 2.5, '#b5bcc8', '#cfd5de', '#8f97a5');
      P(ctx, dx + 1, 19.5, 2, 0.25, '#7b8392'); P(ctx, dx + 1.75, 19, 0.5, 0.25, '#e6eaf0');
      P(ctx, dx + 7.5, 18.5, 0.5, 2.5, '#8f97a5');
      // モニター（画面は動く絵で光る）
      box(ctx, dx + 2.5, 12.5, 5, 3.75, '#2b303b', '#454b59', '#1a1d24');
      P(ctx, dx + 3, 13, 4, 2.75, '#2a3442'); P(ctx, dx + 3, 13, 1.5, 0.5, 'rgba(255,255,255,0.12)');
      P(ctx, dx + 4.75, 16.25, 0.5, 0.75, '#3b404c'); P(ctx, dx + 3.75, 17, 2.5, 0.5, '#3b404c');
      // マグカップ・書類
      P(ctx, dx + 0.5, 16.5, 1, 1, ['#e57373', '#64b5f6', '#ffb74d'][(cx + v) % 3]); P(ctx, dx + 1.5, 16.75, 0.5, 0.5, '#d0d0d0');
      P(ctx, dx + 7, 16.75, 1.5, 0.75, '#ffffff'); P(ctx, dx + 7, 17, 1.5, 0.25, '#dfe3ea');
      // いす（左むきにすわる）
      const c = ['#3c4a6b', '#5a4a3c', '#2f5d55'][v];
      P(ctx, cx + 1.5, 13, 1, 6.5, c); P(ctx, cx + 1.5, 13, 1, 0.5, '#6b7896');
      P(ctx, cx - 2.5, 19, 5, 0.75, c); P(ctx, cx - 2.5, 19, 5, 0.25, '#6b7896');
      P(ctx, cx - 0.25, 19.75, 0.5, 0.75, '#555b66'); P(ctx, cx - 2, 20.5, 4.5, 0.5, '#3b3f48');
      P(ctx, cx - 2, 20.5, 0.5, 0.5, '#1f2229'); P(ctx, cx + 2, 20.5, 0.5, 0.5, '#1f2229');
    }
    // 右はし
    if (v === 2) {
      // ウォーターサーバー
      box(ctx, 59.5, 13.5, 3, 7.5, '#f4f6f8', '#ffffff', '#c3cad3');
      P(ctx, 59.5, 9.5, 3, 4, '#9fd3ef'); P(ctx, 60, 9, 2, 0.5, '#7ab8dd'); P(ctx, 60, 10, 0.5, 2.5, 'rgba(255,255,255,0.6)');
      P(ctx, 60, 15, 0.5, 0.5, '#e53935'); P(ctx, 61.5, 15, 0.5, 0.5, '#42a5f5'); floorShadow(ctx, 59.5, 3);
    } else { plantPot(ctx, 59, v === 0); floorShadow(ctx, 59, 4); }
  },
  home(ctx, W, s, v, reg) {
    const walls = ['#f7e3cd', '#e0eedc', '#dfe7f6'], stripe = ['rgba(200,140,90,0.10)', 'rgba(90,150,90,0.10)', 'rgba(90,120,180,0.10)'];
    frame(ctx, W, { wall: walls[v], stripe: stripe[v], gap: 2.5, base: '#9a7a58', floor: ['#b98252', '#9c6a40', 'plank'] });
    win(ctx, reg, 24, 4.5, 11, 8);
    if (s === 'vacant') { vacantSign(ctx, W, 42); return; }
    curtains(ctx, 24, 4.5, 11, 8, ['#f48fb1', '#a5d6a7', '#90caf9'][v], ['#e06e95', '#7fbf83', '#64a9e8'][v]);
    // 窓の下の台と植木
    box(ctx, 25.5, 17.5, 8, 3.5, '#c79a6b', '#dcb487', '#a3784e'); P(ctx, 29.25, 18, 0.5, 2.5, '#a3784e');
    P(ctx, 26.5, 15.5, 1.5, 2, '#e0e0e0'); P(ctx, 26, 13.5, 1, 1.5, '#66bb6a'); P(ctx, 27, 13, 1.5, 1.5, '#43a047'); floorShadow(ctx, 25.5, 8);
    // ベッド
    const bl = ['#e57373', '#64b5f6', '#ffb74d'][v], bd = ['#c95555', '#4994d6', '#e39a37'][v];
    box(ctx, 2, 13, 1.5, 8, '#8d5a3c', '#a8714d', '#6d4429');
    P(ctx, 3.5, 17.5, 14, 2, '#fafafa'); P(ctx, 3.5, 19.5, 14, 1, '#a0693f'); P(ctx, 3.5, 19.5, 14, 0.5, '#b97f50');
    P(ctx, 4, 20.5, 0.5, 0.5, '#6d4429'); P(ctx, 16.5, 20.5, 0.5, 0.5, '#6d4429');
    P(ctx, 4, 15.5, 4, 2, '#ffffff'); P(ctx, 4, 15.5, 4, 0.5, '#f2f2f2'); P(ctx, 4, 17, 4, 0.5, '#e3e3e3');
    P(ctx, 8, 16.5, 9.5, 2.5, bl); P(ctx, 8, 16.5, 9.5, 0.5, '#ffffff'); P(ctx, 8, 17, 9.5, 0.5, bd);
    for (let x = 9.5; x < 17; x += 2.5) P(ctx, x, 18, 0.5, 1, bd);
    P(ctx, 17, 17, 0.5, 2.5, bd);
    floorShadow(ctx, 2, 15.5);
    if (v === 1) {
      // ねこ
      P(ctx, 12, 15, 3.5, 1.5, '#f0a050'); P(ctx, 14.5, 14, 1.5, 1.5, '#f0a050'); P(ctx, 14.5, 13.5, 0.5, 0.5, '#f0a050'); P(ctx, 15.5, 13.5, 0.5, 0.5, '#f0a050');
      P(ctx, 12.5, 15.5, 2.5, 0.5, '#d9843a'); P(ctx, 15, 14.5, 0.5, 0.5, '#2b2233'); P(ctx, 11.5, 16, 1.5, 0.5, '#f0a050');
    }
    // ナイトテーブルとスタンド
    box(ctx, 18.5, 17.5, 3.5, 3.5, '#b5835a', '#cf9d72', '#8f6340'); P(ctx, 19, 19, 2.5, 0.25, '#8f6340');
    P(ctx, 19.75, 15.5, 1, 2, '#9e9e9e'); P(ctx, 19, 13.5, 2.5, 2, '#ffe9a8'); P(ctx, 19, 13.5, 2.5, 0.5, '#fff7d6');
    // ソファ（右むきにすわる）
    const sc = ['#6b8e5a', '#8d6e9e', '#c17a5b'][v], sh = ['#86a874', '#a689b6', '#d99676'][v], sd = ['#56744a', '#715680', '#9e5f44'][v];
    P(ctx, 37.5, 21, 19, 0.5, ['#e8b4c8', '#c8b4e0', '#e8d2a0'][v]);
    box(ctx, 40, 14, 14, 5, sc, sh, sd);
    for (let x = 44.5; x < 53; x += 4.5) P(ctx, x, 14.5, 0.5, 4, sd);
    P(ctx, 40, 18.5, 15, 2, sh); P(ctx, 40, 19, 15, 1.5, sc);
    box(ctx, 38.5, 16.5, 2, 4.5, sc, sh, sd); box(ctx, 53.5, 16.5, 2, 4.5, sc, sh, sd);
    P(ctx, 41, 20.5, 0.5, 0.5, '#5d4037'); P(ctx, 53, 20.5, 0.5, 0.5, '#5d4037');
    frameArt(ctx, 42, 5.5, 9, 6, ['hill', 'sunset', 'sea'][v]);
    // テレビ（画面は動く絵）
    box(ctx, 57, 17.5, 6.5, 3.5, '#8d6e63', '#a88a7e', '#6d5149'); P(ctx, 57.5, 19, 5.5, 0.25, '#6d5149');
    box(ctx, 57, 11.5, 6.5, 5, '#22262e', '#3a404c', '#15181d'); P(ctx, 57.5, 12, 5.5, 4, '#1f2a36');
    P(ctx, 57.5, 12, 2, 0.5, 'rgba(255,255,255,0.12)'); P(ctx, 59.75, 16.5, 1, 1, '#22262e');
    floorShadow(ctx, 57, 6.5);
  },
  food(ctx, W, s, v, reg) {
    const V = [
      { wall: '#f4e4c6', low: '#b07c4f', lowHi: '#cf9a6a', lowLo: '#8a5c36', floor: ['#a8754a', '#8e603a', 'plank'], chair: ['#7a4e2e', '#a0693f'], table: ['#c6935e', '#dcae7a', '#8f6038'] },
      { wall: '#efe1c3', low: '#7d5a3a', lowHi: '#9e7650', lowLo: '#5e4128', floor: ['#c8b48e', '#b09c76', 'tile'], chair: ['#5e4128', '#7d5a3a'], table: ['#9e6d43', '#b98657', '#734a2a'] },
      { wall: '#fdf0e6', low: '#fbf6f2', lowHi: '#a0693f', lowLo: '#e7d6d6', floor: ['#d8c4ae', '#c2ac94', 'tile'], chair: ['#8a5a3a', '#e05a5a'], table: ['#f2ede4', '#ffffff', '#c9c1b2'] },
    ][v];
    frame(ctx, W, { wall: V.wall, stripe: v === 1 ? 'rgba(120,80,40,0.10)' : null, gap: 2, low: V.low, lowY: 15.5, lowHi: V.lowHi, lowLo: V.lowLo, panel: v === 2 ? 0 : 6, base: '#7a5c42', floor: V.floor });
    if (v === 2) for (let x = 0; x < 74; x += 2) for (let y = 16; y < 20; y += 2) P(ctx, x + ((y / 2) % 2), y, 1, 1, 'rgba(214,72,72,0.28)');
    if (s === 'vacant') { vacantSign(ctx, W); return; }
    // 台所（右）
    const K = 74.5;
    P(ctx, K, 2.5, W - K, 12.5, '#f4f6f6');
    for (let y = 3.5; y < 15; y += 1.5) P(ctx, K, y, W - K, 0.25, '#d8dede');
    for (let x = K + 1.5; x < W; x += 1.5) P(ctx, x, 2.5, 0.25, 12.5, '#e2e7e7');
    P(ctx, K, 2.5, 0.5, 12.5, 'rgba(0,0,0,0.12)');
    // フード
    P(ctx, 84, 2.5, 9, 2.5, '#b9c0c6'); P(ctx, 83, 5, 11, 1, '#a3abb2'); P(ctx, 83, 5, 11, 0.5, '#d5dadd');
    // たな
    P(ctx, 76, 6.5, 6.5, 0.5, '#8d6a46');
    for (let i = 0; i < 4; i++) { P(ctx, 76.5 + i * 1.5, 5, 1, 1.5, ['#ef9a9a', '#fff59d', '#a5d6a7', '#90caf9'][(i + v) % 4]); P(ctx, 76.5 + i * 1.5, 5, 1, 0.5, 'rgba(255,255,255,0.5)'); }
    P(ctx, 76, 10, 6.5, 0.5, '#8d6a46');
    for (let i = 0; i < 3; i++) { P(ctx, 76.5 + i * 2, 8.5, 1.5, 1.5, '#ffffff'); P(ctx, 76.5 + i * 2, 9.5, 1.5, 0.5, '#dde3e3'); }
    // こんろとなべ（湯気は動く絵）
    P(ctx, 85, 13.5, 8, 1.5, '#4b4f5a'); P(ctx, 85, 13.5, 8, 0.5, '#6d7280');
    box(ctx, 86, 11, 3, 2.5, '#9aa3ab', '#c6ccd2', '#757e86'); P(ctx, 85.5, 11.5, 0.5, 0.5, '#757e86'); P(ctx, 89, 11.5, 0.5, 0.5, '#757e86');
    P(ctx, 90.5, 12.5, 2.5, 1, '#3b3f48'); P(ctx, 93, 12.75, 1.5, 0.5, '#3b3f48');
    // カウンター
    box(ctx, K, 15, W - K, 0.75, '#d8b27a', '#ecca96', '#b48a56');
    P(ctx, K, 15.75, W - K, 5.25, ['#8d5a3b', '#5e4128', '#c63c3c'][v]);
    for (let x = K + 2; x < W; x += 3.5) P(ctx, x, 16.5, 0.5, 4, 'rgba(0,0,0,0.15)');
    P(ctx, K, 15.75, W - K, 0.5, 'rgba(0,0,0,0.2)');
    // カウンターの上
    if (v === 0) {
      box(ctx, 76, 12, 3, 3, '#5d6470', '#7b8390', '#434852'); P(ctx, 76.5, 13, 1, 0.5, '#e53935'); P(ctx, 77, 14, 1, 1, '#ffffff');
      box(ctx, 80, 12.5, 3.5, 2.5, '#e8f4f8', '#ffffff', '#b6cfd8'); P(ctx, 80.5, 13.5, 1, 1, '#f48fb1'); P(ctx, 82, 13.5, 1, 1, '#a1887f');
    } else if (v === 1) {
      P(ctx, 76, 14, 1.5, 1, '#e8e2d2'); P(ctx, 78, 13.5, 1, 1.5, '#c62828'); P(ctx, 79.5, 14, 1.5, 1, '#e8e2d2');
    } else {
      P(ctx, 76, 14, 2, 1, '#ffffff'); P(ctx, 76.5, 13.5, 1, 0.5, '#ffca28'); P(ctx, 79, 13.5, 1, 1.5, '#81c784'); P(ctx, 80.5, 14, 2, 1, '#ffffff');
    }
    // のれん（和）
    if (v === 1) {
      P(ctx, K, 2.5, W - K, 0.5, '#5d4037');
      for (let i = 0; i < 4; i++) { const nx = K + 0.5 + i * 5.25; P(ctx, nx, 3, 5, 4.5, '#2f4a8a'); P(ctx, nx, 6.5, 5, 1, '#263d72'); }
      P(ctx, K + 9, 4, 3, 2, '#f4f1ea'); P(ctx, K + 10, 4.5, 1, 1, '#2f4a8a');
    }
    // テーブルとあかり（4つ）
    for (const u of [1, 19, 37, 55]) {
      const T = V.table;
      floorShadow(ctx, u + 1, 16);
      chairSide(ctx, u + 3, 1, V.chair[0], V.chair[1]);
      chairSide(ctx, u + 15, -1, V.chair[0], V.chair[1]);
      box(ctx, u + 5.5, 17.5, 7, 0.75, T[0], T[1], T[2]);
      P(ctx, u + 8.75, 18.25, 0.5, 2.25, T[2]); P(ctx, u + 7.5, 20.5, 3, 0.5, T[2]);
      P(ctx, u + 6.5, 17, 2, 0.5, '#ffffff'); P(ctx, u + 9.5, 17, 2, 0.5, '#ffffff');
      P(ctx, u + 8.75, 16.25, 0.5, 0.75, ['#ffca28', '#e53935', '#81c784'][v]);
      if (v === 1) {
        // ちょうちん
        P(ctx, u + 8.75, 2, 0.5, 1.5, '#3b2a20'); P(ctx, u + 7.5, 3.5, 3, 3, '#e04a3a'); P(ctx, u + 7.5, 3.5, 3, 0.5, '#2b2220'); P(ctx, u + 7.5, 6, 3, 0.5, '#2b2220');
        P(ctx, u + 7.5, 4.5, 3, 0.25, '#ff8a70'); P(ctx, u + 8, 4, 0.5, 2, 'rgba(255,255,255,0.3)');
      } else pendant(ctx, u + 7.25, v === 0 ? '#d4893a' : '#f2f2f2', 3);
    }
    // メニュー
    if (v === 0) {
      box(ctx, 30.5, 6.5, 9, 6, '#2f3a34', '#4a5750', '#1f2722'); P(ctx, 30.5, 6.5, 9, 0.5, '#8d6a46'); P(ctx, 30.5, 12, 9, 0.5, '#8d6a46');
      P(ctx, 31.5, 7.5, 4, 0.5, '#f4f1ea'); P(ctx, 31.5, 8.75, 6, 0.25, '#cfd8d3'); P(ctx, 31.5, 9.75, 5, 0.25, '#cfd8d3'); P(ctx, 31.5, 10.75, 6.5, 0.25, '#cfd8d3');
      P(ctx, 37, 7.5, 1.5, 1, '#ffcc80');
    } else if (v === 1) {
      box(ctx, 21.5, 7, 21, 0.75, '#9e7650', '#b98f66', '#7d5a3a');
      for (let i = 0; i < 8; i++) {
        const mx = 22.5 + i * 2.5, red = i % 3 === 1;
        P(ctx, mx, 7.75, 1.5, 3.5 + (i % 2) * 0.5, red ? '#fde9e4' : '#fbf6e8'); P(ctx, mx, 7.75, 1.5, 0.25, 'rgba(0,0,0,0.12)');
        P(ctx, mx + 0.5, 8.5, 0.5, 1, red ? '#c62828' : '#3b2a20'); P(ctx, mx + 0.5, 10, 0.5, 0.5, red ? '#c62828' : '#3b2a20');
      }
    } else {
      frameArt(ctx, 23, 7, 6, 5, 'pic'); frameArt(ctx, 41, 7, 6, 5, 'hill'); frameArt(ctx, 59, 7, 6, 5, 'sunset');
    }
  },
  shop(ctx, W, s, v, reg) {
    const V = [
      { wall: '#fdf0ea', sign: ['#ef5350', '#ffffff'], floor: ['#e2d6cc', '#cfc1b4', 'tile'] },
      { wall: '#eef1f6', sign: ['#2f3a4f', '#e8c247'], floor: ['#b7a28a', '#9e8a73', 'plank'] },
      { wall: '#eef6ea', sign: ['#6aa84f', '#ffffff'], floor: ['#cfc6b2', '#b8ae99', 'tile'] },
    ][v];
    frame(ctx, W, { wall: V.wall, stripe: 'rgba(0,0,0,0.03)', gap: 2, base: '#8f8478', floor: V.floor });
    // 看板の帯
    P(ctx, 0, 2.5, W, 2, V.sign[0]);
    if (v === 0) for (let x = 0; x < W; x += 3) P(ctx, x + 1.5, 2.5, 1.5, 2, V.sign[1]);
    else { P(ctx, 0, 2.5, W, 0.5, 'rgba(255,255,255,0.25)'); for (let x = 4; x < W; x += 8) P(ctx, x, 3.25, 3, 0.5, V.sign[1]); }
    P(ctx, 0, 4.5, W, 0.5, 'rgba(0,0,0,0.15)');
    if (s === 'vacant') { vacantSign(ctx, W); return; }
    for (const lx of [8, 24, 40]) ceilLamp(ctx, lx, 4);
    if (v === 0) {
      // 雑貨のたな
      for (const sx of [2, 17.5, 33]) {
        floorShadow(ctx, sx, 13);
        P(ctx, sx, 6.5, 13, 14.5, '#e9dccd'); P(ctx, sx, 6.5, 0.5, 14.5, '#a88464'); P(ctx, sx + 12.5, 6.5, 0.5, 14.5, '#8a6a4e');
        P(ctx, sx, 6.5, 13, 0.5, '#a88464');
        for (const [k, y] of [[0, 10], [1, 14], [2, 18]]) {
          P(ctx, sx, y, 13, 0.75, '#b8926c'); P(ctx, sx, y, 13, 0.25, '#d6b28a');
          for (let i = 0; i < 6; i++) {
            const c = ITEM[(i * 3 + k * 2 + sx) % ITEM.length], ix = sx + 0.75 + i * 2;
            const h = 1.5 + ((i + k) % 3) * 0.5;
            if ((i + k) % 3 === 0) { P(ctx, ix, y - h, 1.5, h, c); P(ctx, ix, y - h, 1.5, 0.5, 'rgba(255,255,255,0.45)'); }
            else if ((i + k) % 3 === 1) { P(ctx, ix + 0.25, y - 2, 1, 2, c); P(ctx, ix + 0.25, y - 2.5, 1, 0.5, '#f4f4f4'); }
            else { P(ctx, ix, y - 1.5, 1.5, 1.5, c); P(ctx, ix + 0.25, y - 2, 0.5, 0.5, c); P(ctx, ix + 1, y - 2, 0.5, 0.5, c); P(ctx, ix + 0.5, y - 1, 0.5, 0.5, '#2b2233'); }
          }
        }
        P(ctx, sx, 20, 13, 1, '#8a6a4e');
      }
    } else if (v === 1) {
      // ハンガーラック
      P(ctx, 2, 6.5, 20, 0.5, '#9aa0a8'); P(ctx, 2.5, 7, 0.5, 14, '#9aa0a8'); P(ctx, 21, 7, 0.5, 14, '#9aa0a8'); P(ctx, 1.5, 20.5, 2, 0.5, '#6d737b'); P(ctx, 20.5, 20.5, 2, 0.5, '#6d737b');
      for (let i = 0; i < 7; i++) {
        const hx = 3.5 + i * 2.5, c = ['#e57373', '#5c8fd6', '#f2f2f2', '#81c784', '#ffb74d', '#9575cd', '#4db6ac'][i];
        const len = 6 + (i % 3) * 1.5;
        P(ctx, hx + 0.75, 6.5, 0.5, 1, '#6d737b');
        P(ctx, hx, 7.5, 2, len, c); P(ctx, hx - 0.25, 7.5, 2.5, 1, c); P(ctx, hx, 7.5, 2, 0.5, 'rgba(255,255,255,0.35)'); P(ctx, hx + 1.5, 8, 0.5, len - 0.5, 'rgba(0,0,0,0.12)');
      }
      // マネキン
      P(ctx, 25.5, 6.5, 2, 2, '#e8dcd0'); P(ctx, 24.5, 9, 4, 5.5, '#c94f6d'); P(ctx, 24.5, 9, 4, 0.5, '#e07090'); P(ctx, 25, 14.5, 3, 3, '#c94f6d');
      P(ctx, 26.25, 17.5, 0.5, 3, '#9aa0a8'); P(ctx, 25, 20.5, 3, 0.5, '#6d737b'); floorShadow(ctx, 24.5, 4);
      // たたんだ服の台
      box(ctx, 31, 16.5, 13, 4.5, '#c9b49a', '#ddcab2', '#a8937a'); floorShadow(ctx, 31, 13);
      for (let i = 0; i < 4; i++) for (let k = 0; k < 3 - (i % 2); k++) { const c = ['#5c8fd6', '#f2f2f2', '#e57373', '#81c784'][(i + k) % 4]; P(ctx, 32 + i * 3, 15.75 - k * 0.75, 2.5, 0.75, c); P(ctx, 32 + i * 3, 15.75 - k * 0.75, 2.5, 0.25, 'rgba(255,255,255,0.35)'); }
      // かがみ
      box(ctx, 45.5, 6, 3, 14.5, '#b8926c', '#d6b28a', '#8a6a4e'); P(ctx, 46, 6.5, 2, 13.5, '#cfe6f2'); P(ctx, 46.5, 7.5, 0.5, 4, 'rgba(255,255,255,0.7)');
    } else {
      // 花屋
      for (const [bx, n] of [[2, 4], [19, 4], [35, 3]]) {
        for (let t = 0; t < 2; t++) {
          const ty = t ? 18 : 13.5, tx = bx + (t ? 0 : 1.5), tw = n * 3.5 + (t ? 1 : -2);
          P(ctx, tx, ty, tw, 0.75, '#8d6a46'); P(ctx, tx, ty, tw, 0.25, '#b08a5f');
          P(ctx, tx + 0.5, ty + 0.75, 0.5, 21 - ty - 0.75, '#6d5034'); P(ctx, tx + tw - 1, ty + 0.75, 0.5, 21 - ty - 0.75, '#6d5034');
          const cnt = t ? n : n - 1;
          for (let i = 0; i < cnt; i++) {
            const fx = tx + 0.75 + i * 3.5, c = ITEM[(i * 2 + t * 3 + bx) % ITEM.length];
            box(ctx, fx, ty - 2, 2.5, 2, '#a8b4c0', '#c8d2dc', '#7f8b98');
            P(ctx, fx + 0.5, ty - 3.5, 0.5, 1.5, '#3f8a3a'); P(ctx, fx + 1.5, ty - 4, 0.5, 2, '#3f8a3a');
            P(ctx, fx - 0.25, ty - 4.5, 1.5, 1.5, c); P(ctx, fx + 1.25, ty - 5, 1.5, 1.5, c); P(ctx, fx + 0.5, ty - 5.5, 1.5, 1, c);
            P(ctx, fx + 0.25, ty - 4.25, 0.5, 0.5, '#fff59d'); P(ctx, fx + 1.75, ty - 4.75, 0.5, 0.5, '#fff59d');
          }
        }
        floorShadow(ctx, bx, n * 3.5 + 1);
      }
      // つり下げの植木
      for (const hx of [12, 29, 44]) { P(ctx, hx + 1, 5, 0.5, 1.5, '#7a6a5a'); box(ctx, hx, 6.5, 2.5, 1.5, '#c47a48', '#e0975f', '#9a5a33'); P(ctx, hx - 0.5, 8, 1, 2.5, '#43a047'); P(ctx, hx + 1, 8, 0.5, 3.5, '#2e8b3e'); P(ctx, hx + 2, 8, 1, 2, '#4caf50'); }
    }
    // レジ（店員さんは動く絵）
    box(ctx, 50, 16, 13, 0.75, '#d6dbe2', '#eef1f5', '#aab2bd');
    P(ctx, 50, 16.75, 13, 4.25, ['#c75b5b', '#3f4a5f', '#6b8e5a'][v]); P(ctx, 50, 16.75, 13, 0.5, 'rgba(0,0,0,0.2)');
    for (let x = 52; x < 62; x += 3) P(ctx, x, 17.5, 0.5, 3, 'rgba(255,255,255,0.12)');
    box(ctx, 51, 13, 4, 3, '#4b5160', '#686f80', '#353a45'); P(ctx, 51.5, 13.5, 2, 1, '#9ad39a'); P(ctx, 51.5, 15, 3, 0.5, '#2b303b');
    P(ctx, 56, 14.5, 3, 1.5, ['#ffcc80', '#e0e0e0', '#a5d6a7'][v]); P(ctx, 56, 14.5, 3, 0.5, 'rgba(255,255,255,0.4)');
    floorShadow(ctx, 50, 13);
  },
  single(ctx, W, s, v, reg) {
    frame(ctx, W, { wall: '#ece3f1', stripe: 'rgba(140,100,170,0.10)', gap: 2, base: '#7d6a86', floor: ['#8a7398', '#76618a', 'fleck'] });
    hotelBed(ctx, 2, s, '#7e57c2', '#9575cd', '#6a46ad');
    frameArt(ctx, 6, 5.5, 7, 5, 'sea');
    nightstand(ctx, 18.5, s);
    win(ctx, reg, 24, 4.5, 6.5, 7.5, '#efe9f2');
    // 机といす
    box(ctx, 23.5, 17.5, 7.5, 0.75, '#b5835a', '#cf9d72', '#8f6340'); P(ctx, 24, 18.25, 0.5, 2.75, '#8f6340'); P(ctx, 30, 18.25, 0.5, 2.75, '#8f6340');
    P(ctx, 28.5, 16, 1.5, 1.5, '#ffffff'); P(ctx, 28.5, 16, 1.5, 0.5, '#e1e1e1');
    floorShadow(ctx, 23.5, 7.5);
    if (s === 'dirty') { towel(ctx, 25, 20.5); P(ctx, 27, 16.5, 1, 1, '#a1887f'); P(ctx, 25, 17, 1.5, 0.5, '#e57373'); }
    else { P(ctx, 24.5, 17, 2, 0.5, '#f4f1ea'); P(ctx, 25, 16.75, 1, 0.25, '#e8c247'); }
  },
  twin(ctx, W, s, v, reg) {
    frame(ctx, W, { wall: '#f1e6d4', stripe: 'rgba(170,130,80,0.10)', gap: 2, base: '#8a7058', floor: ['#7f8a6e', '#6c765c', 'fleck'] });
    hotelBed(ctx, 2, s, '#4f8fbf', '#6fa8d3', '#3d779f');
    hotelBed(ctx, 24, s, '#4f8fbf', '#6fa8d3', '#3d779f');
    nightstand(ctx, 18.5, s);
    frameArt(ctx, 7, 5.5, 6, 4.5, 'hill'); frameArt(ctx, 29, 5.5, 6, 4.5, 'hill');
    win(ctx, reg, 40.5, 4.5, 6, 7.5, '#f4eee4');
    // 荷物台
    P(ctx, 40.5, 18, 6, 0.75, '#b5835a'); P(ctx, 41, 18.75, 0.5, 2.25, '#8f6340'); P(ctx, 45.5, 18.75, 0.5, 2.25, '#8f6340');
    if (s === 'dirty') { box(ctx, 41, 15, 5, 3, '#4b5e8a', '#6a7da8', '#36456a'); P(ctx, 41, 15, 5, 0.5, '#e8c247'); towel(ctx, 19, 20.5); }
    floorShadow(ctx, 40.5, 6);
  },
  housekeeping(ctx, W) {
    frame(ctx, W, { wall: '#e2f2ef', low: '#cfe7e2', lowY: 13.5, lowHi: '#f2faf8', lowLo: '#b5d6cf', base: '#6f8e89', floor: ['#b9c7c4', '#a2b2ae', 'tile'] });
    for (let x = 0; x < W; x += 2) P(ctx, x, 13.5, 0.25, 6.5, 'rgba(0,0,0,0.05)');
    for (const lx of [6, 30]) ceilLamp(ctx, lx, 5);
    // せんたく機（ドラムは動く絵）
    for (const x of [2, 11]) {
      floorShadow(ctx, x, 8);
      box(ctx, x, 12.5, 8, 8.5, '#f4f6f8', '#ffffff', '#c3cad3');
      P(ctx, x, 14, 8, 0.25, '#c3cad3'); P(ctx, x + 0.5, 13, 2.5, 0.5, '#4b5160'); P(ctx, x + 5.5, 13, 0.75, 0.75, '#26a69a'); P(ctx, x + 6.5, 13, 0.75, 0.75, '#ffca28');
      P(ctx, x + 1.5, 15, 5, 5, '#9aa3ab'); P(ctx, x + 2, 15.5, 4, 4, '#3a4a5a'); P(ctx, x + 2, 15.5, 4, 0.5, '#5a6a7a');
      P(ctx, x + 1.5, 15, 0.5, 0.5, '#f4f6f8'); P(ctx, x + 6, 15, 0.5, 0.5, '#f4f6f8'); P(ctx, x + 1.5, 19.5, 0.5, 0.5, '#f4f6f8'); P(ctx, x + 6, 19.5, 0.5, 0.5, '#f4f6f8');
      P(ctx, x + 2.5, 16, 1, 1, 'rgba(255,255,255,0.35)');
    }
    // タオルのたな
    P(ctx, 21, 4, 13, 17, '#d8c4a6'); P(ctx, 21, 4, 0.5, 17, '#a88a62'); P(ctx, 33.5, 4, 0.5, 17, '#8a6e4a');
    for (const [k, y] of [[0, 8], [1, 12.5], [2, 17], [3, 20.5]]) {
      P(ctx, 21, y, 13, 0.75, '#b08a5f'); P(ctx, 21, y, 13, 0.25, '#cfa97c');
      if (k === 3) continue;
      for (let i = 0; i < 4; i++) {
        const c = ['#ffffff', '#9ad3e8', '#bfe8c8', '#ffffff'][(i + k) % 4];
        for (let j = 0; j < 3; j++) { P(ctx, 22 + i * 3, y - 1 - j, 2.5, 1, c); P(ctx, 22 + i * 3, y - 1 - j, 2.5, 0.25, 'rgba(255,255,255,0.6)'); P(ctx, 22 + i * 3, y - 0.25 - j, 2.5, 0.25, 'rgba(0,0,0,0.10)'); }
      }
    }
    // カート
    floorShadow(ctx, 37, 9);
    P(ctx, 37.5, 12, 0.5, 8, '#9aa0a8'); P(ctx, 37, 12, 1.5, 0.5, '#9aa0a8');
    box(ctx, 38, 13, 8, 6, '#5aa8a0', '#7cc4bc', '#3f8a82'); P(ctx, 38.5, 13.5, 7, 0.5, '#ffffff');
    P(ctx, 39, 11.5, 2.5, 1.5, '#ffffff'); P(ctx, 42, 11.5, 2.5, 1.5, '#9ad3e8');
    P(ctx, 38, 19, 8, 0.75, '#6d737b'); P(ctx, 38.5, 20, 1, 1, '#2b2f36'); P(ctx, 44.5, 20, 1, 1, '#2b2f36');
  },
  security(ctx, W) {
    frame(ctx, W, { wall: '#cfd7df', stripe: 'rgba(0,0,0,0.04)', gap: 2, low: '#b7c2cd', lowY: 15.5, lowHi: '#dde4ea', lowLo: '#9aa7b4', base: '#56606c', floor: ['#6f7b88', '#5e6975', 'fleck'] });
    for (const lx of [8, 24, 46]) ceilLamp(ctx, lx, 5);
    // モニターのかべ（画面は動く絵）
    P(ctx, 1.5, 3, 29.5, 11, '#3b434e'); P(ctx, 1.5, 3, 29.5, 0.5, '#566070');
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const x = 2.5 + c * 9.5, y = 3.75 + r * 5;
      box(ctx, x, y, 8.5, 4.5, '#1c2026', '#2e343e', '#121418');
      P(ctx, x + 0.5, y + 0.5, 7.5, 3.5, '#22303a');
    }
    // 机
    floorShadow(ctx, 1.5, 30);
    box(ctx, 1.5, 16.5, 30, 1, '#8a96a3', '#a8b3bf', '#6b7683');
    P(ctx, 1.5, 17.5, 30, 3.5, '#5d6874'); P(ctx, 1.5, 17.5, 30, 0.5, 'rgba(0,0,0,0.2)');
    for (let i = 0; i < 12; i++) P(ctx, 3 + i * 1.5, 16.75, 0.75, 0.5, ITEM[i % ITEM.length]);
    P(ctx, 22, 15, 0.5, 1.5, '#2b303b'); P(ctx, 21.5, 14.5, 1.5, 0.75, '#2b303b');
    P(ctx, 26.5, 15.5, 1, 1, '#ffffff'); P(ctx, 27.5, 15.75, 0.5, 0.5, '#d0d0d0');
    for (let x = 6; x < 31; x += 6) P(ctx, x, 18.5, 2, 0.5, '#4a545f');
    // いす（警備員さんは動く絵で左むきにすわる）
    P(ctx, 37, 13, 1, 6.5, '#2b303b'); P(ctx, 32.5, 19, 5, 0.75, '#2b303b'); P(ctx, 32.5, 19, 5, 0.25, '#4b5160');
    P(ctx, 34.75, 19.75, 0.5, 0.75, '#555b66'); P(ctx, 33, 20.5, 4.5, 0.5, '#3b3f48');
    // かぎの箱
    box(ctx, 40.5, 5.5, 5, 5.5, '#9aa4b2', '#b9c1cc', '#7c8594'); P(ctx, 41, 6, 4, 4.5, '#2f3640');
    for (let i = 0; i < 6; i++) P(ctx, 41.5 + (i % 3) * 1.25, 6.75 + Math.floor(i / 3) * 2, 0.5, 1, '#e8c247');
    // 非常ベル
    P(ctx, 42, 13, 2, 2, '#d84343'); P(ctx, 42.5, 13.5, 1, 1, '#ff8a80');
    // ロッカー
    for (let i = 0; i < 3; i++) {
      const lx = 48.5 + i * 4.5;
      box(ctx, lx, 5, 4.5, 16, '#8fa0ae', '#adbcc8', '#6e7f8d');
      for (let y = 6; y < 9; y += 0.75) P(ctx, lx + 1, y, 2.5, 0.25, '#6e7f8d');
      P(ctx, lx + 3.25, 12, 0.5, 1.5, '#4b5866');
    }
    floorShadow(ctx, 48.5, 13.5);
  },
  clinic(ctx, W) {
    frame(ctx, W, { wall: '#f3f8fb', low: '#dcecf4', lowY: 15, lowHi: '#ffffff', lowLo: '#c1d9e5', base: '#8aa4b2', floor: ['#cfdde5', '#b9cbd5', 'tile'] });
    for (const lx of [8, 24, 44]) ceilLamp(ctx, lx, 6);
    // 十字の看板
    box(ctx, 2.5, 4.5, 6, 6, '#ffffff', null, '#d0dbe3'); P(ctx, 4.75, 5.25, 1.5, 4.5, '#e53935'); P(ctx, 3.25, 6.75, 4.5, 1.5, '#e53935');
    // カーテンレールとカーテン
    P(ctx, 10, 3, 23, 0.5, '#9aa8b4');
    for (let i = 0; i < 6; i++) P(ctx, 28 + i * 0.75, 3.5, 0.75, 16, i % 2 ? '#a9daf2' : '#c9e8f7');
    P(ctx, 28, 3.5, 4.5, 0.5, '#88c4e2');
    // 診察のベッド
    floorShadow(ctx, 11, 16);
    P(ctx, 11, 17.5, 16, 1.5, '#ffffff'); P(ctx, 11, 17.5, 16, 0.5, '#eef4f8'); P(ctx, 16, 17, 11, 1, '#a5d6a7'); P(ctx, 16, 17, 11, 0.25, '#c8e6c9');
    P(ctx, 11.5, 16, 4, 1.5, '#ffffff'); P(ctx, 11.5, 16, 4, 0.5, '#f4f4f4');
    P(ctx, 11, 19, 16, 0.75, '#b0bec5'); P(ctx, 12, 19.75, 0.5, 1.25, '#90a4ae'); P(ctx, 25.5, 19.75, 0.5, 1.25, '#90a4ae');
    // 心電図のモニター（線は動く絵）
    P(ctx, 35.5, 13.5, 0.5, 7, '#90a4ae'); P(ctx, 34, 20.5, 3.5, 0.5, '#78909c');
    box(ctx, 33.5, 10, 5, 3.5, '#3b434e', '#566070', '#262b33'); P(ctx, 34, 10.5, 4, 2.5, '#0f2a22');
    // 薬のたな
    floorShadow(ctx, 47, 15);
    box(ctx, 47, 5, 15, 16, '#e6ecef', '#ffffff', '#bfcbd2');
    P(ctx, 47.5, 5.5, 14, 7.5, '#d6eef6'); P(ctx, 54.25, 5.5, 0.5, 7.5, '#bfcbd2');
    for (const y of [8.75, 13]) P(ctx, 47.5, y, 14, 0.5, '#bfcbd2');
    for (let i = 0; i < 6; i++) {
      const bx = 48 + i * 2.25 + (i >= 3 ? 0.5 : 0);
      P(ctx, bx, 7, 1.25, 1.75, ['#ef9a9a', '#90caf9', '#fff59d', '#a5d6a7', '#ce93d8', '#ffcc80'][i]); P(ctx, bx, 6.5, 1.25, 0.5, '#ffffff');
      P(ctx, bx + 0.25, 11, 1, 2, ['#90caf9', '#fff59d', '#a5d6a7', '#ef9a9a', '#ffcc80', '#ce93d8'][i]); P(ctx, bx + 0.25, 10.5, 1, 0.5, '#e0e0e0');
    }
    P(ctx, 47.5, 6, 0.5, 6, 'rgba(255,255,255,0.7)');
    P(ctx, 54.25, 13.5, 0.5, 7, '#bfcbd2'); P(ctx, 53.25, 16.5, 0.5, 1.5, '#8aa4b2'); P(ctx, 55.25, 16.5, 0.5, 1.5, '#8aa4b2');
  },
  parking(ctx, W) {
    P(ctx, 0, 0, W, FLOOR_H, '#6c717a');
    for (let y = 4; y < 20; y += 4) P(ctx, 0, y, W, 0.25, 'rgba(0,0,0,0.10)');
    for (let x = 0; x < W; x += 16) { P(ctx, x + 0.5, 2, 2.5, 19, '#80858e'); P(ctx, x + 0.5, 2, 0.5, 19, '#959aa3'); P(ctx, x + 2.5, 2, 0.5, 19, '#5d626a'); for (let y = 15; y < 20; y += 2) P(ctx, x + 0.5, y, 2.5, 1, '#e8c247'), P(ctx, x + 0.5, y + 1, 2.5, 1, '#2b2b30'); }
    P(ctx, 0, 0, W, 1.5, '#3d4048'); P(ctx, 0, 1.5, W, 0.5, '#555a63');
    P(ctx, 0, 2.5, W, 0.75, '#8a7f6e'); P(ctx, 0, 2.5, W, 0.25, '#a89c88');
    for (const lx of [6, 22, 38, 54]) { P(ctx, lx, 3.25, 5, 0.5, '#d8dde4'); P(ctx, lx + 0.5, 3.75, 4, 0.5, '#f4fbff'); P(ctx, lx - 1, 4.25, 7, 1.5, 'rgba(230,245,255,0.10)'); }
    for (let i = 0; i < 4; i++) {
      const nx = 7 + i * 16;
      P(ctx, nx, 7, 3, 3, '#ffffff'); P(ctx, nx + 0.5, 7.5, 2, 2, '#4b5160');
      for (let k = 0; k <= i; k++) P(ctx, nx + 0.75 + k * 0.5, 8, 0.25, 1, '#ffffff');
    }
    P(ctx, 4, 5, 2.5, 2.5, '#1e5fb0'); P(ctx, 4.75, 5.5, 0.5, 1.5, '#ffffff'); P(ctx, 5.25, 5.5, 0.5, 0.75, '#ffffff');
    P(ctx, 0, 21, W, 1, '#43474e'); P(ctx, 0, 21, W, 0.5, '#4f545b');
    for (let x = 0; x <= W; x += 16) P(ctx, Math.min(x, W - 1), 21, 1, 0.5, '#e8e8e8');
    for (let i = 0; i < 4; i++) { P(ctx, 4 + i * 16, 20.5, 8, 0.5, '#d8c040'); P(ctx, 4 + i * 16, 20.5, 8, 0.25, '#f0dc68'); }
    P(ctx, 0, 22, W, 2, '#3a3c42'); P(ctx, 0, 22, W, 0.5, '#4a4d54');
    P(ctx, 0, 0, 0.5, FLOOR_H, 'rgba(0,0,0,0.35)');
  },
};

function hotelBed(ctx, x, s, c, hi, lo) {
  // 長さ15・高さ17.5。左がまくら
  box(ctx, x, 12.5, 1.5, 8.5, '#6d4c41', '#8d6a5e', '#50362d');
  P(ctx, x + 0.5, 13, 0.5, 1, 'rgba(255,255,255,0.18)');
  P(ctx, x + 1.5, 17.5, 14, 2, '#fafafa'); P(ctx, x + 1.5, 19.5, 14, 1, '#8d6e63'); P(ctx, x + 1.5, 19.5, 14, 0.5, '#a88a7e');
  P(ctx, x + 2, 20.5, 0.5, 0.5, '#50362d'); P(ctx, x + 14.5, 20.5, 0.5, 0.5, '#50362d');
  floorShadow(ctx, x, 15.5);
  if (s === 'dirty') {
    P(ctx, x + 2.5, 16, 4, 1.5, '#ffffff'); P(ctx, x + 2.5, 16, 4, 0.5, '#ececec');
    P(ctx, x + 6.5, 16.5, 3, 1.5, hi); P(ctx, x + 9, 15.5, 4, 2.5, c); P(ctx, x + 12.5, 16.5, 3, 1.5, lo); P(ctx, x + 9.5, 15.5, 2, 0.5, hi);
    P(ctx, x + 14.5, 17.5, 1.5, 3, c); P(ctx, x + 6.5, 17.5, 2, 0.5, '#e0e0e0');
    P(ctx, x + 10, 17, 1, 0.5, lo);
  } else {
    P(ctx, x + 2, 15.5, 4, 2, '#ffffff'); P(ctx, x + 2, 15.5, 4, 0.5, '#f4f4f4'); P(ctx, x + 2, 17, 4, 0.5, '#e3e3e3');
    P(ctx, x + 6, 16.5, 9.5, 2.5, c); P(ctx, x + 6, 16.5, 9.5, 0.5, '#ffffff'); P(ctx, x + 6, 17, 9.5, 0.5, hi);
    P(ctx, x + 15, 17, 0.5, 2.5, lo);
    P(ctx, x + 11, 15.75, 2.5, 0.75, '#ffffff'); P(ctx, x + 11, 16.25, 2.5, 0.25, '#dcdcdc');
  }
}
function nightstand(ctx, x, s) {
  box(ctx, x, 17.5, 4, 3.5, '#a87d55', '#c49770', '#82593a'); P(ctx, x + 0.5, 19, 3, 0.25, '#82593a'); P(ctx, x + 1.75, 18.25, 0.5, 0.5, '#e8c247');
  P(ctx, x + 1.5, 15.5, 1, 2, '#9e9e9e'); P(ctx, x + 0.75, 13.5, 2.5, 2, '#ffe9a8'); P(ctx, x + 0.75, 13.5, 2.5, 0.5, '#fff7d6');
  if (s === 'dirty') { P(ctx, x + 2.75, 16.5, 1, 1, '#ffffff'); P(ctx, x + 2.75, 16.5, 1, 0.5, '#a1887f'); }
}
function towel(ctx, x, y) { P(ctx, x, y, 3, 0.5, '#ffffff'); P(ctx, x + 0.5, y - 0.5, 1.5, 0.5, '#eeeeee'); }

export function facilitySprite(type, state = '', variant = 0) {
  variant = type === 'stairs' ? 0 : variant % 3;
  const key = `${type}|${state}|${variant}`;
  let c = cache.get(key);
  if (c) return c;
  const W = (type === 'lobby' ? 4 : FAC[type].w) * TILE_W;
  const [cv, ctx] = mk(W, FLOOR_H);
  const reg = [];
  DRAW[type](ctx, W, state, variant, reg);
  WIN.set(`${type}|${variant}`, reg);
  cache.set(key, cv);
  return cv;
}
export function spriteW(type) { return (type === 'lobby' ? 4 : FAC[type].w) * TILE_W; }

// ロビーのはしの自動ドア（幅6）
export function drawDoor(ctx, x, y) {
  P(ctx, x - 0.5, y + 5.5, 7, 15.5, '#5f6d79'); P(ctx, x - 0.5, y + 5.5, 7, 0.5, '#8392a0');
  P(ctx, x, y + 6.5, 6, 14, '#a9d4ec'); P(ctx, x, y + 6.5, 6, 5, '#93c6e6');
  P(ctx, x + 2.75, y + 6.5, 0.5, 14, '#5f6d79');
  P(ctx, x + 0.5, y + 7.5, 0.5, 3, 'rgba(255,255,255,0.6)'); P(ctx, x + 3.5, y + 7.5, 0.5, 3, 'rgba(255,255,255,0.6)');
  P(ctx, x + 2, y + 13, 0.5, 2.5, '#d8dde4'); P(ctx, x + 3.5, y + 13, 0.5, 2.5, '#d8dde4');
  P(ctx, x - 0.5, y + 4.5, 7, 1, '#3c4652'); P(ctx, x + 1, y + 4.75, 4, 0.5, '#7fd17a');
  P(ctx, x - 1, y + 21, 8, 0.5, '#6b4f3f');
}

// 部屋の中で人がいる場所 [x, y, しせい（0 立つ・1 すわる・2 ねる）, 左むき]
// 人のまん中は x+1.5
export function slots(type, W) {
  switch (type) {
    case 'office': return [[21.5, 12, 1, 1], [37.5, 12, 1, 1], [53.5, 12, 1, 1], [3, 14, 0], [8, 14, 0], [29, 14, 0]];
    case 'home': return [[3, 13, 2], [44, 10, 1], [48, 10, 1], [30, 14, 0], [8, 14, 0]];
    case 'food': return [[2.5, 11, 1], [14.5, 11, 1, 1], [20.5, 11, 1], [32.5, 11, 1, 1], [38.5, 11, 1], [50.5, 11, 1, 1], [56.5, 11, 1], [68.5, 11, 1, 1], [76, 14, 0], [82, 14, 0]];
    case 'shop': return [[8, 14, 0], [24, 14, 0], [39, 14, 0], [16, 14, 0], [31, 14, 0], [47, 14, 0]];
    case 'single': return [[3, 13, 2], [25, 14, 0]];
    case 'twin': return [[3, 13, 2], [25, 13, 2], [20, 14, 0], [41, 14, 0]];
    case 'housekeeping': return [[20, 14, 0], [34, 14, 0], [8, 14, 0], [15, 14, 0]];
    default: return [[Math.floor(W / 2), 14, 0]];
  }
}
// ねている人にかける毛布（頭のよこから、ベッドの足もとまで）
const BLANKET = { single: ['#7e57c2', '#9575cd', '#6a46ad'], twin: ['#4f8fbf', '#6fa8d3', '#3d779f'], home: null };
export function drawTuck(ctx, type, x, y, sx, v) {
  const c = BLANKET[type] || [['#e57373', '#ffffff', '#c95555'], ['#64b5f6', '#ffffff', '#4994d6'], ['#ffb74d', '#ffffff', '#e39a37']][v % 3];
  const bx = x + sx + 4.5, ex = x + sx + 14;
  P(ctx, bx, y + 15.5, ex - bx, 3.5, c[0]); P(ctx, bx, y + 15.5, ex - bx, 0.5, c[1]);
  P(ctx, bx + 1, y + 15, 5, 0.5, c[0]); P(ctx, bx + 1.5, y + 14.5, 3, 0.5, c[0]); P(ctx, bx + 1.5, y + 14.5, 3, 0.5, 'rgba(255,255,255,0.35)');
  P(ctx, bx, y + 16, 0.5, 3, c[2]); P(ctx, ex - 0.5, y + 16, 0.5, 3, c[2]);
}

// ---------- 動く絵（画面・湯気・いつもいる人） ----------
const STAFF = new Map();
function staffOf(o, kind) {
  const k = `${o.id}|${kind}`;
  let p = STAFF.get(k);
  if (!p) { p = { id: 9000 + o.id * 7 + kind.length, kind, look: o.id + kind.length }; STAFF.set(k, p); }
  return p;
}
const SCREEN = ['#4fb3e8', '#7ad08a', '#f0c060', '#e889a8'];
function clipDraw(ctx, x, y, w, h, fn) { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); fn(); ctx.restore(); }

// info：{ real, lit, dark, n（中の人）, h（時刻）, open }
export function drawLive(ctx, o, x, y, info) {
  const { real, lit, dark, n } = info;
  const v = o.id % 3;
  // 夜の窓
  if (dark > 0.25) {
    const reg = WIN.get(`${o.type}|${v}`);
    if (reg) for (const [wx, wy, ww, wh] of reg) {
      P(ctx, x + wx, y + wy, ww, wh, `rgba(14,20,56,${0.85 * dark})`);
      P(ctx, x + wx + ww * 0.3, y + wy + wh * 0.3, 0.5, 0.5, `rgba(255,250,220,${dark})`);
      P(ctx, x + wx + ww - 1.5, y + wy + wh - 1.5, 0.5, 0.5, `rgba(255,214,120,${dark})`);
    }
  }
  if (o.occupied === false) return;
  const t = real / 1000;
  switch (o.type) {
    case 'office': {
      if (!lit) break;
      [23, 39, 55].forEach((cx, i) => {
        if (i >= n) return;
        const sx = x + cx - 7.5, sy = y + 13;
        P(ctx, sx, sy, 4, 2.75, i % 2 ? '#3f86c4' : '#4a9bd8');
        P(ctx, sx, sy, 4, 0.5, '#2b5f94');
        const k = Math.floor(t * 2 + i * 1.3) % 4;
        for (let r = 0; r < 3; r++) P(ctx, sx + 0.5, sy + 0.75 + r * 0.6, 1 + ((r + k) % 3) * 0.9, 0.25, '#dff2ff');
        P(ctx, sx + 0.5 + ((k * 0.9) % 2.5), sy + 0.75 + (k % 3) * 0.6, 0.25, 0.25, '#ffffff');
      });
      break;
    }
    case 'home': {
      const tv = lit && n > 0 && info.h >= 7 && info.h < 23.5;
      if (tv) {
        const k = Math.floor(t / 1.6 + o.id) % 4;
        P(ctx, x + 57.5, y + 12, 5.5, 4, SCREEN[k]);
        P(ctx, x + 57.5, y + 14.5, 5.5, 1.5, ['#2f7fb8', '#4f9a5a', '#c08a3a', '#b85a78'][k]);
        P(ctx, x + 58.5 + (Math.floor(t * 3) % 3), y + 13, 1, 1.5, '#ffffff');
        P(ctx, x + 56, y + 11, 8.5, 6, 'rgba(160,210,255,0.08)');
      }
      break;
    }
    case 'food': {
      if (!info.open) break;
      // 湯気
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.7 + i / 3) % 1;
        P(ctx, x + 87 + Math.sin(k * 6 + i) * 0.75, y + 10.5 - k * 5, 1, 1, `rgba(176,190,204,${0.8 * (1 - k)})`);
      }
      // コックさん（カウンターのうしろ）
      const chef = staffOf(o, 'chef');
      const side = Math.floor(t / 5 + o.id) % 3;
      const cx = x + [89, 87, 91][side];
      clipDraw(ctx, x + 74.5, y + 2.5, 21.5, 12.5, () => drawFigure(ctx, cx, y + 20.5, chef, 'stand', blinking(chef, real) ? 'blink' : 'happy', 0, side === 2));
      break;
    }
    case 'shop': {
      if (!info.open) break;
      const clerk = staffOf(o, 'clerk');
      clipDraw(ctx, x + 50, y + 2.5, 13, 13.5, () => drawFigure(ctx, x + 59.5, y + 20.5, clerk, 'stand', blinking(clerk, real) ? 'blink' : 'happy', 0, true, null));
      break;
    }
    case 'security': {
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
        const sx = x + 3 + c * 9.5, sy = y + 4.25 + r * 5;
        const k = Math.floor(t / 4 + r * 3 + c) % 4;
        P(ctx, sx, sy, 7.5, 3.5, ['#2f4a5c', '#3a5a4a', '#4a4a5c', '#3a4a62'][k]);
        P(ctx, sx, sy + 2.5, 7.5, 1, ['#4a6a7a', '#557a5f', '#66667a', '#55688a'][k]);
        P(ctx, sx + 1 + k * 1.5, sy + 1, 1, 1.5, '#9fc2d6');
        if (k === 1) P(ctx, sx + 4.5, sy + 0.5, 2, 2, '#2a3a32');
        const scan = (t * 1.5 + c * 0.3 + r * 0.5) % 1;
        P(ctx, sx, sy + scan * 3.5, 7.5, 0.25, 'rgba(255,255,255,0.12)');
        if ((Math.floor(t) + c + r) % 7 === 0) P(ctx, sx + 6.5, sy + 0.25, 0.5, 0.5, '#ff5252');
      }
      const guard = staffOf(o, 'guard');
      const look = Math.floor(t / 3 + o.id) % 4 === 3;
      drawFigure(ctx, x + 35, y + 21, guard, look ? 'sit' : 'work', blinking(guard, real) ? 'blink' : 'normal', 0, !look);
      break;
    }
    case 'clinic': {
      const sx = x + 34, sy = y + 10.5, k = (t * 0.8) % 1;
      for (let i = 0; i < 8; i++) {
        const px = i * 0.5, ph = (i / 8 - k + 1) % 1;
        const up = ph < 0.08 ? 1.5 : ph < 0.14 ? -0.75 : 0;
        P(ctx, sx + px, sy + 1.25 - up, 0.5, 0.5, '#5aff9a');
      }
      P(ctx, sx + 2.5, sy + 0.25, 1.25, 0.5, '#b8ffd2');
      const nurse = staffOf(o, 'nurse');
      drawFigure(ctx, x + 40.5, y + 21, nurse, 'stand', blinking(nurse, real) ? 'blink' : 'happy', 0, true);
      break;
    }
    case 'housekeeping': {
      if (n <= 0) break;
      for (const wx of [2, 11]) {
        const a = t * 5 + wx;
        for (let i = 0; i < 3; i++) {
          const ang = a + i * 2.1;
          P(ctx, x + wx + 3.75 + Math.cos(ang) * 1.25, y + 17.25 + Math.sin(ang) * 1.25, 0.75, 0.75, ['#ffffff', '#9ad3e8', '#f8bbd0'][i]);
        }
      }
      break;
    }
  }
}

// ---------- 駐車場の車（幅13・高さ7） ----------
const CAR_COLORS = [['#e53935', '#ff7a6e', '#b71c1c'], ['#1e88e5', '#64b5f6', '#1259a8'], ['#fdd835', '#fff176', '#c6a700'], ['#43a047', '#81c784', '#2e7031'], ['#f2f2f2', '#ffffff', '#bdbdbd'], ['#8e24aa', '#ba68c8', '#5e1675'], ['#fb8c00', '#ffb74d', '#c25e00']];
export function drawCar(ctx, x, y, n) {
  const [c, hi, lo] = CAR_COLORS[n % CAR_COLORS.length];
  P(ctx, x + 1.5, y + 6.5, 10.5, 0.5, 'rgba(0,0,0,0.35)');
  // 屋根とまど
  P(ctx, x + 3.5, y + 0.5, 6, 0.5, hi); P(ctx, x + 3, y + 1, 7, 2.25, c);
  P(ctx, x + 3.5, y + 1.25, 2.75, 1.75, '#bfe3f5'); P(ctx, x + 6.75, y + 1.25, 2.75, 1.75, '#bfe3f5');
  P(ctx, x + 3.5, y + 1.25, 1, 0.5, '#ffffff'); P(ctx, x + 6.75, y + 1.25, 1, 0.5, '#ffffff');
  // からだ
  P(ctx, x + 0.5, y + 3.25, 12, 2.5, c); P(ctx, x + 1, y + 3, 11, 0.5, hi); P(ctx, x + 0.5, y + 5.25, 12, 0.5, lo);
  P(ctx, x + 6.25, y + 3.5, 0.25, 2, lo); P(ctx, x + 7.5, y + 4, 0.75, 0.25, '#2b2b30');
  P(ctx, x + 12, y + 3.5, 0.5, 0.75, '#fff6b0'); P(ctx, x + 0.5, y + 3.5, 0.5, 0.75, '#e53935');
  // タイヤ
  for (const wx of [2, 8.5]) { P(ctx, x + wx, y + 4.75, 2.5, 2.25, '#1d1d22'); P(ctx, x + wx + 0.75, y + 5.5, 1, 0.75, '#a0a6ae'); }
}

// ボタン用の小さな絵
export function iconCanvas(type) {
  const W = type === 'lobby' || type === 'elevator' ? 32 : FAC[type].w * TILE_W;
  const [c, ctx] = mk(W, FLOOR_H);
  if (type === 'elevator') { ctx.drawImage(shaftFine(), 0, 0, 32, FLOOR_H); drawCarFine(ctx, 4, 3, { dwell: DWELL / 2, pass: [] }, 0, 0); }
  else ctx.drawImage(facilitySprite(type, type === 'single' || type === 'twin' ? 'clean' : 'occ', 0), 0, 0, W, FLOOR_H);
  if (type === 'parking') drawCar(ctx, 2, 14, 1);
  return c;
}
