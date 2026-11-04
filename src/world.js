// ビルの形（どこに何が建っているか）と、建てられるかどうかの決まり
import { WIDTH, MIN_LEVEL, MAX_LEVEL, FAC, STAR_LIMITS, UNDERGROUND_MULT, ELEV_MAX_SPAN, ELEV_MAX_CARS } from './config.js';

export function levelsOf(obj) {
  if (obj.type !== 'elevator') return [obj.level];
  const out = [];
  for (let l = obj.bottom; l <= obj.top; l++) out.push(l);
  return out;
}

export class World {
  constructor() {
    this.objects = new Map();
    this.nextId = 1;
    this.grid = new Map();
    this.seg = new Map();
    this.version = 0;
    this._transports = null;
  }

  row(level) {
    let r = this.grid.get(level);
    if (!r) { r = new Int32Array(WIDTH); this.grid.set(level, r); }
    return r;
  }
  at(level, x) {
    if (x < 0 || x >= WIDTH) return 0;
    const r = this.grid.get(level);
    return r ? r[x] : 0;
  }
  objAt(level, x) { const id = this.at(level, x); return id ? this.objects.get(id) : null; }
  segAt(level, x) {
    if (x < 0 || x >= WIDTH) return 0;
    const s = this.seg.get(level);
    return s ? s[x] : 0;
  }
  // 同じ階で、床がつながっているか
  connected(level, x1, x2) {
    const a = this.segAt(level, Math.floor(x1));
    return a !== 0 && a === this.segAt(level, Math.floor(x2));
  }

  tilesFor(type, x, level, top) {
    const w = FAC[type].w;
    const tiles = [];
    const levels = [];
    if (type === 'elevator') {
      const lo = Math.min(level, top), hi = Math.max(level, top);
      for (let l = lo; l <= hi; l++) levels.push(l);
    } else levels.push(level);
    for (const l of levels) for (let i = 0; i < w; i++) tiles.push([l, x + i]);
    return { tiles, levels };
  }

  costOf(type, levels, cars = 1) {
    const f = FAC[type];
    let c = f.cost;
    if (type === 'elevator') c += f.perLevel * levels.length + f.carCost * (cars - 1);
    else if (type !== 'parking' && type !== 'stairs' && levels.some(l => l < 0)) c *= UNDERGROUND_MULT;
    return Math.round(c);
  }

  // 建てられるか調べる。{ ok, reason, cost }
  check(type, x, level, star, top) {
    const f = FAC[type];
    if (!f) return { ok: false, reason: 'わからない施設' };
    if (star < f.star) return { ok: false, reason: `★${f.star}になると建てられる` };
    const lim = STAR_LIMITS[star];
    const { tiles, levels } = this.tilesFor(type, x, level, top);
    const cost = this.costOf(type, levels);
    const fail = reason => ({ ok: false, reason, cost });
    if (x < 0 || x + f.w > WIDTH) return fail('はみ出してしまう');
    for (const l of levels) {
      if (l > MAX_LEVEL || l < MIN_LEVEL) return fail('これ以上は建てられない');
      if (l > lim.top) return fail(`★${star}では${lim.top + 1}Fまで`);
      if (l < lim.bottom) return fail(lim.bottom === 0 ? '地下は★2から' : `★${star}ではB${-lim.bottom}まで`);
    }
    if (type === 'elevator') {
      if (levels.length < 2) return fail('2つ以上の階を結んでね');
      if (levels.length > ELEV_MAX_SPAN) return fail(`1本で結べるのは${ELEV_MAX_SPAN}階まで`);
    } else {
      if (f.where === 'ground' && level !== 0) return fail('1Fだけに建てられる');
      if (f.where === 'above' && level < 1) return fail('2Fより上に建ててね');
      if (f.where === 'basement' && level >= 0) return fail('地下だけに建てられる');
    }
    const mine = new Set(tiles.map(([l, tx]) => l * 1000 + tx));
    for (const [l, tx] of tiles) if (this.at(l, tx)) return fail('ほかのものと重なっている');
    // 支え：地上は下に、地下は上に、何かがあること
    for (const [l, tx] of tiles) {
      if (l === 0) continue;
      const nl = l > 0 ? l - 1 : l + 1;
      if (!this.at(nl, tx) && !mine.has(nl * 1000 + tx)) return fail(l > 0 ? '下に支えがない' : '上に建物がない（ビルの下を掘ってね）');
    }
    return { ok: true, cost };
  }

  place(type, x, level, extra = {}) {
    const f = FAC[type];
    const obj = { id: this.nextId++, type, x, w: f.w, level, ...extra };
    if (type === 'elevator') {
      const top = extra.top ?? level;
      obj.bottom = Math.min(level, top); obj.top = Math.max(level, top); obj.level = obj.bottom;
      if (!obj.cars) obj.cars = 1;
    }
    if (f.tenant && obj.occupied === undefined) Object.assign(obj, { occupied: false, score: 70, strikes: 0, lowDays: 0, customers: 0, lastCustomers: [] });
    if (f.hotel && !obj.room) Object.assign(obj, { room: 'clean', score: 80 });
    if (type === 'parking' && obj.parked === undefined) obj.parked = 0;
    this.objects.set(obj.id, obj);
    this._mark(obj, obj.id);
    return obj;
  }

