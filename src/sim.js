// のびのびタワー — ゲームの中身（時間・人・お金・★）
import {
  FAC, STEP, WALK_SPEED, STAIRS_TIME, GIVE_UP, ELEV_SPEED, ELEV_CAPACITY, START_MONEY, STAR_GOALS, ELEV_MAX_CARS, WIDTH, STARTER, levelName, yen,
} from './config.js';
import { Rng } from './rng.js';
import { World, levelsOf } from './world.js';
import { RouteCache, waitEstimate } from './route.js';
import { ElevState, stepElevator } from './elevator.js';

export const SAVE_VERSION = 1;
const TENANT_TYPES = ['office', 'home', 'food', 'shop'];
const MAX_VISITORS = 350;

function newDay() {
  return { income: 0, expense: 0, hotel: 0, fees: 0, customers: 0, giveUps: 0, moveIns: 0, moveOuts: 0 };
}

export class Game {
  constructor(seed) {
    this.world = new World();
    this.rng = new Rng(seed ?? ((Date.now() ^ 0x5bd1e995) >>> 0));
    this.t = 6 * 60;
    this.money = START_MONEY;
    this.star = 1;
    this.people = [];
    this.nextPid = 1;
    this.members = new Map();
    this.elev = new Map();
    this.routes = new RouteCache();
    this.log = [];
    this.events = [];
    this.today = newDay();
    this.history = [];
    this.visitors = 0;
    this._pop = null;
    // 混み具合も考えた待ち時間の見こみ（道さがし用）
    this.waitFn = t => {
      const es = this.elev.get(t.id);
      const e = t.obj;
      const load = es ? es.waitingCount() : 0;
      return waitEstimate(t) + (load / (e.cars * ELEV_CAPACITY)) * ((e.top - e.bottom) / ELEV_SPEED);
    };
  }
  // 新しく始めるときのゲーム：小さなビルが建っていて、何部屋かは入居ずみ
  static starter(seed) {
    const g = new Game(seed);
    const [ex, lo, hi] = STARTER.elevator;
    g.afterPlace(g.world.place('elevator', ex, lo, { top: hi }));
    for (const [type, x, level, occupied] of STARTER.rooms) {
      const o = g.world.place(type, x, level);
      g.afterPlace(o);
      if (occupied) g.moveIn(o, true);
    }
    g._pop = null;
    return g;
  }
  route(from, to) {
    return this.routes.get(this.world, from, to, Math.floor(this.t / 10), this.waitFn);
  }

  // ---------- 時間 ----------
  get day() { return Math.floor(this.t / 1440); }
  get mod() { return this.t % 1440; }
  get weekday() { return this.day % 7; }
  get week() { return Math.floor(this.day / 7) + 1; }
  isWeekend(day = this.day) { return day % 7 >= 5; }
  isNight() { return this.mod < 330; }
  hour() { return Math.floor(this.mod / 60); }

  advance(minutes) {
    const n = Math.round(minutes / STEP);
    for (let i = 0; i < n; i++) this.step();
  }

  step() {
    const before = Math.floor(this.t);
    this.t += STEP;
    const after = Math.floor(this.t);
    for (let m = before + 1; m <= after; m++) this.minuteTick(m);
    this.updateMovers(STEP);
    for (const [id, es] of this.elev) {
      const obj = this.world.objects.get(id);
      if (obj) stepElevator(es, obj, STEP, (p, L) => this.onUnload(p, L, obj), (p, car) => this.onBoard(p, car));
    }
  }

  // ---------- 知らせ ----------
  notify(msg, kind = 'info') {
    this.log.unshift({ t: this.t, msg, kind });
    if (this.log.length > 40) this.log.length = 40;
    this.events.push({ msg, kind });
  }

  // ---------- 人数と★ ----------
  population() {
    if (this._pop !== null) return this._pop;
    let n = 0;
    for (const o of this.world.objects.values()) {
      const f = FAC[o.type];
      if (f.tenant) { if (o.occupied) n += f.pop; }
      else n += f.pop || 0;
    }
    this._pop = n;
    return n;
  }
  count(type) {
    if (type === 'rooms') return this.world.ofType('single').length + this.world.ofType('twin').length;
    return this.world.ofType(type).length;
  }
  goal() {
    const g = STAR_GOALS[this.star + 1];
    if (!g) return null;
    const pop = this.population();
    return {
      star: this.star + 1,
      pop: g.pop,
      popOk: pop >= g.pop,
      need: g.need.map(([type, n, label]) => ({ type, label, have: this.count(type), n, ok: this.count(type) >= n })),
    };
  }
  checkStar() {
    const g = this.goal();
    if (!g) return;
    if (g.popOk && g.need.every(x => x.ok)) {
      this.star++;
      const msg = this.star === 2
        ? '★2になりました！ お店・ホテル・医務室・駐車場と、地下（B3まで）・40Fまで建てられるよ'
        : '★3になりました！ 50F・B5まで建てられるよ。おめでとう、りっぱなタワーです！';
      this.notify(msg, 'star');
      this.events.push({ kind: 'starup', star: this.star });
    }
  }

