// ドット絵（すべてコードで描く）
import { TILE_W, FLOOR_H, FAC } from './config.js';

const cache = new Map();

function canvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
function P(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }

const ITEM_COLORS = ['#ef5350', '#42a5f5', '#ffca28', '#66bb6a', '#ab47bc', '#ff7043', '#26c6da'];

function room(ctx, W, wall, low) {
  P(ctx, 0, 0, W, FLOOR_H, wall);
  if (low) P(ctx, 0, 15, W, 6, low);
  P(ctx, 0, 0, W, 2, '#4b4f5a');           // 天井
  P(ctx, 0, 21, W, 1, '#8c7f70');          // 床
  P(ctx, 0, 22, W, 2, '#5b5048');
  P(ctx, 0, 0, 1, FLOOR_H, 'rgba(0,0,0,0.25)');
  P(ctx, W - 1, 0, 1, FLOOR_H, 'rgba(0,0,0,0.18)');
}
function plant(ctx, x) {
  P(ctx, x, 17, 4, 4, '#c0703f'); P(ctx, x, 17, 4, 1, '#d98a55');
  P(ctx, x + 1, 11, 2, 6, '#2e7d32'); P(ctx, x - 1, 12, 2, 3, '#43a047'); P(ctx, x + 3, 13, 2, 3, '#43a047'); P(ctx, x, 10, 4, 2, '#66bb6a');
}
function vacantSign(ctx, W) {
  const x = Math.floor(W / 2) - 6;
  P(ctx, x + 5, 12, 2, 9, '#8d6e63');
  P(ctx, x, 5, 12, 8, '#e53935'); P(ctx, x + 1, 6, 10, 6, '#ffffff');
  P(ctx, x + 2, 7, 3, 1, '#e53935'); P(ctx, x + 6, 7, 4, 1, '#e53935');
  P(ctx, x + 2, 9, 8, 1, '#90a4ae'); P(ctx, x + 2, 10, 5, 1, '#90a4ae');
}

