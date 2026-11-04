// 道さがし：どの階段・エレベーターを乗りついで行くか
import { WALK_SPEED, STAIRS_TIME, ELEV_SPEED } from './config.js';

const STAIRS_PENALTY = 3;   // 階段はできれば使いたくない
const TRANSFER_PENALTY = 1.5;
export const MAX_ROUTE_COST = 120;

export function waitEstimate(t) {
  const e = t.obj;
  return 1.5 + ((e.top - e.bottom) / (ELEV_SPEED * e.cars)) * 0.8;
}

class Heap {
  constructor() { this.a = []; }
  push(k, v) {
    const a = this.a; a.push([k, v]);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break; [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

// from/to: { level, x }。返り値：{ legs:[{tid, from, to}], cost } か null
export function findRoute(world, from, to, waitFn = waitEstimate) {
  if (!world.segAt(from.level, Math.floor(from.x)) || !world.segAt(to.level, Math.floor(to.x))) return null;
  if (from.level === to.level && world.connected(from.level, from.x, to.x)) {
    return { legs: [], cost: Math.abs(from.x - to.x) / WALK_SPEED };
  }
  const { list, byLevel } = world.transports();
  const dist = new Map();
  const prev = new Map();
  const heap = new Heap();
  const key = (tid, l) => tid * 1000 + (l + 500);
  const relax = (k, d, p) => {
    if (d < (dist.get(k) ?? Infinity) && d <= MAX_ROUTE_COST) { dist.set(k, d); prev.set(k, p); heap.push(d, k); }
  };
  for (const t of byLevel.get(from.level) || []) {
    if (world.connected(from.level, from.x, t.x)) relax(key(t.id, from.level), Math.abs(from.x - t.x) / WALK_SPEED, null);
  }
  let best = Infinity, bestKey = null;
  while (heap.size) {
    const [d, k] = heap.pop();
    if (d > (dist.get(k) ?? Infinity)) continue;
    if (d >= best) break;
    const tid = Math.floor(k / 1000), l = (k % 1000) - 500;
    const t = list.get(tid);
    if (!t) continue;
    // ゴールの階に着いた
    if (l === to.level && world.connected(l, t.x, to.x)) {
      const total = d + Math.abs(t.x - to.x) / WALK_SPEED;
      if (total < best) { best = total; bestKey = k; }
    }
    // 乗る
    if (t.kind === 'stairs') {
      for (const m of t.levels) {
        if (m === l || !world.segAt(m, t.x)) continue;
        relax(key(tid, m), d + STAIRS_TIME + STAIRS_PENALTY, { k, ride: true });
      }
    } else {
      const w = waitFn(t);
      for (const m of t.levels) {
        if (m === l) continue;
        relax(key(tid, m), d + w + Math.abs(m - l) / ELEV_SPEED, { k, ride: true });
      }
    }
    // 同じ階でほかの乗りものへ歩く
    for (const u of byLevel.get(l) || []) {
      if (u.id === tid || !world.connected(l, t.x, u.x)) continue;
      relax(key(u.id, l), d + Math.abs(t.x - u.x) / WALK_SPEED + TRANSFER_PENALTY, { k, ride: false });
    }
  }
  if (bestKey === null) return null;
  const legs = [];
  let k = bestKey;
  while (prev.get(k)) {
    const p = prev.get(k);
    if (p.ride) {
      const tid = Math.floor(k / 1000);
      legs.push({ tid, from: (p.k % 1000) - 500, to: (k % 1000) - 500 });
    }
    k = p.k;
  }
  legs.reverse();
  return { legs, cost: best };
}

// 同じ道を何度もさがさないための入れもの
export class RouteCache {
  constructor() { this.map = new Map(); this.version = -1; this.epoch = -1; }
  get(world, from, to, epoch = 0, waitFn = waitEstimate) {
    if (world.version !== this.version || epoch !== this.epoch) { this.map.clear(); this.version = world.version; this.epoch = epoch; }
    const k = `${from.level}:${world.segAt(from.level, Math.floor(from.x))}:${Math.floor(from.x / 8)}>${to.level}:${world.segAt(to.level, Math.floor(to.x))}:${Math.floor(to.x / 8)}`;
    if (this.map.has(k)) return this.map.get(k);
    const r = findRoute(world, from, to, waitFn);
    if (this.map.size > 5000) this.map.clear();
    this.map.set(k, r);
    return r;
  }
  clear() { this.map.clear(); }
}