  // ---------- 建てる・こわす ----------
  checkBuild(type, x, level, top) {
    const r = this.world.check(type, x, level, this.star, top);
    if (r.ok && this.money < r.cost) return { ok: false, reason: 'お金が足りない', cost: r.cost };
    return r;
  }
  build(type, x, level, top) {
    const r = this.checkBuild(type, x, level, top);
    if (!r.ok) return r;
    this.money -= r.cost;
    this.today.expense += r.cost;
    const obj = this.world.place(type, x, level, type === 'elevator' ? { top } : {});
    this.afterPlace(obj);
    this._pop = null;
    return { ok: true, cost: r.cost, obj };
  }
  afterPlace(obj) {
    if (obj.type === 'elevator') this.elev.set(obj.id, new ElevState(obj));
    if (obj.type === 'housekeeping') {
      for (let i = 0; i < FAC.housekeeping.staff; i++) {
        const p = this.addPerson('staff', obj.id);
        this.makePlan(p, this.day, true);
        this.placeByPlan(p);
      }
    }
  }
  checkRemove(id) { return this.world.canRemove(id); }
  remove(id) {
    const r = this.world.canRemove(id);
    if (!r.ok) return r;
    const obj = this.world.objects.get(id);
    this.kickAll(obj);
    this.world.remove(id);
    this.elev.delete(id);
    this._pop = null;
    return { ok: true };
  }
  // その施設・乗りものに関わる人を外へ
  kickAll(obj) {
    for (const p of this.people) {
      if (p.gone) continue;
      const usesIt = (p.st === 'wait' || p.st === 'ride') ? p.elevId === obj.id
        : p.st === 'stairs' ? p.tid === obj.id
        : (p.st === 'stay' && p.at === obj.id) || (p.trip && p.trip.dest.id === obj.id);
      if (usesIt || p.home === obj.id) this.sendOff(p, p.home === obj.id);
    }
    if (FAC[obj.type].hotel || FAC[obj.type].tenant || obj.type === 'housekeeping') this.members.delete(obj.id);
  }
  addCar(id) {
    const e = this.world.objects.get(id);
    if (!e || e.type !== 'elevator') return { ok: false, reason: 'エレベーターではない' };
    if (e.cars >= ELEV_MAX_CARS) return { ok: false, reason: `かごは${ELEV_MAX_CARS}台まで` };
    const cost = FAC.elevator.carCost;
    if (this.money < cost) return { ok: false, reason: 'お金が足りない' };
    this.money -= cost; this.today.expense += cost;
    e.cars++;
    this.elev.get(id).sync(e);
    this.world.version++;
    return { ok: true, cost };
  }
  removeCar(id) {
    const e = this.world.objects.get(id);
    if (!e || e.cars <= 1) return { ok: false, reason: 'かごは1台は必要' };
    const es = this.elev.get(id);
    const car = es.cars.pop();
    for (const p of car.pass) this.sendOff(p, false);
    e.cars--;
    this.world.version++;
    return { ok: true };
  }
  extendElevator(id, dir) {
    const r = this.world.checkExtend(id, dir, this.star);
    if (!r.ok) return r;
    if (this.money < r.cost) return { ok: false, reason: 'お金が足りない' };
    this.money -= r.cost; this.today.expense += r.cost;
    this.world.extend(id, dir);
    return { ok: true, cost: r.cost };
  }
  shrinkElevator(id, dir) {
    const r = this.world.checkShrink(id, dir);
    if (!r.ok) return r;
    const e = this.world.objects.get(id);
    const gone = dir > 0 ? e.top : e.bottom;
    const es = this.elev.get(id);
    for (const p of this.people) {
      if (p.gone || p.elevId !== id) continue;
      const leg = p.trip && p.trip.legs[p.trip.li];
      if (p.level === gone || (leg && leg.to === gone)) this.sendOff(p, false);
    }
    this.world.shrink(id, dir);
    es.queues.delete(gone);
    es.sync(e);
    return { ok: true };
  }