const DRAW = {
  lobby(ctx, W, s, v) {
    room(ctx, W, '#f5ecd9');
    for (let x = 0; x < W; x += 4) P(ctx, x, 20, 4, 2, (x / 4) % 2 ? '#d6c7a8' : '#ece1cb');
    P(ctx, 15, 2, 2, 18, '#e3d5b8'); P(ctx, 17, 2, 1, 18, '#cbbb98');
    P(ctx, 6, 2, 3, 1, '#fff3b0'); P(ctx, 24, 2, 3, 1, '#fff3b0');
    if (v % 3 === 0) plant(ctx, 5);
    else if (v % 3 === 1) { P(ctx, 20, 17, 10, 1, '#8d6e63'); P(ctx, 21, 18, 1, 2, '#5d4037'); P(ctx, 28, 18, 1, 2, '#5d4037'); }
    else { P(ctx, 4, 6, 8, 5, '#b3e5fc'); P(ctx, 4, 6, 8, 1, '#90a4ae'); P(ctx, 4, 10, 8, 1, '#90a4ae'); }
  },
  stairs(ctx, W) {
    P(ctx, 0, 0, W, FLOOR_H, 'rgba(239,230,211,0.0)');
    for (let i = 0; i < 8; i++) {
      const y = 21 - Math.round((i + 1) * 21 / 8);
      P(ctx, i * 2, y, W - i * 2, 22 - y, '#b9a98d');
      P(ctx, i * 2, y, 2, 1, '#e0d3b6');
    }
    for (let i = 0; i < 16; i++) P(ctx, i, Math.round(13 - i * 21 / 16), 1, 1, '#6d6d6d');
  },
  office(ctx, W, s) {
    room(ctx, W, '#e8edf3', '#d3dbe6');
    if (s === 'vacant') { vacantSign(ctx, W); return; }
    P(ctx, 2, 4, 12, 7, '#9aa4b1'); P(ctx, 3, 5, 10, 5, '#ffffff');
    P(ctx, 4, 6, 5, 1, '#e57373'); P(ctx, 4, 8, 7, 1, '#64b5f6');
    P(ctx, W - 9, 4, 4, 4, '#555'); P(ctx, W - 8, 5, 2, 2, '#fff');
    for (const dx of [16, 32, 48]) {
      if (dx + 12 > W) continue;
      P(ctx, dx, 15, 11, 1, '#b08458'); P(ctx, dx + 1, 16, 9, 4, '#8d6a46');
      P(ctx, dx + 3, 10, 6, 5, '#2f3542'); P(ctx, dx + 4, 11, 4, 3, '#7fd0ff'); P(ctx, dx + 5, 14, 2, 1, '#2f3542');
      P(ctx, dx + 11, 12, 1, 5, '#3d5a99'); P(ctx, dx + 10, 16, 2, 1, '#3d5a99'); P(ctx, dx + 10, 17, 1, 4, '#333');
    }
    plant(ctx, W - 5);
  },
  home(ctx, W, s, v) {
    const walls = ['#f6dcc2', '#dcebd0', '#d8e3f6'], blankets = ['#e57373', '#64b5f6', '#ffb74d'], sofas = ['#6b8e5a', '#8d6e9e', '#c17a5b'];
    room(ctx, W, walls[v % 3]);
    if (s === 'vacant') { vacantSign(ctx, W); return; }
    P(ctx, 26, 4, 12, 8, '#ffffff'); P(ctx, 27, 5, 10, 6, '#9fd3f2'); P(ctx, 31, 5, 1, 6, '#ffffff');
    P(ctx, 25, 4, 2, 9, '#f48fb1'); P(ctx, 37, 4, 2, 9, '#f48fb1');
    P(ctx, 3, 11, 2, 10, '#8d5a3c'); P(ctx, 5, 18, 16, 3, '#a0693f'); P(ctx, 5, 16, 16, 2, '#fafafa');
    P(ctx, 10, 15, 11, 3, blankets[v % 3]); P(ctx, 6, 15, 4, 2, '#ffffff');
    P(ctx, 22, 10, 3, 3, '#ffe082'); P(ctx, 23, 13, 1, 8, '#757575');
    const sc = sofas[v % 3];
    P(ctx, 40, 16, 14, 5, sc); P(ctx, 41, 13, 12, 3, sc); P(ctx, 40, 14, 2, 7, sc); P(ctx, 52, 14, 2, 7, sc);
    P(ctx, 42, 16, 10, 1, 'rgba(255,255,255,0.25)');
    P(ctx, 56, 10, 7, 6, '#263238'); P(ctx, 57, 11, 5, 4, '#4fc3f7'); P(ctx, 56, 17, 7, 4, '#8d6e63');
    P(ctx, 38, 21, 18, 1, '#c5a1d6');
  },
  food(ctx, W, s) {
    room(ctx, W, '#f7dfb3', '#d19a62');
    if (s === 'vacant') { vacantSign(ctx, W); return; }
    for (const x of [8, 30, 52]) { P(ctx, x + 2, 2, 1, 2, '#555'); P(ctx, x + 1, 4, 3, 3, '#e53935'); P(ctx, x + 1, 5, 3, 1, '#ffcc80'); }
    P(ctx, 32, 6, 12, 6, '#3e2723'); P(ctx, 34, 8, 8, 1, '#fff'); P(ctx, 34, 10, 5, 1, '#fff');
    for (const x of [5, 25, 45]) {
      P(ctx, x, 15, 12, 1, '#a86b3c'); P(ctx, x + 5, 16, 2, 5, '#6d4426');
      P(ctx, x - 2, 13, 1, 5, '#c62828'); P(ctx, x - 2, 17, 2, 1, '#c62828'); P(ctx, x - 2, 18, 1, 3, '#6d4426');
      P(ctx, x + 13, 13, 1, 5, '#c62828'); P(ctx, x + 12, 17, 2, 1, '#c62828'); P(ctx, x + 13, 18, 1, 3, '#6d4426');
      P(ctx, x + 3, 14, 2, 1, '#ffffff'); P(ctx, x + 8, 14, 2, 1, '#ffffff');
    }
    P(ctx, 70, 14, 24, 1, '#e8c48f'); P(ctx, 70, 15, 24, 6, '#8d5a3b');
    P(ctx, 72, 5, 20, 1, '#8d5a3b');
    for (let i = 0; i < 8; i++) P(ctx, 73 + i * 2.4 | 0, 3, 1, 2, ITEM_COLORS[i % ITEM_COLORS.length]);
    P(ctx, 84, 8, 3, 2, '#ffffff'); P(ctx, 84, 10, 3, 4, '#ffffff'); P(ctx, 85, 9, 1, 1, '#f1c27d');
  },
  shop(ctx, W, s, v) {
    room(ctx, W, '#fdeee9');
    for (let x = 0; x < W; x += 4) P(ctx, x, 2, 4, 2, (x / 4) % 2 ? '#ffffff' : '#ef5350');
    if (s === 'vacant') { vacantSign(ctx, W); return; }
    for (const sx of [3, 19, 35]) {
      P(ctx, sx, 7, 1, 14, '#8d6e63'); P(ctx, sx + 13, 7, 1, 14, '#8d6e63');
      for (const y of [10, 14, 18]) {
        P(ctx, sx, y, 14, 1, '#a1887f');
        for (let i = 0; i < 6; i++) P(ctx, sx + 1 + i * 2, y - 2, 2, 2, ITEM_COLORS[(i + y + sx + v) % ITEM_COLORS.length]);
      }
    }
    P(ctx, 52, 15, 10, 6, '#607d8b'); P(ctx, 52, 15, 10, 1, '#90a4ae'); P(ctx, 54, 12, 5, 3, '#37474f'); P(ctx, 55, 13, 3, 1, '#a5d6a7');
  },
  single(ctx, W, s) {
    room(ctx, W, '#e9def2');
    bed(ctx, 2, s);
    P(ctx, 22, 16, 5, 5, '#a1887f'); P(ctx, 23, 12, 3, 2, '#ffe082'); P(ctx, 24, 14, 1, 2, '#757575');
    P(ctx, 10, 5, 7, 5, '#8d6e63'); P(ctx, 11, 6, 5, 3, '#81c784');
    if (s === 'dirty') { P(ctx, 27, 20, 3, 1, '#ffffff'); P(ctx, 16, 21, 3, 1, '#8d6e63'); }
  },
  twin(ctx, W, s) {
    room(ctx, W, '#efe3d0');
    bed(ctx, 2, s); bed(ctx, 25, s);
    P(ctx, 20, 16, 4, 5, '#a1887f'); P(ctx, 21, 12, 2, 2, '#ffe082');
    P(ctx, 41, 5, 5, 5, '#8d6e63'); P(ctx, 42, 6, 3, 3, '#64b5f6');
    if (s === 'dirty') { P(ctx, 42, 20, 3, 1, '#ffffff'); P(ctx, 12, 21, 3, 1, '#8d6e63'); }
  },
  housekeeping(ctx, W) {
    room(ctx, W, '#e0f2f1');
    for (const x of [2, 13]) {
      P(ctx, x, 10, 10, 11, '#b0bec5'); P(ctx, x + 1, 11, 8, 9, '#eceff1');
      P(ctx, x + 3, 13, 4, 4, '#90caf9'); P(ctx, x + 4, 12, 2, 1, '#90caf9'); P(ctx, x + 4, 17, 2, 1, '#90caf9');
      P(ctx, x + 2, 11, 2, 1, '#26a69a');
    }
    P(ctx, 28, 11, 1, 9, '#78909c'); P(ctx, 40, 11, 1, 9, '#78909c');
    for (const y of [12, 16]) { P(ctx, 28, y + 2, 13, 1, '#78909c'); P(ctx, 30, y, 4, 2, '#ffffff'); P(ctx, 35, y, 4, 2, '#80deea'); }
    P(ctx, 29, 20, 2, 1, '#37474f'); P(ctx, 38, 20, 2, 1, '#37474f');
    P(ctx, 26, 5, 20, 1, '#8d6e63'); P(ctx, 28, 3, 4, 2, '#ffcc80'); P(ctx, 34, 3, 4, 2, '#ffffff'); P(ctx, 40, 3, 4, 2, '#ce93d8');
  },
  security(ctx, W) {
    room(ctx, W, '#cfd8dc', '#b0bec5');
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      const x = 4 + c * 10, y = 3 + r * 6;
      P(ctx, x, y, 9, 5, '#263238'); P(ctx, x + 1, y + 1, 7, 3, (r + c) % 2 ? '#66bb6a' : '#4fc3f7');
    }
    P(ctx, 2, 15, 34, 1, '#78909c'); P(ctx, 3, 16, 32, 5, '#546e7a');
    for (let i = 0; i < 6; i++) P(ctx, 6 + i * 4, 14, 2, 1, ITEM_COLORS[i]);
    P(ctx, 44, 12, 3, 1, '#1a237e'); P(ctx, 44, 13, 3, 1, '#f1c27d'); P(ctx, 44, 14, 3, 4, '#283593'); P(ctx, 44, 18, 1, 3, '#1a237e'); P(ctx, 46, 18, 1, 3, '#1a237e');
    P(ctx, 54, 7, 8, 14, '#90a4ae'); P(ctx, 57, 7, 1, 14, '#78909c'); P(ctx, 55, 12, 1, 1, '#37474f'); P(ctx, 59, 12, 1, 1, '#37474f');
  },
  clinic(ctx, W) {
    room(ctx, W, '#f3f8fb', '#e1eef5');
    P(ctx, 6, 4, 3, 7, '#e53935'); P(ctx, 4, 6, 7, 3, '#e53935');
    P(ctx, 16, 15, 20, 2, '#ffffff'); P(ctx, 22, 14, 14, 2, '#a5d6a7'); P(ctx, 17, 14, 4, 1, '#ffffff');
    P(ctx, 16, 17, 20, 1, '#b0bec5'); P(ctx, 17, 18, 1, 3, '#90a4ae'); P(ctx, 34, 18, 1, 3, '#90a4ae');
    P(ctx, 14, 3, 26, 1, '#90a4ae');
    for (let i = 0; i < 3; i++) P(ctx, 37 + i, 4, 1, 16, i % 2 ? '#81d4fa' : '#b3e5fc');
    P(ctx, 46, 8, 13, 13, '#bdbdbd'); P(ctx, 47, 9, 11, 11, '#eeeeee'); P(ctx, 47, 14, 11, 1, '#bdbdbd');
    for (let i = 0; i < 4; i++) { P(ctx, 48 + i * 3, 11, 2, 3, ['#ef9a9a', '#90caf9', '#fff59d', '#a5d6a7'][i]); P(ctx, 48 + i * 3, 16, 2, 3, ['#90caf9', '#fff59d', '#a5d6a7', '#ef9a9a'][i]); }
  },
  parking(ctx, W) {
    P(ctx, 0, 0, W, FLOOR_H, '#5f646c');
    P(ctx, 0, 0, W, 2, '#3d4048'); P(ctx, 0, 21, W, 3, '#3f4349'); P(ctx, 0, 20, W, 1, '#4a4e55');
    for (let x = 0; x <= W; x += 16) P(ctx, Math.min(x, W - 1), 16, 1, 5, '#e0e0e0');
    P(ctx, 2, 4, 10, 4, '#1565c0'); P(ctx, 5, 5, 4, 2, '#ffffff');
    P(ctx, 0, 0, 1, FLOOR_H, 'rgba(0,0,0,0.3)');
  },
};