  _mark(obj, val) {
    const touched = new Set();
    for (const l of levelsOf(obj)) {
      const r = this.row(l);
      for (let i = 0; i < obj.w; i++) r[obj.x + i] = val;
      touched.add(l);
    }
    for (const l of touched) this._reseg(l);
    this.version++;
    this._transports = null;
  }

  _reseg(level) {
    const r = this.row(level);
    let s = this.seg.get(level);
    if (!s) { s = new Int32Array(WIDTH); this.seg.set(level, s); }
    let n = 0, prev = false;
    for (let x = 0; x < WIDTH; x++) {
      if (r[x]) { if (!prev) n++; s[x] = n; prev = true; }
      else { s[x] = 0; prev = false; }
    }
  }

  // こわせるか（上や下を支えていないか）
  canRemove(id) {
    const obj = this.objects.get(id);
    if (!obj) return { ok: false, reason: 'ない' };
    const levels = levelsOf(obj);
    for (const l of levels) {
      for (let i = 0; i < obj.w; i++) {
        const tx = obj.x + i;
        const deps = [];
        if (l >= 0) deps.push(l + 1);
        if (l <= 0) deps.push(l - 1);
        for (const dl of deps) {
          const other = this.at(dl, tx);
          if (other && other !== id) return { ok: false, reason: dl > l ? '上の階を支えている' : '下の階がぶら下がっている' };
        }
      }
    }
    return { ok: true };
  }

  remove(id) {
    const obj = this.objects.get(id);
    if (!obj) return null;
    this._mark(obj, 0);
    this.objects.delete(id);
    return obj;
  }

  // エレベーターを1階のばす。{ ok, reason, cost }
  checkExtend(id, dir, star) {
    const e = this.objects.get(id);
    if (!e || e.type !== 'elevator') return { ok: false, reason: 'エレベーターではない' };
    const l = dir > 0 ? e.top + 1 : e.bottom - 1;
    const lim = STAR_LIMITS[star];
    const cost = FAC.elevator.perLevel;
    if (e.top - e.bottom + 2 > ELEV_MAX_SPAN) return { ok: false, reason: `1本で結べるのは${ELEV_MAX_SPAN}階まで`, cost };
    if (l > lim.top || l < lim.bottom || l > MAX_LEVEL || l < MIN_LEVEL) return { ok: false, reason: 'これ以上はのばせない', cost };
    for (let i = 0; i < e.w; i++) if (this.at(l, e.x + i)) return { ok: false, reason: 'ほかのものと重なっている', cost };
    return { ok: true, cost };
  }
  extend(id, dir) {
    const e = this.objects.get(id);
    this._mark(e, 0);
    if (dir > 0) e.top++; else { e.bottom--; e.level = e.bottom; }
    this._mark(e, e.id);
  }
  checkShrink(id, dir) {
    const e = this.objects.get(id);
    if (!e || e.type !== 'elevator') return { ok: false, reason: 'エレベーターではない' };
    if (e.top - e.bottom < 2) return { ok: false, reason: '2つの階は結んでおかないと' };
    const l = dir > 0 ? e.top : e.bottom;
    const dl = dir > 0 ? l + 1 : l - 1;
    if ((l >= 0 && dir > 0) || (l <= 0 && dir < 0)) {
      for (let i = 0; i < e.w; i++) { const o = this.at(dl, e.x + i); if (o && o !== e.id) return { ok: false, reason: 'ほかの階を支えている' }; }
    }
    return { ok: true };
  }
  shrink(id, dir) {
    const e = this.objects.get(id);
    this._mark(e, 0);
    if (dir > 0) e.top--; else { e.bottom++; e.level = e.bottom; }
    this._mark(e, e.id);
  }
  canAddCar(id) { const e = this.objects.get(id); return e && e.cars < ELEV_MAX_CARS; }

  // 乗りもの（階段とエレベーター）の一覧。world が変わったら作り直す
  transports() {
    if (this._transports) return this._transports;
    const list = new Map();
    for (const o of this.objects.values()) {
      if (o.type === 'stairs') list.set(o.id, { id: o.id, kind: 'stairs', x: o.x + 1, levels: [o.level, o.level + 1], obj: o });
      else if (o.type === 'elevator') list.set(o.id, { id: o.id, kind: 'elev', x: o.x + 2, levels: levelsOf(o), obj: o });
    }
    const byLevel = new Map();
    for (const t of list.values()) {
      for (const l of t.levels) {
        if (!byLevel.has(l)) byLevel.set(l, []);
        byLevel.get(l).push(t);
      }
    }
    this._transports = { list, byLevel };
    return this._transports;
  }

  ofType(type) {
    const out = [];
    for (const o of this.objects.values()) if (o.type === type) out.push(o);
    return out;
  }
}