  // ---------- 人 ----------
  addPerson(kind, home) {
    const p = {
      id: this.nextPid++, kind, home, st: 'off', at: null, level: 0, x: 0, tx: 0,
      plan: [], pi: 0, until: null, after: null, trip: null, waitStart: 0, elevId: null, tid: null,
      timer: 0, tFrom: 0, tTo: 0, byCar: false, parkId: null, cust: false, look: this.rng.int(0, 5),
      commuter: this.rng.chance(0.6),
    };
    this.people.push(p);
    if (home) {
      if (!this.members.has(home)) this.members.set(home, []);
      this.members.get(home).push(p);
    }
    return p;
  }
  // 人をビルの外へ（goneがtrueなら、その人はもういない）
  sendOff(p, gone) {
    if (p.st === 'wait') {
      const es = this.elev.get(p.elevId);
      if (es) for (const q of es.queues.values()) { for (const arr of [q.up, q.down]) { const i = arr.indexOf(p); if (i >= 0) arr.splice(i, 1); } }
    }
    if (p.st === 'ride') {
      const es = this.elev.get(p.elevId);
      if (es) for (const c of es.cars) { const i = c.pass.indexOf(p); if (i >= 0) c.pass.splice(i, 1); }
    }
    if (p.cleaning) { const r = this.world.objects.get(p.cleaning); if (r && r.cleaner === p.id) r.cleaner = null; p.cleaning = null; }
    if (p.parkId) { const pk = this.world.objects.get(p.parkId); if (pk) pk.parked = Math.max(0, pk.parked - 1); p.parkId = null; }
    p.trip = null; p.st = 'off'; p.at = null; p.until = null; p.after = null; p.elevId = null; p.cust = false;
    if (gone || p.kind === 'visitor') this.despawn(p);
  }
  despawn(p) {
    if (p.gone) return;
    p.gone = true;
    if (p.kind === 'visitor') this.visitors--;
    if (p.home && this.members.has(p.home)) {
      const arr = this.members.get(p.home);
      const i = arr.indexOf(p);
      if (i >= 0) arr.splice(i, 1);
    }
  }

  lobbyPoint() {
    const lobbies = this.world.ofType('lobby');
    if (!lobbies.length) return null;
    const l = this.rng.pick(lobbies);
    return { level: 0, x: l.x + this.rng.range(0.5, l.w - 0.5) };
  }
  facPoint(f) {
    return { level: f.level, x: f.x + this.rng.range(1, f.w - 1) };
  }
  entranceFor(p) {
    if (p.byCar) {
      const pk = p.parkId && this.world.objects.get(p.parkId);
      if (pk) return this.facPoint(pk);
    }
    return this.lobbyPoint();
  }
  // 行けるかどうかだけ調べる
  reachable(f) {
    const a = this.lobbyPoint();
    if (!a) return false;
    return !!this.route(a, { level: f.level, x: f.x + f.w / 2 });
  }

  // 出発。行けなければ false
  startTrip(p, dest, purpose) {
    let from;
    if (p.st === 'off') {
      from = this.entranceFor(p);
      if (!from) return false;
    } else if (p.st === 'stay') {
      from = { level: p.level, x: p.x };
    } else return false;
    let to;
    if (dest.kind === 'fac') {
      const f = this.world.objects.get(dest.id);
      if (!f) return false;
      to = this.facPoint(f);
    } else {
      to = this.entranceFor(p);
      if (!to) return false;
    }
    const r = this.route(from, to);
    if (!r) return false;
    if (p.st === 'off') { p.level = from.level; p.x = from.x; }
    p.trip = { dest, to, legs: r.legs, li: 0, start: this.t, wait: 0, stairs: 0, purpose };
    p.at = null; p.cust = false;
    this.walkNext(p);
    return true;
  }
  walkNext(p) {
    const trip = p.trip;
    const leg = trip.legs[trip.li];
    if (leg) {
      const t = this.world.transports().list.get(leg.tid);
      if (!t || leg.from !== p.level) { this.giveUp(p, 'noroute'); return; }
      p.tx = t.x + (t.kind === 'elev' ? this.rng.range(-0.6, 0.6) : 0);
    } else p.tx = trip.to.x;
    p.st = 'walk';
  }
  updateMovers(dt) {
    const stepLen = WALK_SPEED * dt;
    for (const p of this.people) {
      if (p.gone) continue;
      if (p.st === 'walk') {
        if (!this.world.segAt(p.level, Math.floor(p.x))) { this.giveUp(p, 'noroute'); continue; }
        const dx = p.tx - p.x;
        if (Math.abs(dx) <= stepLen) { p.x = p.tx; this.reachedWalkTarget(p); }
        else p.x += Math.sign(dx) * stepLen;
      } else if (p.st === 'stairs') {
        p.timer -= dt;
        if (p.timer <= 0) {
          p.level = p.tTo;
          p.trip.li++;
          this.walkNext(p);
        }
      }
    }
  }
  reachedWalkTarget(p) {
    const trip = p.trip;
    const leg = trip.legs[trip.li];
    if (!leg) { this.arrive(p); return; }
    const t = this.world.transports().list.get(leg.tid);
    if (!t) { this.giveUp(p, 'noroute'); return; }
    if (t.kind === 'stairs') {
      if (!this.world.segAt(leg.to, t.x)) { this.giveUp(p, 'noroute'); return; }
      p.st = 'stairs'; p.tid = t.id; p.timer = STAIRS_TIME; p.tFrom = leg.from; p.tTo = leg.to;
      trip.stairs++;
    } else {
      const e = t.obj;
      if (leg.to < e.bottom || leg.to > e.top) { this.giveUp(p, 'noroute'); return; }
      const es = this.elev.get(t.id);
      p.st = 'wait'; p.waitStart = this.t; p.elevId = t.id; p.dir = Math.sign(leg.to - leg.from);
      es.queue(p.level, p.dir).push(p);
    }
  }
  onBoard(p, car) {
    p.trip.wait += this.t - p.waitStart;
    p.st = 'ride';
  }
  onUnload(p, L, e) {
    p.level = L;
    p.x = e.x + 2 + this.rng.range(-0.8, 0.8);
    p.elevId = null;
    p.trip.li++;
    this.walkNext(p);
  }