function bed(ctx, x, s) {
  P(ctx, x, 11, 2, 10, '#6d4c41'); P(ctx, x + 2, 18, 16, 3, '#8d6e63'); P(ctx, x + 2, 16, 16, 2, '#ffffff');
  if (s === 'dirty') {
    P(ctx, x + 8, 15, 6, 2, '#9575cd'); P(ctx, x + 13, 16, 5, 2, '#b39ddb'); P(ctx, x + 6, 16, 2, 1, '#d7ccc8'); P(ctx, x + 3, 16, 3, 1, '#eeeeee');
  } else {
    P(ctx, x + 7, 15, 11, 3, '#7e57c2'); P(ctx, x + 7, 15, 11, 1, '#9575cd'); P(ctx, x + 3, 15, 4, 2, '#ffffff');
  }
}

export function facilitySprite(type, state = '', variant = 0) {
  const key = `${type}|${state}|${variant}`;
  let c = cache.get(key);
  if (c) return c;
  const W = (type === 'lobby' ? 4 : FAC[type].w) * TILE_W;
  c = canvas(W, FLOOR_H);
  const ctx = c.getContext('2d');
  DRAW[type](ctx, W, state, variant);
  cache.set(key, c);
  return c;
}

export function shaftSprite() {
  const key = 'shaft';
  let c = cache.get(key);
  if (c) return c;
  c = canvas(32, FLOOR_H);
  const ctx = c.getContext('2d');
  P(ctx, 0, 0, 32, FLOOR_H, '#2f3440');
  P(ctx, 2, 0, 1, FLOOR_H, '#555c69'); P(ctx, 29, 0, 1, FLOOR_H, '#555c69');
  P(ctx, 15, 0, 2, FLOOR_H, '#1e222a');
  P(ctx, 3, 2, 26, 1, '#8b93a1'); P(ctx, 3, 2, 1, 20, '#8b93a1'); P(ctx, 28, 2, 1, 20, '#8b93a1');
  P(ctx, 0, 22, 32, 2, '#4b4f5a');
  P(ctx, 14, 0, 4, 1, '#ffcc80');
  cache.set(key, c);
  return c;
}

