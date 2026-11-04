import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/sim.js';
import { findRoute } from '../src/route.js';

// 1Fにロビー（x=4..7 はエレベーター用にあける）
function baseTower(g, top = 4) {
  for (let x = 0; x < 64; x += 4) if (x !== 4) assert.ok(g.build('lobby', x, 0).ok, `lobby ${x}`);
  assert.ok(g.build('elevator', 4, 0, top).ok, 'elevator');
}

test('建てる決まり', () => {
  const g = new Game(1);
  g.money = 1e9;
  assert.equal(g.checkBuild('lobby', 0, 1).ok, false, 'ロビーは1Fだけ');
  assert.equal(g.checkBuild('office', 0, 1).ok, false, '支えがない');
  assert.ok(g.build('lobby', 0, 0).ok);
  assert.ok(g.build('lobby', 4, 0).ok);
  assert.ok(g.build('office', 0, 1).ok, '支えがあれば建つ');
  assert.equal(g.checkBuild('office', 2, 1).ok, false, '重なる');
  assert.equal(g.checkBuild('parking', 0, -1).ok, false, '地下は★2から');
  assert.equal(g.checkBuild('shop', 0, 0).ok, false, 'お店は★2から');
  g.star = 2;
  assert.ok(g.checkBuild('parking', 0, -1).ok, '★2なら地下');
  assert.equal(g.checkBuild('parking', 0, -2).ok, false, 'B2は上がないと掘れない');
  assert.equal(g.checkRemove(g.world.objAt(0, 0).id).ok, false, '上を支えている');
  assert.equal(g.checkBuild('office', 0, 15).ok, false);
});

test('道さがし：ロビーからエレベーターで5Fへ', () => {
  const g = new Game(2);
  g.money = 1e9;
  baseTower(g, 4);
  for (let l = 1; l <= 4; l++) assert.ok(g.build('office', 8, l).ok);
  const r = findRoute(g.world, { level: 0, x: 30 }, { level: 4, x: 12 });
  assert.ok(r, '道がある');
  assert.equal(r.legs.length, 1);
  assert.equal(r.legs[0].to, 4);
  // 階段だけ
  const h = new Game(3); h.money = 1e9;
  for (let x = 4; x < 64; x += 4) h.build('lobby', x, 0);
  assert.ok(h.build('stairs', 2, 0).ok);
  assert.ok(h.build('office', 2, 1).ok);
  const r2 = findRoute(h.world, { level: 0, x: 40 }, { level: 1, x: 6 });
  assert.ok(r2 && r2.legs.length === 1, '階段で行ける');
});

test('1日：入居して、エレベーターで通って、家賃が入る', () => {
  const g = new Game(4);
  g.money = 1e8;
  baseTower(g, 6);
  for (let l = 1; l <= 6; l++) { g.build('office', 8, l); g.build('office', 16, l); }
  for (const o of g.world.ofType('office')) g.moveIn(o);
  assert.equal(g.population(), 72);
  const before = g.money;
  g.advance(24 * 60 + 5); // 月曜6:00 → 火曜6:05
  assert.ok(g.money > before, '家賃が入る');
  const es = g.elev.get(g.world.ofType('elevator')[0].id);
  // 火曜の朝、出勤してくる
  g.advance(3 * 60);
  const atWork = g.people.filter(p => p.kind === 'worker' && p.st === 'stay').length;
  assert.ok(atWork > 40, `出勤している人 ${atWork}`);
  assert.ok(es.cars.length === 1);
  for (const o of g.world.ofType('office')) assert.ok(o.score > 30, `満足度 ${o.score.toFixed(0)}`);
});

test('かごが少ないと待ち時間で満足度が下がる', () => {
  const run = cars => {
    const g = new Game(5);
    g.money = 1e9;
    baseTower(g, 14);
    for (let l = 1; l <= 14; l++) for (let x = 8; x < 64; x += 8) g.build('office', x, l);
    for (let i = 1; i < cars; i++) g.addCar(g.world.ofType('elevator')[0].id);
    for (const o of g.world.ofType('office')) g.moveIn(o);
    g.advance(3 * 1440);
    const offices = g.world.ofType('office');
    return offices.reduce((s, o) => s + o.score, 0) / offices.length;
  };
  const one = run(1), six = run(6);
  assert.ok(six > one + 10, `1台 ${one.toFixed(0)} / 6台 ${six.toFixed(0)}`);
});

test('ホテル：泊まって、お掃除して、お金が入る', () => {
  const g = new Game(6);
  g.money = 1e9; g.star = 2;
  baseTower(g, 3);
  for (let x = 8; x < 64; x += 4) { g.build('single', x, 1); }
  g.build('housekeeping', 8, 2);
  g.advance(10 * 60); // 16:00
  const booked = g.world.ofType('single').filter(r => r.room !== 'clean').length;
  assert.ok(booked > 3, `予約 ${booked}`);
  g.advance(20 * 60); // 次の日 12:00
  const dirtyOrClean = g.world.ofType('single').map(r => r.room);
  assert.ok(g.today.hotel > 0 || g.history[0].hotel > 0, 'ホテルのお金');
  assert.ok(dirtyOrClean.filter(s => s === 'dirty').length < booked, 'お掃除が進む');
});

test('★2になる（人数と警備室）', () => {
  const make = withSecurity => {
    const g = new Game(7);
    g.money = 1e9;
    baseTower(g, 14);
    if (withSecurity) assert.ok(g.build('security', 8, 1).ok);
    for (let l = 1; l <= 14; l++) for (let x = 8; x < 64; x += 8) if (!g.world.at(l, x)) g.build('office', x, l);
    for (const o of g.world.ofType('office')) g.moveIn(o);
    assert.ok(g.population() >= 300, `人数 ${g.population()}`);
    g.advance(61);
    return g;
  };
  assert.equal(make(false).star, 1, '警備室がないと上がらない');
  assert.equal(make(true).star, 2, '警備室があれば★2');
});

test('セーブして読みこむ', () => {
  const g = new Game(8);
  g.money = 1e8;
  baseTower(g, 4);
  for (let l = 1; l <= 4; l++) g.build('home', 8, l);
  for (const o of g.world.ofType('home')) g.moveIn(o);
  g.advance(500);
  const json = JSON.parse(JSON.stringify(g.toJSON()));
  const h = Game.fromJSON(json);
  assert.equal(h.world.objects.size, g.world.objects.size);
  assert.equal(h.money, g.money);
  assert.equal(h.population(), g.population());
  h.advance(1440);
  assert.ok(h.t > g.t);
});

test('はじめの小さなビル', () => {
  const g = Game.starter(7);
  assert.equal(g.population(), 21);
  assert.equal(g.money, 3000000);
  assert.ok(g.checkBuild('office', 22, 4).ok, '5F に建てられる');
  assert.ok(g.build('office', 22, 4).ok);
  const o = [...g.world.objects.values()].find(x => x.type === 'office' && x.level === 4);
  assert.ok(g.reachable(o), '5F までエレベーターがとどく');
  g.advance(60 * 24 * 2);
  assert.ok(g.population() > 21, '空き部屋に入居がある');
});