  quality(trip) {
    const dur = this.t - trip.start;
    let q = 100 - Math.max(0, trip.wait - 3) * 5 - trip.stairs * 8 - Math.max(0, dur - 25) * 1.5;
    let issue = null;
    if (trip.wait > 8) issue = 'wait';
    else if (trip.stairs >= 2) issue = 'stairs';
    else if (dur > 40) issue = 'far';
    return { q: Math.max(0, Math.min(100, q)), issue };
  }
  record(facId, q, issue) {
    const f = facId && this.world.objects.get(facId);
    if (!f || f.score === undefined) return;
    f.score = f.score * 0.9 + q * 0.1;
    if (issue && q < 60) f.issue = issue;
    else if (q >= 80 && f.score > 65) f.issue = null;
  }

  arrive(p) {
    const trip = p.trip;
    p.trip = null;
    const { q, issue } = this.quality(trip);
    if (trip.dest.kind === 'exit') {
      p.st = 'off'; p.at = null;
      if (p.parkId) { const pk = this.world.objects.get(p.parkId); if (pk) pk.parked = Math.max(0, pk.parked - 1); p.parkId = null; }
      if (p.kind === 'visitor') { this.despawn(p); return; }
      if (p.kind === 'guest') { this.record(p.home, q, issue); this.guestDone(p, true); return; }
      this.record(p.home, q, issue);
      return;
    }
    const f = this.world.objects.get(trip.dest.id);
    if (!f) { this.sendOff(p, p.kind === 'guest'); return; }
    p.st = 'stay'; p.at = f.id; p.level = f.level; p.x = f.x + this.rng.range(1, f.w - 1);
    const purpose = trip.purpose;
    if (purpose === 'eat' || purpose === 'shop') {
      const ff = FAC[f.type];
      const inside = this.customersIn(f.id);
      if (!f.occupied || !this.isOpen(f) || inside >= ff.seats) {
        this.record(p.home, q * 0.5, 'full');
        this.doAction(p, { a: 'return' });
        return;
      }
      p.cust = true;
      f.customers++;
      this.today.customers++;
      this.record(p.home, Math.min(100, q + 5), issue);
      p.until = this.t + this.rng.range(ff.stay[0], ff.stay[1]);
      p.after = { a: 'return' };
      return;
    }
    if (purpose === 'clean') {
      p.until = this.t + 15;
      p.after = { a: 'cleaned', id: f.id };
      return;
    }
    // 自分の場所に着いた
    this.record(p.home, q, issue);
    if (p.kind === 'guest' && FAC[f.type].hotel) {
      f.guestsArrived = (f.guestsArrived || 0) + 1;
      if (f.room === 'booked') f.room = 'occupied';
    }
  }
  customersIn(fid) {
    let n = 0;
    for (const p of this.people) if (!p.gone && p.st === 'stay' && p.at === fid && p.cust) n++;
    return n;
  }
  // 途中であきらめた
  giveUp(p, reason) {
    const trip = p.trip;
    this.today.giveUps++;
    if (p.home) this.record(p.home, 0, reason === 'noroute' ? 'noroute' : 'wait');
    if (trip && trip.purpose === 'clean' && p.cleaning) { const r = this.world.objects.get(p.cleaning); if (r) r.cleaner = null; p.cleaning = null; }
    const wasGuest = p.kind === 'guest';
    this.sendOff(p, false);
    if (wasGuest) this.guestDone(p, false);
  }
  guestDone(p, arrivedOut) {
    const room = this.world.objects.get(p.home);
    this.despawn(p);
    if (!room || !FAC[room.type].hotel) return;
    room.guestsDone = (room.guestsDone || 0) + 1;
    if (room.guestsDone >= (room.guestsTotal || 1)) {
      if ((room.guestsArrived || 0) > 0) {
        room.room = 'dirty';
        const price = FAC[room.type].price;
        this.money += price; this.today.income += price; this.today.hotel += price;
      } else room.room = 'clean';
      room.guestsTotal = 0; room.guestsDone = 0; room.guestsArrived = 0;
    }
  }

