// のびのびタワー — 人のドット絵（こまかいドット：1ドット＝0.5）
// 文字の地図で描いて、いちどだけ小さなキャンバスに作っておく（cache）
const U = 0.5;
const cache = new Map();

const SKIN = [['#f6cfa8', '#e0a97e'], ['#f9dcc0', '#e8b896'], ['#d9a27a', '#b9805a']];
const HAIR = [['#3b2a24', '#24180f'], ['#1f1f2a', '#101018'], ['#6b4630', '#4a2e1c'], ['#c98a3c', '#9c6726'], ['#9a9aa4', '#72727c'], ['#5a3a28', '#3c2618']];
const OUTFIT = {
  worker: [{ j: '#2f4f8f', J: '#203a6c', t: '#d64550', p: '#3a4256' }, { j: '#4a5568', J: '#353d4c', t: '#3e7cc4', p: '#2e3442' }, { j: '#6b5040', J: '#4e3a2e', t: '#e0a030', p: '#3a3230' }],
  resident: [{ j: '#4caf6a', J: '#35884f', p: '#4a6aa0' }, { j: '#f2b544', J: '#cf9426', p: '#5a4a3a' }, { j: '#e57a9a', J: '#c45a7a', p: '#4a6aa0' }],
  guest: [{ j: '#8e4fc0', J: '#6c3496', p: '#3a3446' }, { j: '#2f9aa8', J: '#1f7884', p: '#33404a' }],
  visitor: [{ j: '#ef7d2e', J: '#c25e17', p: '#4a5a7a' }, { j: '#e2546a', J: '#b83a50', p: '#3a3446' }, { j: '#3f9fb8', J: '#2c7d93', p: '#5a4a3a' }, { j: '#7cb342', J: '#5a8f2a', p: '#4a5a7a' }],
  staff: [{ j: '#4dd0e1', J: '#2aa8b8', p: '#3a4256' }],
};
const FIXED = { E: '#2b2233', m: '#b0505a', b: '#f49b9b', w: '#f4f6fa', k: '#2a2226', q: '#f7a58f', Q: '#e0806a', r: '#e04848', d: '#7ec8f2', D: '#3e8ed0', c: '#ffffff', C: '#d8e4ea' };

