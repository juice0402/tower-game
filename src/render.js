// 画面に描く（空・地面・ビル・人）
import { TILE_W, FLOOR_H, WIDTH, FAC, STAIRS_TIME, MAX_LEVEL, MIN_LEVEL, levelName } from './config.js';
import { facilitySprite, shaftSprite, carSprite, drawCar, drawPerson, drawSitter, drawSleeper, slots, SHIRT } from './sprites.js';

const TW = WIDTH * TILE_W;
export const topY = level => -(level + 1) * FLOOR_H;

function lerp(a, b, t) { return a + (b - a) * t; }
function mix(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const r = Math.round(lerp(a >> 16, b >> 16, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
  return `rgb(${r},${g},${bl})`;
}
// 1日の空の色 [時, 上, 下]
const SKY = [
  [0, '#0b1030', '#1d2550'], [4.5, '#0b1030', '#1d2550'], [6, '#3a4a8c', '#f6a96b'], [7.5, '#6fb6ea', '#cdeefd'],
  [16, '#6fb6ea', '#cdeefd'], [18, '#4a4e8a', '#f08a5d'], [19.5, '#141a40', '#30336b'], [24, '#0b1030', '#1d2550'],
];
function skyAt(h) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, t0, b0] = SKY[i], [h1, t1, b1] = SKY[i + 1];
    if (h >= h0 && h <= h1) { const t = (h - h0) / (h1 - h0 || 1); return [mix(t0, t1, t), mix(b0, b1, t)]; }
  }
  return [SKY[0][1], SKY[0][2]];
}
export function darkness(h) {
  if (h < 5) return 1; if (h < 7) return 1 - (h - 5) / 2;
  if (h < 17.5) return 0; if (h < 19.5) return (h - 17.5) / 2; return 1;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = { x: TW / 2, y: -FLOOR_H * 3, z: 2 };
    this.ghost = null;
    this.selected = null;
    this.showScore = false;
    this.dpr = 1;
    this.reach = new Map();
    this.reachVersion = -1;
    this.reachTime = 0;
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.vw = w; this.vh = h;
  }
  screenToWorld(sx, sy) {
    const z = this.cam.z;
    return { x: (sx - this.vw / 2) / z + this.cam.x, y: (sy - this.vh / 2) / z + this.cam.y };
  }
  pick(sx, sy) {
    const w = this.screenToWorld(sx, sy);
    return { tx: Math.floor(w.x / TILE_W), level: Math.floor(-w.y / FLOOR_H), wx: w.x, wy: w.y };
  }
  clampCam() {
    const minZ = Math.max(0.5, Math.min(this.vw / (TW + 64), 2));
    this.cam.z = Math.max(minZ, Math.min(6, this.cam.z));
    const halfW = this.vw / 2 / this.cam.z;
    this.cam.x = Math.max(Math.min(halfW - 40, TW / 2), Math.min(Math.max(TW - halfW + 40, TW / 2), this.cam.x));
    this.cam.y = Math.max(topY(MAX_LEVEL) - 60, Math.min(-MIN_LEVEL * FLOOR_H + 40, this.cam.y));
  }

  draw(game, real) {
    const ctx = this.ctx, z = this.cam.z, dpr = this.dpr;
    this.clampCam();
    const h = game.mod / 60;
    const dark = darkness(h);
    // 空（画面全体）
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const [skyTop, skyBot] = skyAt(h);
    const groundSy = (0 - this.cam.y) * z + this.vh / 2;
    const g = ctx.createLinearGradient(0, 0, 0, Math.max(1, groundSy * dpr));
    g.addColorStop(0, skyTop); g.addColorStop(1, skyBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    const ox = this.vw / 2 - this.cam.x * z, oy = this.vh / 2 - this.cam.y * z;
    ctx.setTransform(z * dpr, 0, 0, z * dpr, ox * dpr, oy * dpr);
    ctx.imageSmoothingEnabled = false;
    const view = { x0: (0 - ox) / z, x1: (this.vw - ox) / z, y0: (0 - oy) / z, y1: (this.vh - oy) / z };

    this.drawBackdrop(ctx, view, h, dark, real);
    // 見えている階
    const lTop = Math.min(MAX_LEVEL, Math.floor(-view.y0 / FLOOR_H) + 1);
    const lBot = Math.max(MIN_LEVEL, Math.floor(-view.y1 / FLOOR_H) - 1);

    if (this.ghost) this.drawGrid(ctx, view, game, lBot, lTop);

    // 部屋の中の人を数える
    const inside = new Map();
    for (const p of game.people) {
      if (p.gone || p.st !== 'stay') continue;
      let a = inside.get(p.at);
      if (!a) { a = []; inside.set(p.at, a); }
      a.push(p);
    }
    this.updateReach(game, real);

    for (const o of game.world.objects.values()) {
      if (o.type === 'elevator') { this.drawElevator(ctx, game, o, lBot, lTop, dark); continue; }
      if (o.level < lBot || o.level > lTop) continue;
      if (o.x * TILE_W > view.x1 || (o.x + o.w) * TILE_W < view.x0) continue;
      this.drawFacility(ctx, game, o, inside.get(o.id) || [], dark, h, real);
    }
    // 歩いている人
    const fr = Math.floor(real / 180);
    for (const p of game.people) {
      if (p.gone) continue;
      if (p.level < lBot || p.level > lTop + 1) continue;
      if (p.st === 'walk') {
        drawPerson(ctx, p.x * TILE_W - 1, topY(p.level) + 14, p, (fr + p.id) % 2, SHIRT[p.kind]);
      } else if (p.st === 'stairs') {
        const st = game.world.objects.get(p.tid);
        if (!st) continue;
        const k = Math.max(0, Math.min(1, 1 - p.timer / STAIRS_TIME));
        const up = p.tTo > p.tFrom;
        const t = up ? k : 1 - k;
        const baseY = topY(st.level) + 14;
        drawPerson(ctx, st.x * TILE_W + t * 14, baseY - t * FLOOR_H, p, (fr + p.id) % 2, SHIRT[p.kind]);
      }
    }
    this.drawWaiting(ctx, game, lBot, lTop, real);
    // ゴーストと選択
    if (this.selected) {
      const o = game.world.objects.get(this.selected);
      if (o) {
        const lo = o.type === 'elevator' ? o.bottom : o.level, hi = o.type === 'elevator' ? o.top : o.level;
        ctx.strokeStyle = '#ffeb3b'; ctx.lineWidth = 1;
        ctx.strokeRect(o.x * TILE_W + 0.5, topY(hi) + 0.5, o.w * TILE_W - 1, (hi - lo + 1) * FLOOR_H - 1);
      } else this.selected = null;
    }
    if (this.ghost) this.drawGhost(ctx, this.ghost);

    // 階の数字（画面の左）
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '10px "DotGothic16", monospace';
    ctx.textBaseline = 'middle';
    for (let l = lBot; l <= lTop; l++) {
      const sy = (topY(l) + FLOOR_H / 2) * z + oy;
      if (sy < 46 || sy > this.vh - 4) continue;
      const label = levelName(l);
      ctx.fillStyle = 'rgba(15,20,40,0.55)';
      ctx.fillRect(2, sy - 7, label.length * 6 + 6, 14);
      ctx.fillStyle = '#fff';
      ctx.fillText(label, 5, sy + 0.5);
    }
  }

  drawBackdrop(ctx, v, h, dark, real) {
    // 雲
    if (dark < 0.8) {
      ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - dark)})`;
      for (let i = 0; i < 7; i++) {
        const cy = -140 - i * 170 - (i % 3) * 40;
        if (cy < v.y0 - 40 || cy > v.y1 + 40) continue;
        const span = 1400;
        const cx = ((i * 337 + real / 300 * (1 + (i % 3) * 0.4)) % span) - 400;
        ctx.fillRect(cx, cy, 34, 6); ctx.fillRect(cx + 6, cy - 4, 18, 4); ctx.fillRect(cx + 26, cy - 2, 12, 4);
      }
    }
    // 星
    if (dark > 0.3) {
      ctx.fillStyle = `rgba(255,255,230,${dark * 0.9})`;
      for (let i = 0; i < 90; i++) {
        const x = ((i * 977) % 1600) - 500, y = -40 - ((i * 613) % 1300);
        if (y < v.y0 || y > v.y1) continue;
        if ((i + Math.floor(real / 700)) % 7 === 0) continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
    // 遠くの街
    const cityCol = mix('#8fa8c8', '#1a2140', dark);
    for (let i = 0; i < 30; i++) {
      const x = -700 + i * 64 + ((i * 37) % 23);
      const hgt = 30 + ((i * 53) % 70);
      if (x + 48 < v.x0 || x > v.x1) continue;
      if (x > -48 && x < TW + 16) continue;
      ctx.fillStyle = cityCol; ctx.fillRect(x, -hgt, 44, hgt);
      if (dark > 0.4) {
        ctx.fillStyle = 'rgba(255,214,120,0.8)';
        for (let wy = -hgt + 4; wy < -4; wy += 6) for (let wx = x + 4; wx < x + 40; wx += 7) if (((wx * 7 + wy * 13 + i) & 7) < 3) ctx.fillRect(wx, wy, 2, 2);
      }
    }
    // 地面と地下
    ctx.fillStyle = mix('#6abf4b', '#24452a', dark * 0.8); ctx.fillRect(v.x0 - 10, -3, v.x1 - v.x0 + 20, 3);
    ctx.fillStyle = mix('#b8b2a5', '#3c3a40', dark * 0.8); ctx.fillRect(v.x0 - 10, -1, v.x1 - v.x0 + 20, 1);
    ctx.fillStyle = '#6b4a2e'; ctx.fillRect(v.x0 - 10, 0, v.x1 - v.x0 + 20, Math.max(0, v.y1 + 10));
    ctx.fillStyle = '#5a3d25';
    for (let i = 0; i < 160; i++) {
      const x = ((i * 131) % 1500) - 500, y = 4 + ((i * 71) % 150);
      if (x < v.x0 || x > v.x1 || y > v.y1) continue;
      ctx.fillRect(x, y, 3, 2);
    }
    // 木
    for (const tx of [-40, -86, -150, TW + 20, TW + 70, TW + 130]) {
      if (tx + 20 < v.x0 || tx > v.x1) continue;
      ctx.fillStyle = '#6d4c41'; ctx.fillRect(tx + 7, -12, 3, 9);
      ctx.fillStyle = mix('#3f9a3a', '#1c3b22', dark * 0.8); ctx.fillRect(tx, -26, 17, 14); ctx.fillRect(tx + 3, -30, 11, 4);
    }
  }

  drawGrid(ctx, v, game, lBot, lTop) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    for (let l = lBot; l <= lTop; l++) {
      const y = topY(l);
      ctx.fillRect(0, y, TW, 0.5);
    }
    for (let x = 0; x <= WIDTH; x += 4) ctx.fillRect(x * TILE_W, topY(lTop), 0.5, (lTop - lBot + 1) * FLOOR_H);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(0, topY(lTop), TW, (lTop - lBot + 1) * FLOOR_H);
  }

  updateReach(game, real) {
    if (game.world.version === this.reachVersion && real - this.reachTime < 3000) return;
    this.reachVersion = game.world.version; this.reachTime = real;
    this.reach.clear();
    for (const o of game.world.objects.values()) {
      const f = FAC[o.type];
      if ((f.tenant && !o.occupied) || f.hotel) this.reach.set(o.id, game.reachable(o));
    }
  }

  drawFacility(ctx, game, o, people, dark, h, real) {
    const f = FAC[o.type];
    const x = o.x * TILE_W, y = topY(o.level);
    let state = 'occ';
    if (f.tenant) state = o.occupied ? 'occ' : 'vacant';
    if (f.hotel) state = o.room === 'dirty' ? 'dirty' : 'clean';
    if (o.type === 'lobby') {
      ctx.drawImage(facilitySprite('lobby', '', o.id), x, y);
      const lw = game.world.objAt(0, o.x - 1), rw = game.world.objAt(0, o.x + o.w);
      if (!lw || lw.type !== 'lobby') this.door(ctx, x + 1, y);
      if (!rw || rw.type !== 'lobby') this.door(ctx, x + o.w * TILE_W - 7, y);
    } else if (o.type === 'stairs') {
      ctx.fillStyle = '#efe6d3'; ctx.fillRect(x, y, 16, FLOOR_H);
      ctx.drawImage(facilitySprite('stairs'), x, y);
    } else {
      ctx.drawImage(facilitySprite(o.type, state, o.id % 3), x, y);
    }
    if (o.type === 'parking') for (let i = 0; i < Math.min(o.parked || 0, 4); i++) drawCar(ctx, x + 2 + i * 16, y + 14, o.id + i);
    // 中の人
    if (people.length) {
      const sl = slots(o.type, o.w * TILE_W);
      const night = h >= 22 || h < 6.5;
      people.slice(0, sl.length).forEach((p, i) => {
        const [sx, sy, pose] = sl[i];
        if (pose === 2 && night) drawSleeper(ctx, x + sx, y + sy + 2, p);
        else if (pose === 1) drawSitter(ctx, x + sx, y + sy, p, SHIRT[p.kind]);
        else drawPerson(ctx, x + sx + ((p.id * 7) % 5) - 2, y + sy, p, 0, SHIRT[p.kind]);
      });
    }
    // あかり
    let lit = true;
    if (f.tenant) lit = o.occupied && (f.hours ? game.isOpen(o) : people.length > 0);
    else if (f.hotel) lit = people.length > 0 && !(h >= 23 || h < 6);
    else if (o.type === 'housekeeping') lit = people.length > 0;
    else if (o.type === 'lobby' || o.type === 'stairs' || o.type === 'parking') lit = true;
    const shade = lit ? 0 : (0.15 + 0.5 * dark) * (o.type === 'lobby' ? 0.5 : 1);
    if (shade > 0) { ctx.fillStyle = `rgba(10,14,40,${shade})`; ctx.fillRect(x, y, o.w * TILE_W, FLOOR_H); }
    if (lit && dark > 0.3 && o.type !== 'parking') { ctx.fillStyle = `rgba(255,220,140,${0.08 * dark})`; ctx.fillRect(x, y, o.w * TILE_W, FLOOR_H); }
    // 満足度の色
    if (this.showScore && o.score !== undefined && (!f.tenant || o.occupied)) {
      const s = o.score;
      ctx.fillStyle = s >= 65 ? 'rgba(66,165,245,0.40)' : s >= 35 ? 'rgba(255,202,40,0.45)' : 'rgba(229,57,53,0.50)';
      ctx.fillRect(x, y + 2, o.w * TILE_W, FLOOR_H - 4);
    }
    // 行けない印
    if (this.reach.get(o.id) === false) {
      const cx = x + o.w * TILE_W / 2 - 4, cy = y + 4;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 1, cy - 1, 10, 10);
      ctx.fillStyle = '#e53935';
      for (let i = 0; i < 7; i++) { ctx.fillRect(cx + i, cy + i, 2, 1); ctx.fillRect(cx + 6 - i, cy + i, 2, 1); }
    }
  }
  door(ctx, x, y) {
    ctx.fillStyle = '#607d8b'; ctx.fillRect(x, y + 6, 6, 15);
    ctx.fillStyle = '#b3e5fc'; ctx.fillRect(x + 1, y + 7, 2, 14); ctx.fillRect(x + 3, y + 7, 2, 14);
  }

  drawElevator(ctx, game, o, lBot, lTop, dark) {
    const x = o.x * TILE_W;
    const shaft = shaftSprite();
    for (let l = Math.max(o.bottom, lBot); l <= Math.min(o.top, lTop); l++) ctx.drawImage(shaft, x, topY(l));
    const es = game.elev.get(o.id);
    if (!es) return;
    es.cars.forEach((c, i) => {
      if (c.y < lBot - 1 || c.y > lTop + 1) return;
      const cy = topY(c.y) + 3;
      const cx = x + 4;
      const open = c.dwell > 0;
      ctx.drawImage(carSprite(open), cx, cy);
      if (es.cars.length > 1) { ctx.fillStyle = '#263238'; ctx.fillRect(cx + 1, cy + 1, 4, 3); ctx.fillStyle = '#ffeb3b'; ctx.fillRect(cx + 2 + (i % 2), cy + 2, 1, 1); }
      const n = Math.min(c.pass.length, 12);
      for (let k = 0; k < n; k++) {
        const p = c.pass[k];
        const px = cx + 2 + (k % 6) * 3.4, py = cy + 8 - Math.floor(k / 6) * 1;
        drawPerson(ctx, px, py + (k >= 6 ? -2 : 0), p, 0, SHIRT[p.kind]);
      }
      if (!open && n) { ctx.fillStyle = 'rgba(184,191,202,0.55)'; ctx.fillRect(cx + 2, cy + 3, 20, 14); }
    });
  }

  drawWaiting(ctx, game, lBot, lTop, real) {
    for (const [id, es] of game.elev) {
      const o = game.world.objects.get(id);
      if (!o) continue;
      for (const [L, q] of es.queues) {
        if (L < lBot || L > lTop) continue;
        const all = [...q.up, ...q.down];
        all.forEach((p, i) => {
          const side = i % 2 === 0 ? -1 : 1;
          const k = Math.floor(i / 2);
          const px = side < 0 ? o.x * TILE_W - 4 - k * 4 : (o.x + o.w) * TILE_W + 1 + k * 4;
          const w = game.t - p.waitStart;
          const shirt = w > 12 ? '#e53935' : w > 5 ? '#ff80ab' : SHIRT[p.kind];
          const bob = w > 12 && Math.floor(real / 150 + p.id) % 2 ? -1 : 0;
          drawPerson(ctx, px, topY(L) + 14 + bob, p, 1, shirt);
        });
      }
    }
  }

  drawGhost(ctx, gh) {
    const f = FAC[gh.type];
    const lo = gh.type === 'elevator' ? Math.min(gh.level, gh.top ?? gh.level) : gh.level;
    const hi = gh.type === 'elevator' ? Math.max(gh.level, gh.top ?? gh.level) : gh.level;
    const x = gh.x * TILE_W;
    ctx.globalAlpha = 0.7;
    for (let l = lo; l <= hi; l++) {
      if (gh.type === 'elevator') ctx.drawImage(shaftSprite(), x, topY(l));
      else if (gh.type === 'stairs') { ctx.fillStyle = '#efe6d3'; ctx.fillRect(x, topY(l), 16, FLOOR_H); ctx.drawImage(facilitySprite('stairs'), x, topY(l)); }
      else ctx.drawImage(facilitySprite(gh.type, f.hotel ? 'clean' : 'occ', 0), x, topY(l));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = gh.ok ? 'rgba(76,175,80,0.35)' : 'rgba(229,57,53,0.45)';
    ctx.fillRect(x, topY(hi), f.w * TILE_W, (hi - lo + 1) * FLOOR_H);
    ctx.strokeStyle = gh.ok ? '#a5f3a8' : '#ff8a80'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, topY(hi) + 0.5, f.w * TILE_W - 1, (hi - lo + 1) * FLOOR_H - 1);
  }
}
