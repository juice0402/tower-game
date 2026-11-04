// エレベーターの動き（かごの運転と、待っている人の乗り降り）
import { ELEV_SPEED, ELEV_CAPACITY, DWELL } from './config.js';

export function makeCar(level) {
  return { y: level, dir: 0, dwell: 0, open: 0, stops: new Set(), pass: [] };
}

export class ElevState {
  constructor(obj) {
    this.id = obj.id;
    this.cars = [];
    this.queues = new Map(); // level -> { up: [], down: [] }
    this.sync(obj);
  }
  sync(obj) {
    while (this.cars.length < obj.cars) this.cars.push(makeCar(obj.bottom));
    for (const c of this.cars) c.y = Math.min(obj.top, Math.max(obj.bottom, c.y));
  }
  queue(level, dir) {
    let q = this.queues.get(level);
    if (!q) { q = { up: [], down: [] }; this.queues.set(level, q); }
    return dir > 0 ? q.up : q.down;
  }
  waitingCount() {
    let n = 0;
    for (const q of this.queues.values()) n += q.up.length + q.down.length;
    return n;
  }
}

function eta(car, L, d, obj) {
  const pen = car.pass.length * 0.1 + (car.dwell > 0 ? car.dwell : 0);
  if (car.dir === 0) return Math.abs(car.y - L) + pen;
  if (car.dir === d && (L - car.y) * d >= 0) return Math.abs(L - car.y) + pen;
  const far = car.dir > 0 ? obj.top : obj.bottom;
  return Math.abs(far - car.y) + Math.abs(far - L) + pen;
}

// 1回ぶん動かす。onUnload(person, level), onBoard(person, car) を呼ぶ
export function stepElevator(es, obj, dt, onUnload, onBoard) {
  // 呼ばれている階（だれが行くか決める）
  const calls = [];
  for (const [L, q] of es.queues) {
    if (q.up.length) calls.push({ L, d: 1, car: -1 });
    if (q.down.length) calls.push({ L, d: -1, car: -1 });
  }
  for (const call of calls) {
    let best = Infinity;
    es.cars.forEach((car, i) => {
      if (car.pass.length >= ELEV_CAPACITY) return;
      const v = eta(car, call.L, call.d, obj);
      if (v < best) { best = v; call.car = i; }
    });
  }
  es.cars.forEach((car, i) => {
    const mine = calls.filter(c => c.car === i);
    if (car.dwell > 0) {
      car.dwell -= dt;
      if (car.dwell <= 0) { car.dwell = 0; car.open = 0; }
      return;
    }
    const hasTarget = () => car.stops.size > 0 || mine.length > 0;
    if (!hasTarget()) { car.dir = 0; car.y = Math.round(car.y); return; }
    const ahead = (dir, from) => {
      for (const s of car.stops) if ((s - from) * dir > 0) return true;
      for (const c of mine) if ((c.L - from) * dir > 0) return true;
      return false;
    };
    const shouldStop = L => {
      if (car.stops.has(L)) return true;
      for (const c of mine) {
        if (c.L !== L) continue;
        if (c.d === car.dir || car.dir === 0) return true;
        if (!ahead(car.dir, L)) return true;
      }
      return false;
    };
    if (car.dir === 0) {
      let near = null, nd = Infinity;
      for (const s of car.stops) { const d = Math.abs(s - car.y); if (d < nd) { nd = d; near = s; } }
      for (const c of mine) { const d = Math.abs(c.L - car.y); if (d < nd) { nd = d; near = c.L; } }
      car.dir = near > car.y ? 1 : near < car.y ? -1 : 0;
    } else if (!ahead(car.dir, car.y) && !shouldStop(Math.round(car.y))) {
      car.dir = -car.dir;
    }
    if (Number.isInteger(car.y) && shouldStop(car.y)) { stopAt(es, obj, car, mine, car.y, onUnload, onBoard); return; }
    if (car.dir === 0) return;
    const ny = car.y + car.dir * ELEV_SPEED * dt;
    const start = car.dir > 0 ? Math.floor(car.y) + 1 : Math.ceil(car.y) - 1;
    for (let L = start; car.dir > 0 ? L <= ny : L >= ny; L += car.dir) {
      if (L > obj.top || L < obj.bottom) break;
      if (shouldStop(L)) { car.y = L; stopAt(es, obj, car, mine, L, onUnload, onBoard); return; }
    }
    car.y = Math.min(obj.top, Math.max(obj.bottom, ny));
    if (car.y === obj.top || car.y === obj.bottom) car.dir = 0;
  });
}

function stopAt(es, obj, car, mine, L, onUnload, onBoard) {
  let moved = 0;
  // 降りる
  const stay = [];
  for (const p of car.pass) {
    if (p.trip && p.trip.legs[p.trip.li] && p.trip.legs[p.trip.li].to === L) { onUnload(p, L); moved++; }
    else stay.push(p);
  }
  car.pass = stay;
  car.stops.delete(L);
  // どっち向きの人を乗せるか
  const hasAhead = dir => {
    for (const s of car.stops) if ((s - L) * dir > 0) return true;
    for (const c of mine) if (c.L !== L && (c.L - L) * dir > 0) return true;
    return false;
  };
  const qUp = es.queue(L, 1), qDown = es.queue(L, -1);
  let dir = car.dir;
  if (dir === 0) dir = qUp.length ? 1 : qDown.length ? -1 : 0;
  else if (!hasAhead(dir) && !(dir > 0 ? qUp : qDown).length) dir = -dir;
  if (L >= obj.top && dir > 0) dir = -1;
  if (L <= obj.bottom && dir < 0) dir = 1;
  const q = dir > 0 ? qUp : dir < 0 ? qDown : null;
  if (q) {
    while (q.length && car.pass.length < ELEV_CAPACITY) {
      const p = q.shift();
      car.pass.push(p);
      car.stops.add(p.trip.legs[p.trip.li].to);
      onBoard(p, car);
      moved++;
    }
  }
  car.dir = car.stops.size ? dir : (q && q.length ? dir : 0);
  car.dwell = DWELL + moved * 0.05;
  car.open = car.dwell;
}