// 顔（11×11）。E 目・m 口・b ほお
const FACE = {
  normal: ['.hhhsssshhh', '.hhssssssh.', '.hsssEssEs.', '.hSssEssEs.', '..Ssssssbs.', '..ssssmsss.'],
  blink: ['.hhhsssshhh', '.hhssssssh.', '.hssssssss.', '.hSssEssEs.', '..Ssssssbs.', '..ssssmsss.'],
  happy: ['.hhhsssshhh', '.hhsEssEsh.', '.hssEsEsEs.', '.hSssssssb.', '..Sssmmmss.', '..sssmmsss.'],
  tired: ['.hhhsssshhh', '.hhssssssh.', '.hsssEEsEE.', '.hSssssssd.', '..Sssssssd.', '..sssmmssD.'],
  angry: ['.hhhqqqqhhh', '.hhqEqqqqE.', '.hqqqEqqEq.', '.hQqqEqqEq.', '..Qqqqqqqr.', '..qqqmmmqq.'],
  sleep: ['.hhhsssshhh', '.hhssssssh.', '.hssssssss.', '.hSssEEsEE.', '..Ssssssbs.', '..ssssssss.'],
};
function head(face, style) {
  const top = style === 2
    ? ['...ccccc...', '..cccccccc.', '.cCCCCCCCcc', '.hhhhhhhhhh']
    : ['...hhhhh...', '..hhhhhhhh.', '.hhhhhhhhhh', '.hhhhhHhhhh'];
  const f = FACE[face] || FACE.normal;
  let rows = [...top, ...f, '...sssss...'];
  if (face === 'angry') rows[10] = '...qqqqq...';
  if (style === 1) rows = rows.map((r, i) => (i >= 5 && i <= 9 ? 'h' + r.slice(1) : r));
  return rows;
}
const TORSO = {
  worker: ['....sss....', '..jjwtwjj..', '.jjjwtwjjj.', '.jjjwtwjjj.', '.jjJjtjJjj.', '.jjJjjjJjj.', '.sjJjjjJjs.', '..pppppppp.'],
  resident: ['....sss....', '..jjjjjjj..', '.jjjjjjjjj.', '.jjjjjjjjj.', '.sjJjjjJjs.', '.sjJjjjJjs.', '..jJjjjJj..', '..pppppppp.'],
  guest: ['....sss....', '..jjjjjjj..', '.jjjjjjjjj.', '.jjjJjjjjj.', '.jjJjjjJjj.', '.jjJjjjJjj.', '.sjJjjjJjs.', '..pppppppp.'],
  staff: ['....sss....', '..jjjjjjj..', '.jjjwwwjjj.', '.jjwwwwwjj.', '.jjwwwwwjj.', '.jjwwwwwjj.', '.sjwwwwwjs.', '..pppppppp.'],
};
TORSO.visitor = TORSO.guest;
const STAND = ['..ppp.ppp..', '..pp...pp..', '..pp...pp..', '.kkk...kkk.', '...........'];
// 歩き6コマ
const LEGS = [
  ['..ppp.ppp..', '..pp...pp..', '..pp...pp..', '.kkk...kkk.', '...........'],
  ['..ppp.pp...', '..pp..ppp..', '.pp.....pp.', 'kkk......kk', '...........'],
  ['...pppp....', '...pppp....', '..pp..pp...', '.kkk..kkk..', '...........'],
  ['...ppppp...', '....ppp....', '....pp.....', '...kkkk....', '...........'],
  ['..ppp.pp...', '..pp..ppp..', '.pp.....pp.', 'kkk......kk', '...........'],
  ['...pppp....', '...pppp....', '..pp..pp...', '.kkk..kkk..', '...........'],
];
// 腕のふり（手の行）
const HANDS = { 1: '.jjJjjjJjss', 4: 'ssjJjjjJjj.' };

function look(p) {
  const h = Math.imul(p.id + 1, 2654435761) >>> 0;
  const outfits = OUTFIT[p.kind] || OUTFIT.visitor;
  return {
    skin: (h >>> 3) % 7 === 0 ? 2 : (h >>> 3) % 3 === 0 ? 1 : 0,
    hair: p.look % HAIR.length,
    style: p.kind === 'staff' ? 2 : (h >>> 7) % 3 === 0 ? 1 : 0,
    outfit: (h >>> 11) % outfits.length,
    bag: p.kind === 'worker' && (h >>> 13) % 2 === 0,
    suitcase: p.kind === 'guest',
  };
}
function palette(p, L, tint) {
  const o = (OUTFIT[p.kind] || OUTFIT.visitor)[L.outfit];
  const pal = { ...FIXED, s: SKIN[L.skin][0], S: SKIN[L.skin][1], h: HAIR[L.hair][0], H: HAIR[L.hair][1], j: tint || o.j, J: tint ? shade(tint) : o.J, t: o.t || o.j, p: o.p };
  return pal;
}
function shade(hex) {
  const n = parseInt(hex.slice(1), 16);
  const f = v => Math.max(0, Math.round(v * 0.75)).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}
function bake(rows, pal, flip) {
  const w = rows[0].length, hgt = rows.length;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, hgt) : Object.assign(document.createElement('canvas'), { width: w, height: hgt });
  const ctx = c.getContext('2d');
  for (let r = 0; r < hgt; r++) for (let x = 0; x < w; x++) {
    const ch = rows[r][x];
    if (!ch || ch === '.') continue;
    ctx.fillStyle = pal[ch] || ch;
    ctx.fillRect(flip ? w - 1 - x : x, r, 1, 1);
  }
  return c;
}
function rowsFor(p, L, pose, face, frame) {
  const torso = (TORSO[p.kind] || TORSO.visitor).slice();
  if (pose === 'walk' && HANDS[frame]) torso[6] = HANDS[frame];
  if (pose === 'sit' || pose === 'work') {
    const t = torso.slice(0, 7);
    if (pose === 'work') t[6] = '.sjJjjjJsss';
    return [...head(face, L.style), ...t, '.pppppppp..', '.ppppppppp.', '.......pp..', '.......kkk.'];
  }
  const legs = pose === 'walk' ? LEGS[frame % 6] : STAND;
  return [...head(face, L.style), ...torso, ...legs];
}