export function carSprite(open) {
  const key = open ? 'car-open' : 'car';
  let c = cache.get(key);
  if (c) return c;
  c = canvas(24, 19);
  const ctx = c.getContext('2d');
  P(ctx, 0, 0, 24, 19, '#7d8595');
  P(ctx, 1, 1, 22, 17, open ? '#f7f1d6' : '#d6dbe3');
  P(ctx, 1, 1, 22, 1, '#fff8c4');
  if (!open) { P(ctx, 2, 3, 9, 14, '#b8bfca'); P(ctx, 13, 3, 9, 14, '#b8bfca'); P(ctx, 11, 3, 2, 14, '#8b93a1'); }
  else { P(ctx, 1, 3, 2, 14, '#b8bfca'); P(ctx, 21, 3, 2, 14, '#b8bfca'); }
  cache.set(key, c);
  return c;
}

const CAR_COLORS = ['#e53935', '#1e88e5', '#fdd835', '#43a047', '#ffffff', '#8e24aa', '#fb8c00'];
export function drawCar(ctx, x, y, n) {
  const col = CAR_COLORS[n % CAR_COLORS.length];
  P(ctx, x + 1, y + 2, 11, 3, col); P(ctx, x + 3, y, 7, 2, col);
  P(ctx, x + 4, y + 1, 2, 1, '#b3e5fc'); P(ctx, x + 7, y + 1, 2, 1, '#b3e5fc');
  P(ctx, x + 2, y + 5, 2, 1, '#212121'); P(ctx, x + 9, y + 5, 2, 1, '#212121');
  P(ctx, x + 11, y + 3, 1, 1, '#fff59d');
}