  isOpen(f, m = this.mod) {
    const h = m / 60;
    return FAC[f.type].hours.some(([a, b]) => h >= a && h < b);
  }

  // ---------- 予定 ----------
  makePlan(p, day, fresh) {
    const base = day * 1440;
    const r = this.rng;
    const we = this.isWeekend(day);
    const plan = [];
    if (p.kind === 'worker') {
      if (!we) {
        plan.push({ t: base + r.int(450, 540), a: 'come' });
        if (r.chance(0.55)) plan.push({ t: base + r.int(700, 760), a: 'eat' });
        plan.push({ t: base + r.int(1020, 1110), a: 'leave' });
      }
    } else if (p.kind === 'resident') {
      if (!we && p.commuter) {
        plan.push({ t: base + r.int(420, 540), a: 'leave' });
        plan.push({ t: base + r.int(1020, 1200), a: 'come' });
        if (r.chance(0.2)) plan.push({ t: base + r.int(1210, 1290), a: 'shop' });
      } else {
        if (r.chance(we ? 0.5 : 0.35)) plan.push({ t: base + r.int(600, 960), a: 'shop' });
        if (r.chance(we ? 0.35 : 0.2)) plan.push({ t: base + (r.chance(0.5) ? r.int(690, 780) : r.int(1080, 1200)), a: 'eat' });
        if (we && r.chance(0.3)) { plan.push({ t: base + r.int(540, 720), a: 'leave' }); plan.push({ t: base + r.int(960, 1140), a: 'come' }); }
      }
    } else if (p.kind === 'staff') {
      plan.push({ t: base + r.int(500, 530), a: 'come' });
      plan.push({ t: base + 540 + r.int(0, 10), a: 'clean' });
      plan.push({ t: base + r.int(1040, 1070), a: 'leave' });
    }
    // 外に出たまま帰ってこられなかった人は、朝に帰ってくる
    if (p.kind === 'resident' && p.st === 'off' && !plan.some(x => x.a === 'come')) plan.push({ t: base + r.int(420, 600), a: 'come' });
    plan.sort((a, b) => a.t - b.t);
    p.plan = plan;
    p.pi = 0;
  }
  // 予定どおりなら今どこにいるか（読みこみ・入居のとき）
  placeByPlan(p) {
    const home = this.world.objects.get(p.home);
    const atHome = () => { if (home) { p.st = 'stay'; p.at = home.id; p.level = home.level; p.x = home.x + this.rng.range(1, home.w - 1); } };
    if (p.kind === 'resident' || p.kind === 'guest') atHome(); else { p.st = 'off'; p.at = null; }
    let i = 0;
    for (; i < p.plan.length && p.plan[i].t <= this.t; i++) {
      const a = p.plan[i].a;
      if (a === 'come') atHome();
      else if (a === 'leave' || a === 'checkout') { p.st = 'off'; p.at = null; }
    }
    p.pi = i;
  }

