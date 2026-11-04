// ボタン・パネル・タップの操作
import { FAC, TOOL_ORDER, SPEEDS, STAR_LIMITS, DAY_NAMES, ELEV_MAX_CARS, TILE_W, FLOOR_H, levelName, yen } from './config.js';
import { iconCanvas } from './sprites.js';
import { clockText, issueText, Game } from './sim.js';

const $ = sel => document.querySelector(sel);
const SAVE_KEY = 'nobinobi-tower-save';
const HELP_KEY = 'nobinobi-tower-help';

export function encodeSave(game) {
  const json = JSON.stringify(game.toJSON());
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'NOBI1.' + btoa(bin);
}
export function decodeSave(text) {
  text = (text || '').trim();
  if (text.startsWith('{')) return Game.fromJSON(JSON.parse(text));
  if (!text.startsWith('NOBI1.')) throw new Error('のびのびタワーのセーブではないみたい');
  const bin = atob(text.slice(6).replace(/\s+/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return Game.fromJSON(JSON.parse(new TextDecoder().decode(bytes)));
}
export function loadLocal() {
  try { const s = localStorage.getItem(SAVE_KEY); return s ? decodeSave(s) : null; } catch (e) { return null; }
}
export function saveLocal(game) {
  try { localStorage.setItem(SAVE_KEY, encodeSave(game)); return true; } catch (e) { return false; }
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game, renderer, onNewGame) {
    this.game = game;
    this.r = renderer;
    this.onNewGame = onNewGame;
    this.tool = 'look';
    this.speed = 1;
    this.pending = null;     // タッチで置く前の確認
    this.elevStart = null;   // エレベーターの1つめの端
    this.pointers = new Map();
    this.drag = null;
    this.lastPanelUpdate = 0;
    this.lastSave = performance.now();
    this.buildTools();
    this.bind();
    this.update(0, true);
  }
  setGame(g) {
    this.game = g;
    this.closePanel(); this.cancelPending();
    this.r.selected = null;
    this.buildTools();
    this.update(0, true);
  }

  // ---------- 下のボタン ----------
  buildTools() {
    const box = $('#tools');
    box.innerHTML = '';
    const mk = (id, label, sub, icon) => {
      const b = document.createElement('button');
      b.className = 'tool'; b.dataset.tool = id;
      const ic = document.createElement('span'); ic.className = 'ic';
      if (icon) { const img = document.createElement('img'); img.src = icon; img.alt = ''; ic.appendChild(img); }
      else ic.textContent = id === 'look' ? '👆' : '🔨';
      b.appendChild(ic);
      const n = document.createElement('span'); n.className = 'nm'; n.textContent = label; b.appendChild(n);
      const p = document.createElement('span'); p.className = 'pr'; p.textContent = sub; b.appendChild(p);
      box.appendChild(b);
      return b;
    };
    mk('look', 'みる', 'しらべる');
    mk('erase', 'こわす', '');
    for (const t of TOOL_ORDER) {
      const f = FAC[t];
      const src = iconCanvas(t);
      const c = document.createElement('canvas');
      c.width = src.width; c.height = src.height;
      c.getContext('2d').drawImage(src, 0, 0);
      const b = mk(t, f.name, t === 'elevator' ? `${yen(f.cost)}〜` : yen(f.cost), c.toDataURL());
      if (f.star > this.game.star) { b.classList.add('locked'); b.querySelector('.pr').textContent = `★${f.star}で解放`; }
    }
    this.markTool();
  }
  markTool() {
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === this.tool);
  }
  setTool(t) {
    if (FAC[t] && FAC[t].star > this.game.star) { this.toast(`${FAC[t].name}は★${FAC[t].star}になると建てられるよ`); return; }
    this.tool = t;
    this.cancelPending();
    this.closePanel();
    this.markTool();
    if (t === 'elevator') this.hint('エレベーター：下の端の階をタップして、つぎに上の端の階をタップ');
    else if (t === 'stairs') this.hint('階段：タップした階と、そのすぐ上の階をつなぐよ');
    else if (t === 'erase') this.hint('こわすものをタップ（お金はもどらないよ）');
    else if (FAC[t]) this.hint(`${FAC[t].long || FAC[t].name}：置きたい所をタップ`);
    else this.hint('');
  }

  // ---------- 入力 ----------
  bind() {
    const cv = this.r.canvas;
    $('#tools').addEventListener('click', e => { const b = e.target.closest('.tool'); if (b) this.setTool(b.dataset.tool); });
    $('#speed').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { this.speed = Number(b.dataset.s); this.update(0, true); } });
    $('#menuBtn').addEventListener('click', () => this.showMenu());
    $('#cfOk').addEventListener('click', () => this.confirmPending());
    $('#cfNo').addEventListener('click', () => this.cancelPending());
    $('#panel').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) this.panelAction(b.dataset.act); });
    $('#goal').addEventListener('click', () => this.showGoal());
    $('#next').addEventListener('click', () => this.doNext());
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key === ' ') { this.speed = this.speed ? 0 : 1; this.update(0, true); e.preventDefault(); }
      if (e.key === 'Escape') { this.cancelPending(); this.closePanel(); this.setTool('look'); }
      if (['1', '2', '3'].includes(e.key)) { this.speed = Number(e.key); this.update(0, true); }
    });
    cv.addEventListener('pointerdown', e => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ためし用のイベントなど */ }
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.drag = { x: e.clientX, y: e.clientY, cx: this.r.cam.x, cy: this.r.cam.y, moved: false, t: performance.now(), type: e.pointerType, button: e.button };
        // 点線の枠の上から指を動かしたら、枠を動かす（枠の外なら画面が動く）
        const gh = this.r.ghost;
        if (gh && this.pending && e.pointerType !== 'mouse' && FAC[this.tool] && this.tool !== 'elevator' && gh.type === this.tool) {
          const pk = this.r.pick(e.clientX, e.clientY);
          const w = FAC[gh.type].w, top = -(gh.level + 1) * 24;
          if (pk.tx >= gh.x - 1 && pk.tx <= gh.x + w && pk.wy >= top - 6 && pk.wy <= top + 30) this.drag.ghost = { dx: pk.tx - gh.x };
        }
      }
      else if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: this.r.cam.z }; if (this.drag) this.drag.moved = true; }
    });
    cv.addEventListener('pointermove', e => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2 && this.pinch) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, this.pinch.z * d / this.pinch.d, true);
        return;
      }
      if (this.drag && this.pointers.size === 1 && this.drag.ghost) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) this.drag.moved = true;
        if (!this.drag.moved) return;
        const pk = this.r.pick(e.clientX, e.clientY);
        const w = FAC[this.tool].w;
        const x = Math.max(0, Math.min(64 - w, pk.tx - this.drag.ghost.dx));
        const gh = this.r.ghost;
        if (!gh || x !== gh.x || pk.level !== gh.level) this.offerBuild(this.setGhost(this.tool, x, pk.level));
        return;
      }
      if (this.drag && this.pointers.size === 1) {
        const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 8) this.drag.moved = true;
        if (this.drag.moved) { this.r.cam.x = this.drag.cx - dx / this.r.cam.z; this.r.cam.y = this.drag.cy - dy / this.r.cam.z; }
      } else if (e.pointerType === 'mouse' && !this.pointers.size) this.hover(e.clientX, e.clientY);
    });
    const end = e => {
      const wasDrag = this.drag;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!this.pointers.size) {
        this.drag = null;
        if (wasDrag && !wasDrag.moved && e.type === 'pointerup') this.tap(e.clientX, e.clientY, wasDrag.type);
      }
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !this.pending && this.tool !== 'elevator') this.r.ghost = null; });
    cv.addEventListener('wheel', e => { e.preventDefault(); this.zoomAt(e.clientX, e.clientY, this.r.cam.z * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    $('#zoomIn').addEventListener('click', () => this.zoomAt(this.r.vw / 2, this.r.vh / 2, this.r.cam.z * 1.4));
    $('#zoomOut').addEventListener('click', () => this.zoomAt(this.r.vw / 2, this.r.vh / 2, this.r.cam.z / 1.4));
  }
  zoomAt(sx, sy, z) {
    const before = this.r.screenToWorld(sx, sy);
    this.r.cam.z = Math.max(0.5, Math.min(6, z));
    this.r.clampCam();
    const after = this.r.screenToWorld(sx, sy);
    this.r.cam.x += before.x - after.x; this.r.cam.y += before.y - after.y;
  }

  placementAt(sx, sy) {
    const { tx, level } = this.r.pick(sx, sy);
    const f = FAC[this.tool];
    const x = Math.max(0, Math.min(64 - f.w, tx - Math.floor(f.w / 2)));
    return { x, level };
  }
  hover(sx, sy) {
    if (!FAC[this.tool] || this.pending) return;
    const { x, level } = this.placementAt(sx, sy);
    if (this.tool === 'elevator') {
      if (this.elevStart) this.setGhost('elevator', this.elevStart.x, this.elevStart.level, level);
      else this.setGhost('elevator', x, level, level + 1);
    } else this.setGhost(this.tool, x, level);
  }
  setGhost(type, x, level, top) {
    const r = this.game.checkBuild(type, x, level, top);
    this.r.ghost = { type, x, level, top, ok: r.ok, reason: r.reason, cost: r.cost };
    return this.r.ghost;
  }
  tap(sx, sy, ptype) {
    const t = this.tool;
    if (t === 'look' || t === 'erase') {
      const { tx, level } = this.r.pick(sx, sy);
      const o = this.game.world.objAt(level, tx);
      if (!o) { this.closePanel(); this.r.selected = null; return; }
      if (t === 'look') this.openPanel(o.id);
      else {
        const r = this.game.checkRemove(o.id);
        if (!r.ok) { this.toast(`こわせない：${r.reason}`); return; }
        this.r.selected = o.id;
        this.askPending({ kind: 'erase', id: o.id }, `${FAC[o.type].long || FAC[o.type].name}（${levelName(o.level)}）をこわす？ お金はもどらないよ`, 'こわす');
      }
      return;
    }
    if (!FAC[t]) return;
    const { x, level } = this.placementAt(sx, sy);
    const mouse = ptype === 'mouse';
    if (t === 'elevator') {
      if (!this.elevStart) {
        this.elevStart = { x, level };
        this.setGhost('elevator', x, level, level);
        this.hint(`エレベーター：${levelName(level)}から。もう一方の端の階をタップ`);
        return;
      }
      const gh = this.setGhost('elevator', this.elevStart.x, this.elevStart.level, level);
      const lo = Math.min(level, this.elevStart.level), hi = Math.max(level, this.elevStart.level);
      const label = `エレベーター ${levelName(lo)}〜${levelName(hi)}`;
      if (mouse && gh.ok) { this.doBuild(gh); return; }
      if (!gh.ok) { this.toast(`${label}：${gh.reason}`); this.elevStart = null; this.r.ghost = null; this.hint('もう一度、下の端の階からタップしてね'); return; }
      this.askPending({ kind: 'build', gh }, `${label}　${yen(gh.cost)}`, '建てる');
      return;
    }
    // 同じ所をもう一度タップしたら建てる
    const pg = this.pending && this.pending.kind === 'build' && this.pending.gh;
    if (!mouse && pg && pg.type === t && pg.x === x && pg.level === level) { this.confirmPending(); return; }
    const gh = this.setGhost(t, x, level);
    if (mouse) { if (gh.ok) this.doBuild(gh); else this.toast(gh.reason); return; }
    this.offerBuild(gh);
  }
  // 置く前の確認（枠は指で動かせる）
  offerBuild(gh) {
    const name = FAC[gh.type].long || FAC[gh.type].name;
    if (!gh.ok) this.askPending({ kind: 'none' }, `${name}（${levelName(gh.level)}）：${gh.reason}`, null);
    else this.askPending({ kind: 'build', gh }, `${name}（${levelName(gh.level)}）　${yen(gh.cost)}　※枠を指で動かせるよ`, '建てる');
  }
  doBuild(gh) {
    const r = this.game.build(gh.type, gh.x, gh.level, gh.top);
    if (!r.ok) { this.toast(r.reason); return; }
    this.sfx('build');
    this.elevStart = null;
    this.r.ghost = null;
    if (gh.type === 'elevator') this.hint('エレベーター：下の端の階をタップして、つぎに上の端の階をタップ');
    this.update(0, true);
  }
  askPending(p, text, okLabel) {
    this.pending = p;
    $('#cfText').textContent = text;
    $('#cfOk').hidden = !okLabel;
    if (okLabel) $('#cfOk').textContent = okLabel;
    $('#cfNo').textContent = okLabel ? 'やめる' : 'とじる';
    $('#confirm').hidden = false;
  }
  confirmPending() {
    const p = this.pending;
    if (!p) return;
    $('#confirm').hidden = true;
    this.pending = null;
    if (p.kind === 'build') this.doBuild(p.gh);
    else if (p.kind === 'erase') {
      const r = this.game.remove(p.id);
      if (!r.ok) this.toast(r.reason); else this.sfx('erase');
      this.r.selected = null;
    } else if (p.kind === 'reset') this.onNewGame(Game.starter());
  }
  cancelPending() {
    this.pending = null;
    $('#confirm').hidden = true;
    if (this.tool !== 'elevator' || !this.elevStart) this.r.ghost = null;
    if (this.tool === 'elevator') { this.elevStart = null; this.r.ghost = null; }
    if (this.tool === 'erase') this.r.selected = null;
  }

  // ---------- しらべるパネル ----------
  openPanel(id) {
    this.panelId = id;
    this.r.selected = id;
    $('#panel').hidden = false;
    this.renderPanel();
  }
  closePanel() { this.panelId = null; $('#panel').hidden = true; if (this.tool === 'look') this.r.selected = null; }
  renderPanel() {
    const g = this.game;
    const o = g.world.objects.get(this.panelId);
    if (!o) { this.closePanel(); return; }
    const f = FAC[o.type];
    const rows = [];
    const btns = [];
    let title = `${f.long || f.name}`;
    if (o.type === 'elevator') {
      const es = g.elev.get(o.id);
      title += `　${levelName(o.bottom)}〜${levelName(o.top)}`;
      let maxW = 0, n = 0;
      for (const q of es.queues.values()) for (const p of [...q.up, ...q.down]) { n++; maxW = Math.max(maxW, g.t - p.waitStart); }
      const riding = es.cars.reduce((s, c) => s + c.pass.length, 0);
      rows.push(['かご', `${o.cars}台（${ELEV_MAX_CARS}台まで）`]);
      rows.push(['待っている人', `${n}人${n ? `（いちばん長い人 ${Math.floor(maxW)}分）` : ''}`]);
      rows.push(['乗っている人', `${riding}人`]);
      rows.push(['お手入れ代', `${yen(FAC.elevator.upkeepPerCar * o.cars)}／日`]);
      btns.push(['addCar', `かご＋（${yen(f.carCost)}）`, o.cars < ELEV_MAX_CARS]);
      btns.push(['removeCar', 'かご−', o.cars > 1]);
      btns.push(['extUp', `上へのばす（${yen(f.perLevel)}）`, true]);
      btns.push(['extDown', `下へのばす（${yen(f.perLevel)}）`, true]);
      btns.push(['shrinkUp', '上を1階ちぢめる', o.top - o.bottom > 1]);
      btns.push(['shrinkDown', '下を1階ちぢめる', o.top - o.bottom > 1]);
    } else {
      title += `　${levelName(o.level)}`;
      if (f.tenant) {
        if (o.occupied) {
          const n = (g.members.get(o.id) || []).length;
          rows.push(['ようす', o.type === 'office' ? `入居中・${f.pop}人が働く` : o.type === 'home' ? `入居中・${f.pop}人が住む` : '営業中']);
          if (o.type === 'office' || o.type === 'home') rows.push(['満足度', scoreBar(o.score)]);
          if (o.issue && o.score < 70) rows.push(['ひとこと', `「${issueText(o.issue)}…」`]);
          if (o.type === 'food' || o.type === 'shop') {
            rows.push(['今日のお客さん', `${o.customers}人（1日${f.minCustomers}人はほしい）`]);
            if (o.lowDays) rows.push(['ようす', `お客さんが少ない日が${o.lowDays}日つづいている（3日で閉店）`]);
            rows.push(['営業時間', f.hours.map(([a, b]) => `${a}:00〜${b}:00`).join('・')]);
          }
          if (o.strikes) rows.push(['注意', `不満の日が${o.strikes}日（3日で出ていく）`]);
          rows.push(['家賃', `${yen(f.rent)}／${f.weekdayOnly ? '平日' : '日'}`]);
          if (n && o.type === 'office') rows.push(['いま', `${(g.members.get(o.id) || []).filter(p => p.st === 'stay' && p.at === o.id).length}人いる`]);
        } else {
          rows.push(['ようす', '空き（入居者をまっている）']);
          if (this.r.reach.get(o.id) === false) rows.push(['注意', '1Fのロビーから行けないので、入居者が来ない。エレベーターか階段でつないでね']);
          if (f.moveInFee) rows.push(['入居金', yen(f.moveInFee)]);
          rows.push(['家賃', `${yen(f.rent)}／${f.weekdayOnly ? '平日' : '日'}`]);
        }
      } else if (f.hotel) {
        rows.push(['ようす', { clean: 'きれい（お客さんをまっている）', booked: '予約あり', occupied: 'お客さんが泊まっている', dirty: 'よごれている（お掃除室の人がきれいにする）' }[o.room]]);
        rows.push(['評判', scoreBar(o.score)]);
        if (o.issue && o.score < 70) rows.push(['ひとこと', `「${issueText(o.issue)}…」`]);
        rows.push(['1泊', yen(f.price)]);
        if (!g.count('housekeeping')) rows.push(['注意', 'お掃除室がないと、よごれた部屋がそのまま']);
        if (this.r.reach.get(o.id) === false) rows.push(['注意', 'ロビーから行けないので、お客さんが来ない']);
      } else {
        const desc = {
          lobby: '人の入り口。外から来る人はみんなここから入るよ',
          stairs: 'すぐ上の階とつなぐ。たくさん上るのはしんどい',
          security: `★2の条件。お手入れ代 ${yen(f.upkeep)}／日`,
          clinic: `★3の条件。お手入れ代 ${yen(f.upkeep)}／日`,
          housekeeping: `ホテルの部屋をお掃除する人が${f.staff}人いる。お手入れ代 ${yen(f.upkeep)}／日`,
          parking: `車で来る人がふえる（${f.spaces}台）。★3の条件。いま${o.parked || 0}台`,
        }[o.type];
        if (desc) rows.push(['', desc]);
      }
    }
    const canErase = g.checkRemove(o.id);
    btns.push(['erase', 'こわす', canErase.ok]);
    $('#panel').innerHTML = `<div class="ph"><b>${esc(title)}</b><button data-act="close" class="x">×</button></div>`
      + `<table>${rows.map(([k, v]) => `<tr>${k ? `<th>${esc(k)}</th><td>${v.startsWith && v.startsWith('<') ? v : esc(v)}</td>` : `<td colspan="2">${esc(v)}</td>`}</tr>`).join('')}</table>`
      + `<div class="pb">${btns.map(([a, l, ok]) => `<button data-act="${a}" ${ok ? '' : 'disabled'}${this.next && this.next.open === this.panelId && this.next.act === a ? ' class="suggest"' : ''}>${esc(l)}</button>`).join('')}</div>`;
  }
  panelAction(a) {
    const g = this.game, id = this.panelId;
    let r = { ok: true };
    if (a === 'close') { this.closePanel(); return; }
    if (a === 'addCar') r = g.addCar(id);
    if (a === 'removeCar') r = g.removeCar(id);
    if (a === 'extUp') r = g.extendElevator(id, 1);
    if (a === 'extDown') r = g.extendElevator(id, -1);
    if (a === 'shrinkUp') r = g.shrinkElevator(id, 1);
    if (a === 'shrinkDown') r = g.shrinkElevator(id, -1);
    if (a === 'erase') {
      const o = g.world.objects.get(id);
      this.askPending({ kind: 'erase', id }, `${FAC[o.type].long || FAC[o.type].name}をこわす？ お金はもどらないよ`, 'こわす');
      return;
    }
    if (!r.ok) this.toast(r.reason); else this.sfx('build');
    this.renderPanel();
    this.update(0, true);
  }

  // ---------- 上の表示 ----------
  update(now, force) {
    const g = this.game;
    if (!force && now - this.lastHud < 200) return;
    this.lastHud = now;
    $('#stars').textContent = '★'.repeat(g.star) + '☆'.repeat(3 - g.star);
    const goal = g.goal();
    $('#pop').textContent = goal ? `${g.population()}／${goal.pop}人` : `${g.population()}人`;
    $('#money').textContent = yen(g.money);
    $('#money').classList.toggle('neg', g.money < 0);
    $('#clock').textContent = `${g.week}週目 ${DAY_NAMES[g.weekday]} ${clockText(g)}${g.isNight() && this.speed ? ' 🌙' : ''}`;
    for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', Number(b.dataset.s) === this.speed);
    $('#goal').innerHTML = this.goalLine();
    if (force || !this.lastNext || now - this.lastNext > 1000) { this.lastNext = now; this.showNext(); }
    // できごと
    while (g.events.length) {
      const ev = g.events.shift();
      if (ev.kind === 'starup') { this.showStar(ev.star); this.buildTools(); }
      else if (ev.kind === 'daily') {
        const s = ev.sum, net = s.income - s.expense;
        this.toast(`${s.day + 1}日目のしめ：${net >= 0 ? '+' : ''}${yen(net)}（入${yen(s.income)}・出${yen(s.expense)}）`, 'daily');
        saveLocal(g); this.lastSave = now;
      } else if (ev.msg) this.toast(ev.msg, ev.kind);
    }
    if (this.panelId && now - this.lastPanelUpdate > 500) { this.lastPanelUpdate = now; this.renderPanel(); }
    if (now - this.lastSave > 30000) { saveLocal(g); this.lastSave = now; }
  }
  // ---------- つぎにやること（上の 👉 の行。押すとその操作へ） ----------
  showNext() {
    const s = this.nextStep();
    this.next = s;
    const el = $('#next');
    el.innerHTML = s ? `👉 ${s.text}` : '';
    el.hidden = !s;
    for (const b of document.querySelectorAll('.tool')) b.classList.toggle('suggest', !!s && b.dataset.tool === s.tool && this.tool !== s.tool);
  }
  nextStep() {
    const g = this.game, w = g.world;
    if (!w.ofType('lobby').length) return { text: '1Fに<b>ロビー</b>を建てよう（人の入り口）', tool: 'lobby' };
    const tr = w.transports();
    if (!tr.list.size) return { text: '<b>エレベーター</b>で1Fと上の階をつなごう', tool: 'elevator' };
    // 待ちくたびれている人がいるエレベーター
    let busy = null;
    for (const [id, es] of g.elev) {
      const o = w.objects.get(id);
      if (!o || o.cars >= ELEV_MAX_CARS) continue;
      let maxW = 0;
      for (const q of es.queues.values()) for (const p of [...q.up, ...q.down]) maxW = Math.max(maxW, g.t - p.waitStart);
      if (maxW >= 12 && (!busy || maxW > busy.maxW)) busy = { id, maxW };
    }
    if (busy) return { text: 'エレベーターが混んでる！ <b>かご＋</b>で台数をふやそう', open: busy.id, act: 'addCar' };
    // とどいていない部屋（✕）
    const lb = w.ofType('lobby')[0];
    const lost = [...w.objects.values()].find(o => FAC[o.type].tenant && !o.occupied && !g.route({ level: 0, x: lb.x + lb.w / 2 }, { level: o.level, x: o.x + o.w / 2 }));
    if (lost) {
      const e = [...tr.list.values()].find(t => t.kind === 'elev');
      const act = e && lost.level < e.obj.bottom ? 'extDown' : 'extUp';
      return { text: `${levelName(lost.level)}の${FAC[lost.type].name}に、エレベーターを<b>${act === 'extUp' ? '上へ' : '下へ'}のばそう</b>`, open: e && e.id, act };
    }
    // ★の条件の施設（人数が半分をこえたら）
    const goal = g.goal();
    if (goal && g.population() >= goal.pop / 2) {
      const miss = goal.need.find(n => !n.ok);
      const tool = miss && (miss.type === 'rooms' ? 'single' : miss.type);
      if (tool && FAC[tool].star <= g.star) {
        const spot = this.findSpot(tool);
        if (spot) return { text: `★${goal.star}には<b>${miss.label}</b>がいるよ。${levelName(spot.level)}に建てよう`, tool, spot };
      }
    }
    // 空いている階に、オフィスか住まい
    const spot = this.findSpot('office');
    if (spot) {
      const tool = w.ofType('office').length > w.ofType('home').length * 2 ? 'home' : 'office';
      if (g.money < spot.cost) return { text: 'お金がたまるのを待とう。家賃は毎日のしめに入るよ', tool: null };
      return { text: `${levelName(spot.level)}があいてるよ。<b>${FAC[tool].name}</b>を建てよう`, tool, spot: this.findSpot(tool) || spot };
    }
    // 空きがない：エレベーターを上へ
    const lim = STAR_LIMITS[g.star];
    const e = [...tr.list.values()].filter(t => t.kind === 'elev').sort((a, b) => b.obj.top - a.obj.top)[0];
    if (e && e.obj.top < lim.top) return { text: `${levelName(e.obj.top + 1)}に建てるには、エレベーターを<b>上へのばす</b>`, open: e.id, act: 'extUp' };
    return null;
  }
  // エレベーター・階段のとどく階で、床がつながる置き場所をさがす（いちばん下の階・乗りものの近くから）
  findSpot(type) {
    const g = this.game, w = g.world, f = FAC[type];
    const tr = w.transports();
    const levels = [...tr.byLevel.keys()].sort((a, b) => a - b);
    for (const level of levels) {
      const ts = tr.byLevel.get(level);
      const segs = new Set(ts.map(t => w.segAt(level, Math.floor(t.x))).filter(Boolean));
      const cx = ts[0].x;
      const xs = [];
      for (let x = 0; x + f.w <= 64; x++) xs.push(x);
      xs.sort((a, b) => Math.abs(a + f.w / 2 - cx) - Math.abs(b + f.w / 2 - cx));
      for (const x of xs) {
        const touch = segs.has(w.segAt(level, x - 1)) || segs.has(w.segAt(level, x + f.w));
        if (!touch) continue;
        const r = w.check(type, x, level, g.star);
        if (r.ok) return { x, level, cost: r.cost };
      }
    }
    return null;
  }
  doNext() {
    const s = this.next;
    if (!s) return;
    if (s.open) { this.setTool('look'); this.openPanel(s.open); this.showNext(); return; }
    if (!s.tool) return;
    this.setTool(s.tool);
    const b = document.querySelector(`.tool[data-tool="${s.tool}"]`);
    if (b) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    if (s.spot) {
      const f = FAC[s.tool];
      const gh = this.setGhost(s.tool, s.spot.x, s.spot.level);
      this.r.cam.x = (s.spot.x + f.w / 2) * TILE_W;
      this.r.cam.y = -(s.spot.level + 0.5) * FLOOR_H;
      this.r.clampCam();
      this.offerBuild(gh);
    }
    this.showNext();
  }
  goalLine() {
    const g = this.game;
    const goal = g.goal();
    if (!goal) return '★3達成！ 50Fをめざして、のびのび育てよう';
    const parts = [`人数 ${Math.min(g.population(), goal.pop)}/${goal.pop}${goal.popOk ? '✓' : ''}`];
    for (const n of goal.need) parts.push(`${n.label}${n.ok ? '✓' : `（${n.have}/${n.n}）`}`);
    return `次の★${goal.star}：${parts.join('・')}`;
  }
  showGoal() {
    const g = this.game, goal = g.goal();
    const lim = STAR_LIMITS[g.star];
    let html = `<h2>${'★'.repeat(g.star)} いまのタワー</h2><p>人数 ${g.population()}人／建てられるのは ${levelName(lim.top)}${lim.bottom < 0 ? `・${levelName(lim.bottom)}` : ''} まで</p>`;
    if (goal) {
      html += `<h3>★${goal.star}になる条件</h3><ul><li>${goal.popOk ? '✅' : '⬜'} 人数 ${goal.pop}人（いま${g.population()}人）</li>${goal.need.map(n => `<li>${n.ok ? '✅' : '⬜'} ${esc(n.label)}</li>`).join('')}</ul>`;
    }
    const h = g.history.slice(0, 7);
    if (h.length) html += `<h3>最近のお金</h3><table class="hist">${h.map(s => `<tr><td>${s.day + 1}日目</td><td>+${yen(s.income)}</td><td>-${yen(s.expense)}</td></tr>`).join('')}</table>`;
    if (g.log.length) html += `<h3>最近のできごと</h3><ul class="log">${g.log.slice(0, 10).map(l => `<li>${esc(l.msg)}</li>`).join('')}</ul>`;
    this.modal(html, [['とじる', null]]);
  }

  // ---------- 知らせ ----------
  toast(msg, kind = 'info') {
    const box = $('#toasts');
    const d = document.createElement('div');
    d.className = `toast ${kind}`;
    d.textContent = msg;
    box.prepend(d);
    while (box.children.length > 3) box.lastChild.remove();
    setTimeout(() => d.classList.add('fade'), kind === 'star' ? 6000 : 3500);
    setTimeout(() => d.remove(), kind === 'star' ? 7000 : 4500);
  }
  hint(msg) {
    const h = $('#hint');
    h.textContent = msg;
    h.hidden = !msg;
  }
  sfx() {}

  modal(html, buttons) {
    const m = $('#modal');
    m.querySelector('.mc').innerHTML = html;
    const bb = m.querySelector('.mb');
    bb.innerHTML = '';
    for (const [label, fn, cls] of buttons) {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.addEventListener('click', () => { if (!fn || fn() !== false) m.hidden = true; });
      bb.appendChild(b);
    }
    m.hidden = false;
  }
  showHelp() {
    this.modal(`<h2>のびのびタワーの遊び方</h2>
      <ol>
        <li>上の 👉 の行が「つぎにやること」。押すと、そのボタンと置く場所が出るよ</li>
        <li>1Fの<b>ロビー</b>が入り口。<b>エレベーター</b>（または階段）でつながった階にだけ人が来る</li>
        <li><b>オフィス</b>や<b>住まい</b>を建てると、入居者がやってくる。つながっていない部屋には ✕ が出て、だれも来ない</li>
        <li>エレベーターが混むと、待ちくたびれて<b>赤く</b>なる。満足度が下がりつづけると出ていっちゃう。かごを足したり、本数をふやそう</li>
        <li>人数と施設の条件で<b>★</b>が上がり、建てられる物と高さがふえる（★3まで）</li>
      </ol>
      <p class="small">操作：ドラッグで動かす／ピンチ・ホイールで大きく小さく／下のボタンで建てる。「みる」で部屋をタップすると、くわしく見られるよ。<br>平日の朝・お昼・夕方はエレベーターがいちばん混む時間！</p>`,
      [['はじめる', () => { try { localStorage.setItem(HELP_KEY, '1'); } catch (e) {} }]]);
  }
  showStar(star) {
    const lim = STAR_LIMITS[star];
    const unlocked = Object.values(FAC).filter(f => f.star === star).map(f => f.long || f.name);
    this.modal(`<div class="starup">${'★'.repeat(star)}</div><h2>★${star}になりました！</h2>
      <p>${levelName(lim.top)}${lim.bottom < 0 ? `・${levelName(lim.bottom)}` : ''}まで建てられるよ</p>
      ${unlocked.length ? `<p>新しく建てられる：${unlocked.map(esc).join('・')}</p>` : ''}
      ${star === 3 ? '<p>りっぱなタワーになりました。ここからは自由に、のびのび育ててね！</p>' : ''}`, [['やったー！', null]]);
  }
  showMenu() {
    this.modal(`<h2>メニュー</h2><p class="small">セーブは自動でこの端末に保存されるよ。ほかの端末へ移すときは「書き出す」→「読みこむ」</p>`, [
      ['遊び方', () => { setTimeout(() => this.showHelp(), 0); }],
      [`満足度の色：${this.r.showScore ? 'ON' : 'OFF'}`, () => { this.r.showScore = !this.r.showScore; }],
      ['セーブを書き出す', () => { setTimeout(() => this.showExport(), 0); }],
      ['セーブを読みこむ', () => { setTimeout(() => this.showImport(), 0); }],
      ['さいしょから', () => { setTimeout(() => this.askPending({ kind: 'reset' }, 'いまのタワーを消して、さいしょからやり直す？（書き出していないセーブは消えます）', 'やり直す'), 0); }, 'danger'],
      ['とじる', null],
    ]);
  }
  showExport() {
    const code = encodeSave(this.game);
    this.modal(`<h2>セーブを書き出す</h2><p class="small">この文字をコピーして、ほかの端末の「読みこむ」に貼ってね</p><textarea id="exportBox" readonly>${esc(code)}</textarea>`, [
      ['コピー', () => {
        const t = $('#exportBox'); t.select();
        (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => this.toast('コピーしたよ'), () => { document.execCommand && document.execCommand('copy'); this.toast('コピーしたよ'); });
        return false;
      }],
      ...(window.__NOBI_ARTIFACT ? [] : [['ファイルで保存', () => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
        a.download = `nobinobi-tower-${this.game.week}w${this.game.weekday + 1}d.txt`;
        a.click();
        return false;
      }]]),
      ['とじる', null],
    ]);
  }
  showImport() {
    this.modal(`<h2>セーブを読みこむ</h2><p class="small">書き出した文字を貼るか、ファイルをえらんでね。いまのタワーは上書きされるよ</p><textarea id="importBox" placeholder="NOBI1.…"></textarea><input type="file" id="importFile" accept=".txt,text/plain">`, [
      ['読みこむ', () => {
        const run = text => {
          try { const g = decodeSave(text); this.onNewGame(g); this.toast('読みこんだよ'); $('#modal').hidden = true; }
          catch (e) { this.toast(`読みこめなかった：${e.message}`, 'bad'); }
        };
        const file = $('#importFile').files[0];
        if (file) file.text().then(run); else run($('#importBox').value);
        return false;
      }],
      ['やめる', null],
    ]);
  }
}

function scoreBar(s) {
  const n = Math.round(s);
  const cls = s >= 65 ? 'good' : s >= 35 ? 'mid' : 'bad';
  const word = s >= 65 ? 'まんぞく' : s >= 35 ? 'ふつう' : 'ふまん';
  return `<span class="bar ${cls}"><i style="width:${n}%"></i></span> ${n}（${word}）`;
}