// 人（3×7ドット）
export const HAIR = ['#3e2723', '#212121', '#6d4c41', '#f9a825', '#9e9e9e', '#5d4037'];
export const SHIRT = { worker: '#2b4a8a', resident: '#43a047', guest: '#8e24aa', visitor: '#ef6c00', staff: '#4dd0e1' };
export function drawPerson(ctx, x, y, p, frame, shirt) {
  x = Math.round(x); y = Math.round(y);
  P(ctx, x, y, 3, 1, HAIR[p.look % HAIR.length]);
  P(ctx, x, y + 1, 3, 1, '#f1c27d');
  P(ctx, x, y + 2, 3, 3, shirt);
  if (p.kind === 'worker' && shirt === SHIRT.worker) P(ctx, x + 1, y + 2, 1, 1, '#ffffff');
  if (p.kind === 'staff') P(ctx, x, y + 4, 3, 1, '#ffffff');
  if (frame) P(ctx, x + 1, y + 5, 1, 2, '#263238');
  else { P(ctx, x, y + 5, 1, 2, '#263238'); P(ctx, x + 2, y + 5, 1, 2, '#263238'); }
}
export function drawSitter(ctx, x, y, p, shirt) {
  x = Math.round(x); y = Math.round(y);
  P(ctx, x, y + 2, 3, 1, HAIR[p.look % HAIR.length]);
  P(ctx, x, y + 3, 3, 1, '#f1c27d');
  P(ctx, x, y + 4, 3, 3, shirt);
}
export function drawSleeper(ctx, x, y, p) {
  P(ctx, Math.round(x), Math.round(y), 2, 2, HAIR[p.look % HAIR.length]);
  P(ctx, Math.round(x) + 1, Math.round(y) + 1, 1, 1, '#f1c27d');
}