  doAction(p, it) {
    const a = it.a;
    if (a === 'come') {
      if (p.st === 'stay' && p.at === p.home) return;
      if (p.st !== 'off' && p.st !== 'stay') return;
      if (!this.startTrip(p, { kind: 'fac', id: p.home }, 'home')) {
        if (p.st === 'off' && p.home) this.record(p.home, 0, 'noroute');
        if (p.kind === 'guest') this.guestDone(p, false);
      }
    } else if (a === 'leave' || a === 'checkout') {
      if (p.st === 'off') { if (p.kind === 'guest') this.guestDone(p, false); return; }
      if (p.st !== 'stay') return;
      if (!this.startTrip(p, { kind: 'exit' }, 'out')) {
        this.sendOff(p, false);
        if (p.kind === 'guest') this.guestDone(p, false);
      }
    } else if (a === 'eat' || a === 'shop') {
      if (p.st !== 'stay' && !(p.st === 'off' && p.kind === 'visitor')) return;
      const type = a === 'eat' ? 'food' : 'shop';
      const f = it.id ? this.world.objects.get(it.id) : this.chooseShop(p, type);
      if (!f) {
        if (a === 'eat' && p.kind === 'worker') this.record(p.home, 55, 'nofood');
        if (p.kind === 'visitor') this.despawn(p);
        return;
      }
      if (!this.startTrip(p, { kind: 'fac', id: f.id }, a)) {
        if (a === 'eat' && p.kind === 'worker') this.record(p.home, 55, 'nofood');
        if (p.kind === 'visitor') this.sendOff(p, true);
      }
    } else if (a === 'return') {
      p.cust = false;
      const home = p.home && this.world.objects.get(p.home);
      if (p.kind === 'visitor' || !home) {
        if (!this.startTrip(p, { kind: 'exit' }, 'out')) this.sendOff(p, true);
      } else if (!this.startTrip(p, { kind: 'fac', id: home.id }, 'home')) {
        this.sendOff(p, false);
      }
    } else if (a === 'clean') {
      this.staffClean(p);
    } else if (a === 'cleaned') {
      const room = this.world.objects.get(it.id);
      if (room && room.room === 'dirty') room.room = 'clean';
      if (room) room.cleaner = null;
      p.cleaning = null;
      this.staffClean(p);
    }
  }
  chooseShop(p, type) {
    const list = this.world.ofType(type).filter(f => f.occupied && this.isOpen(f, (this.mod + 10) % 1440));
    if (!list.length) return null;
    let best = null, bv = Infinity;
    for (const f of list) {
      const v = Math.abs(f.level - p.level) * 1.5 + Math.abs(f.x - p.x) / 16 + this.rng.range(0, 6);
      if (v < bv) { bv = v; best = f; }
    }
    return best;
  }
  staffClean(p) {
    if (p.st !== 'stay') return;
    if (this.mod >= 1020) { if (p.at !== p.home) this.doAction(p, { a: 'come' }); return; }
    const rooms = [...this.world.objects.values()].filter(o => FAC[o.type].hotel && o.room === 'dirty' && !o.cleaner);
    if (!rooms.length) {
      if (p.at !== p.home) { this.doAction(p, { a: 'come' }); }
      p.until = this.t + 30; p.after = { a: 'clean' };
      return;
    }
    rooms.sort((a, b) => (Math.abs(a.level - p.level) * 4 + Math.abs(a.x - p.x) / 8) - (Math.abs(b.level - p.level) * 4 + Math.abs(b.x - p.x) / 8));
    const room = rooms[0];
    room.cleaner = p.id; p.cleaning = room.id;
    if (!this.startTrip(p, { kind: 'fac', id: room.id }, 'clean')) {
      room.cleaner = null; p.cleaning = null;
      p.until = this.t + 30; p.after = { a: 'clean' };
    }
  }

  // ---------- 毎分 ----------
  minuteTick(m) {
    const mod = m % 1440;
    if (mod === 0) this.dayStart();
    if (mod % 60 === 0) this.hourTick(mod / 60);
    this.spawnVisitors(mod);
    const n = this.people.length;
    for (let i = 0; i < n; i++) {
      const p = this.people[i];
      if (p.gone) continue;
      if (p.st === 'wait' && this.t - p.waitStart > GIVE_UP) { this.giveUp(p, 'wait'); continue; }
      const idle = p.st === 'stay' || p.st === 'off';
      if (!idle) continue;
      if (p.until !== null) {
        if (this.t >= p.until) { const a = p.after; p.until = null; p.after = null; this.doAction(p, a); }
        continue;
      }
      while (p.pi < p.plan.length && p.plan[p.pi].t <= this.t) {
        const it = p.plan[p.pi++];
        if (this.t - it.t > 90 && it.a !== 'leave' && it.a !== 'checkout') continue;
        this.doAction(p, it);
        break;
      }
    }
    if (mod % 10 === 0) this.people = this.people.filter(p => !p.gone);
    this._pop = null;
  }

  hourTick(h) {
    if (h >= 6 && h <= 21) this.moveIns();
    if (h === 15) this.bookHotel();
    this.checkStar();
  }