// 人を描く。x：まん中、y：足もと（どちらも世界の座標）
// pose：stand / walk / sit / work / sleep、face：normal / blink / happy / tired / angry
export function drawFigure(ctx, x, y, p, pose = 'stand', face = 'normal', frame = 0, flip = false, tint = null) {
  const L = look(p);
  const key = `${p.kind}|${L.skin}|${L.hair}|${L.style}|${L.outfit}|${pose}|${face}|${frame}|${flip ? 1 : 0}|${tint || ''}`;
  let c = cache.get(key);
  if (!c) {
    const pal = palette(p, L, tint);
    if (pose === 'sleep') c = bake(['..hhhhh..', '.hhhhhhh.', '.hsssssh.', '.hsEEsEEh', '..sssss..'], pal, flip);
    else c = bake(rowsFor(p, L, pose, face, frame), pal, flip);
    cache.set(key, c);
  }
  const w = c.width * U, h = c.height * U;
  const bob = pose === 'walk' && (frame === 1 || frame === 4) ? -U : 0;
  // スーツケース（うしろに引く）
  if (L.suitcase && pose === 'walk') {
    const sx = flip ? x + 2.5 : x - 5;
    ctx.fillStyle = '#5a6b8a'; ctx.fillRect(sx, y - 4.5, 2.5, 3.5);
    ctx.fillStyle = '#3e4a62'; ctx.fillRect(sx, y - 1, 2.5, 0.5); ctx.fillRect(sx + (flip ? 0 : 2), y - 6, 0.5, 1.5);
    ctx.fillStyle = '#222'; ctx.fillRect(sx + 0.5, y - 0.5, 0.5, 0.5); ctx.fillRect(sx + 1.5, y - 0.5, 0.5, 0.5);
  }
  ctx.drawImage(c, Math.round((x - w / 2) * 2) / 2, Math.round((y - h + bob) * 2) / 2, w, h);
  // かばん（手に持つ）
  if (L.bag && (pose === 'walk' || pose === 'stand')) {
    const hx = flip ? x - w / 2 + 0.5 : x + w / 2 - 1.5;
    ctx.fillStyle = '#5d4037'; ctx.fillRect(hx, y - 6 + bob, 2, 1.5);
    ctx.fillStyle = '#3e2723'; ctx.fillRect(hx + 0.5, y - 6.5 + bob, 1, 0.5);
  }
}
export const FIG_H = 13; // 立っている人の高さ（世界の座標）

// 頭の上のしるし（1ドット＝1）
const MARK = {
  sweat: ['...d...', '..ddd..', '.dddDd.', '.ddddD.', '..dDD..'],
  angry: ['.r...r.', 'rr...rr', '..r.r..', '.......', '..r.r..', 'rr...rr', '.r...r.'],
  note: ['...EE', '...EE', '...E.', '...E.', 'EEE..', 'EEE..'],
  heart: ['.rr.rr.', 'rrrrrrr', 'rcrrrrr', '.rrrrr.', '..rrr..', '...r...'],
  zz: ['EEEE.....', '..E......', '.E..EEE..', 'EEEE..E..', '.....E...', '....EEE..'],
};
export function drawMark(ctx, x, y, kind, scale = 0.5) {
  const key = `mark|${kind}`;
  let c = cache.get(key);
  if (!c) { c = bake(MARK[kind], { ...FIXED, E: '#3a3a48' }, false); cache.set(key, c); }
  ctx.drawImage(c, x - c.width * scale / 2, y - c.height * scale, c.width * scale, c.height * scale);
}

// まばたき：人ごとに少しずつずらして、3〜4秒に1回
export function blinking(p, real) {
  const period = 3200 + (p.id % 7) * 130;
  return (real + p.id * 733) % period < 130;
}