// 部屋の中で人がいる場所 [x, y, 座る?]
export function slots(type, W) {
  switch (type) {
    case 'office': return [[25, 12, 1], [41, 12, 1], [57, 12, 1], [8, 14, 0], [13, 14, 0], [36, 14, 0]];
    case 'home': return [[44, 10, 1], [48, 10, 1], [30, 14, 0]];
    case 'food': return [[2, 11, 1], [18, 11, 1], [22, 11, 1], [38, 11, 1], [42, 11, 1], [58, 11, 1], [11, 14, 0], [31, 14, 0], [51, 14, 0], [80, 14, 0]];
    case 'shop': return [[9, 14, 0], [25, 14, 0], [41, 14, 0], [17, 14, 0], [33, 14, 0], [49, 14, 0]];
    case 'single': return [[5, 13, 2], [26, 14, 0]];
    case 'twin': return [[5, 13, 2], [28, 13, 2], [21, 14, 0], [44, 14, 0]];
    case 'housekeeping': return [[24, 14, 0], [42, 14, 0], [12, 14, 0], [6, 14, 0]];
    default: return [[Math.floor(W / 2), 14, 0]];
  }
}

// ボタン用の小さな絵
export function iconCanvas(type) {
  const W = type === 'lobby' ? 32 : type === 'elevator' ? 32 : FAC[type].w * TILE_W;
  const c = canvas(W, FLOOR_H);
  const ctx = c.getContext('2d');
  if (type === 'elevator') { ctx.drawImage(shaftSprite(), 0, 0); ctx.drawImage(carSprite(true), 4, 3); }
  else if (type === 'stairs') { P(ctx, 0, 0, W, FLOOR_H, '#efe6d3'); ctx.drawImage(facilitySprite('stairs'), 0, 0); }
  else ctx.drawImage(facilitySprite(type, type === 'single' || type === 'twin' ? 'clean' : 'occ', 0), 0, 0);
  if (type === 'parking') drawCar(ctx, 2, 14, 1);
  return c;
}