  moveIns() {
    for (const f of this.world.objects.values()) {
      const ff = FAC[f.type];
      if (!ff.tenant || f.occupied) continue;
      if (!this.rng.chance(ff.moveIn)) continue;
      if (!this.reachable(f)) continue;
      this.moveIn(f);
    }
  }
  // quiet：はじめから入居ずみにするとき（お知らせ・入居金なし）
  moveIn(f, quiet = false) {
    const ff = FAC[f.type];
    Object.assign(f, { occupied: true, score: 70, strikes: 0, lowDays: 0, customers: 0, lastCustomers: [], issue: null });
    if (!quiet) this.today.moveIns++;
    if (ff.moveInFee && !quiet) { this.money += ff.moveInFee; this.today.income += ff.moveInFee; this.today.fees += ff.moveInFee; }
    if (f.type === 'office') {
      for (let i = 0; i < ff.pop; i++) { const p = this.addPerson('worker', f.id); this.makePlan(p, this.day, true); this.placeByPlan(p); }
    } else if (f.type === 'home') {
      for (let i = 0; i < ff.pop; i++) { const p = this.addPerson('resident', f.id); this.makePlan(p, this.day, true); this.placeByPlan(p); }
    }
    if (!quiet) this.notify(`${levelName(f.level)}の${ff.name}に入居がありました`, 'good');
    this._pop = null;
  }
  moveOut(f, why) {
    const ff = FAC[f.type];
    for (const p of [...(this.members.get(f.id) || [])]) this.sendOff(p, true);
    for (const p of this.people) if (!p.gone && p.at === f.id && p.st === 'stay') this.doAction(p, { a: 'return' });
    this.members.delete(f.id);
    Object.assign(f, { occupied: false, strikes: 0, lowDays: 0, customers: 0 });
    this.today.moveOuts++;
    this.notify(`${levelName(f.level)}の${ff.name}が出ていきました（${why}）`, 'bad');
    this._pop = null;
  }

  bookHotel() {
    const spaces = this.world.ofType('parking').length * FAC.parking.spaces;
    const hasFood = this.world.ofType('food').some(f => f.occupied);
    const we = this.weekday === 4 || this.weekday === 5;
    const base = this.day * 1440;
    for (const room of this.world.objects.values()) {
      const ff = FAC[room.type];
      if (!ff.hotel || room.room !== 'clean') continue;
      let demand = 0.35 + 0.08 * this.star + Math.min(0.15, spaces * 0.01) + (we ? 0.15 : 0) + (hasFood ? 0.05 : 0);
      demand *= 0.5 + room.score / 200;
      if (!this.rng.chance(Math.min(0.95, demand))) continue;
      if (!this.reachable(room)) continue;
      room.room = 'booked'; room.guestsTotal = ff.beds; room.guestsDone = 0; room.guestsArrived = 0;
      const byCar = spaces > 0 && this.rng.chance(0.3);
      for (let i = 0; i < ff.beds; i++) {
        const p = this.addPerson('guest', room.id);
        const arrive = base + this.rng.int(960, 1260);
        p.plan = [{ t: arrive + i * 2, a: 'come' }];
        if (hasFood && this.rng.chance(0.4)) p.plan.push({ t: Math.max(arrive + 20, base + this.rng.int(1110, 1230)), a: 'eat' });
        p.plan.push({ t: base + 1440 + this.rng.int(420, 600), a: 'checkout' });
        p.pi = 0;
        if (byCar) this.parkCar(p);
      }
    }
  }
  parkCar(p) {
    const pk = this.world.ofType('parking').find(o => o.parked < FAC.parking.spaces);
    if (!pk) return;
    p.byCar = true; p.parkId = pk.id; pk.parked++;
  }

  spawnVisitors(mod) {
    if (mod < 600 || mod >= 1260 || this.visitors >= MAX_VISITORS) return;
    const pop = this.population();
    const spaces = this.world.ofType('parking').length * FAC.parking.spaces;
    const we = this.isWeekend();
    for (const f of this.world.objects.values()) {
      if ((f.type !== 'food' && f.type !== 'shop') || !f.occupied || !this.isOpen(f, mod)) continue;
      const base = f.type === 'food' ? 3.5 : 2.5;
      const rate = (base + pop / 120 + spaces * 0.25) * (we ? 1.6 : 1);
      if (!this.rng.chance(rate / 60)) continue;
      const p = this.addPerson('visitor', null);
      this.visitors++;
      if (spaces && this.rng.chance(Math.min(0.5, spaces / (spaces + 16)))) this.parkCar(p);
      this.doAction(p, { a: f.type === 'food' ? 'eat' : 'shop', id: f.id });
    }
  }

  dayStart() {
    // 前の日のしめ
    const prev = this.day - 1;
    const prevWeekday = prev >= 0 && !this.isWeekend(prev);
    let rent = 0, upkeep = 0;
    for (const o of this.world.objects.values()) {
      const f = FAC[o.type];
      if (f.tenant && o.occupied && (!f.weekdayOnly || prevWeekday)) rent += f.rent;
      if (o.type === 'elevator') upkeep += f.upkeepPerCar * o.cars;
      if (f.upkeep) upkeep += f.upkeep;
    }
    this.money += rent - upkeep;
    this.today.income += rent;
    this.today.expense += upkeep;
    const sum = { day: prev, ...this.today, rent, upkeep };
    this.history.unshift(sum);
    if (this.history.length > 14) this.history.length = 14;
    if (prev >= 0) this.events.push({ kind: 'daily', sum });
    // 入居者の気持ち
    for (const f of [...this.world.objects.values()]) {
      const ff = FAC[f.type];
      if (!ff.tenant || !f.occupied) continue;
      if (f.type === 'food' || f.type === 'shop') {
        f.lastCustomers = [f.customers, ...(f.lastCustomers || [])].slice(0, 3);
        f.lowDays = f.customers < ff.minCustomers ? f.lowDays + 1 : 0;
        f.customers = 0;
        if (f.lowDays >= 3) this.moveOut(f, 'お客さんが少ない');
      } else {
        if (f.score < 35) f.strikes++;
        else if (f.score >= 50) f.strikes = 0;
        else f.strikes = Math.max(0, f.strikes - 1);
        if (f.strikes >= 3) this.moveOut(f, issueText(f.issue) || '居心地がわるい');
      }
    }
    this.today = newDay();
    // 今日の予定
    for (const p of this.people) {
      if (p.gone || p.kind === 'guest' || p.kind === 'visitor') continue;
      this.makePlan(p, this.day, true);
    }
    if (this.money < 0) this.notify(`お金がマイナスです（${yen(this.money)}）。建てられません`, 'bad');
  }

  // ---------- セーブ ----------
  toJSON() {
    const objects = [];
    for (const o of this.world.objects.values()) {
      const c = { ...o };
      delete c.cleaner; delete c.guestsTotal; delete c.guestsDone; delete c.guestsArrived;
      if (c.parked !== undefined) c.parked = 0;
      objects.push(c);
    }
    return {
      v: SAVE_VERSION, seed: this.rng.s, t: this.t, money: this.money, star: this.star,
      nextId: this.world.nextId, objects, log: this.log.slice(0, 20), history: this.history.slice(0, 14), today: this.today,
    };
  }
  static fromJSON(d) {
    if (!d || d.v !== SAVE_VERSION || !Array.isArray(d.objects)) throw new Error('セーブデータの形がちがう');
    const g = new Game(d.seed);
    g.t = Math.floor(d.t);
    g.money = d.money; g.star = d.star;
    // 支えの順（下から・地下は上から）にならべて置く
    const objs = [...d.objects].sort((a, b) => Math.abs(a.level) - Math.abs(b.level));
    for (const o of objs) {
      const obj = { ...o };
      g.world.objects.set(obj.id, obj);
      g.world._mark(obj, obj.id);
    }
    g.world.nextId = Math.max(d.nextId, ...objs.map(o => o.id + 1), 1);
    g.log = d.log || []; g.history = d.history || []; g.today = { ...newDay(), ...(d.today || {}) };
    for (const o of g.world.objects.values()) {
      if (o.type === 'elevator') g.elev.set(o.id, new ElevState(o));
      if (o.type === 'housekeeping') for (let i = 0; i < FAC.housekeeping.staff; i++) { const p = g.addPerson('staff', o.id); g.makePlan(p, g.day, true); g.placeByPlan(p); }
      if (o.occupied && o.type === 'office') for (let i = 0; i < 6; i++) { const p = g.addPerson('worker', o.id); g.makePlan(p, g.day, true); g.placeByPlan(p); }
      if (o.occupied && o.type === 'home') for (let i = 0; i < 3; i++) { const p = g.addPerson('resident', o.id); g.makePlan(p, g.day, true); g.placeByPlan(p); }
      if (FAC[o.type].hotel && (o.room === 'booked' || o.room === 'occupied')) {
        const mod = g.mod;
        if (mod >= 600 && mod < 960) { o.room = 'dirty'; continue; }
        o.room = 'occupied';
        const beds = FAC[o.type].beds;
        o.guestsTotal = beds; o.guestsDone = 0; o.guestsArrived = beds;
        const base = (mod < 600 ? g.day : g.day + 1) * 1440;
        for (let i = 0; i < beds; i++) {
          const p = g.addPerson('guest', o.id);
          p.plan = [{ t: Math.max(g.t + 1, base + g.rng.int(420, 600)), a: 'checkout' }];
          p.pi = 0;
          p.st = 'stay'; p.at = o.id; p.level = o.level; p.x = o.x + g.rng.range(1, o.w - 1);
        }
      }
    }
    return g;
  }
}

export function issueText(issue) {
  return {
    wait: 'エレベーターを待ちすぎ',
    stairs: '階段がしんどい',
    far: '行き来に時間がかかる',
    noroute: '行けない所がある',
    nofood: 'お昼を食べる所がない',
    full: 'お店がいっぱい',
  }[issue] || null;
}

// 人数・お金などの見やすい形（画面用）
export function clockText(g) {
  const m = g.mod;
  const hh = Math.floor(m / 60), mm = Math.floor(m % 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
}

export { levelsOf, WIDTH };
