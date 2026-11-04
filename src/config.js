// のびのびタワー — 数字と決まりごと（バランス調整はここ）

export const TILE_W = 8;      // 1マスの横幅（ドット）
export const FLOOR_H = 24;    // 1階の高さ（ドット）
export const WIDTH = 64;      // ビルの横幅（マス）
export const MIN_LEVEL = -5;  // B5
export const MAX_LEVEL = 49;  // 50F

// 時間（すべてゲームの「分」）
export const STEP = 0.25;          // 1回の計算で進む時間
export const WALK_SPEED = 4;       // 1分で歩くマス
export const STAIRS_TIME = 1.5;    // 階段1階ぶん
export const ELEV_SPEED = 4;       // エレベーターが1分で進む階
export const ELEV_CAPACITY = 12;   // かご1台の定員
export const ELEV_MAX_CARS = 6;
export const ELEV_MAX_SPAN = 30;   // 1本で結べる階の数
export const DWELL = 0.5;          // 止まっている時間
export const GIVE_UP = 25;         // これ以上待つと、あきらめる
export const SPEEDS = [0, 2, 6, 15]; // 1秒で進むゲームの分（一時停止・ふつう・はやい・すごく）
export const NIGHT_BOOST = 4;      // 夜中（0:00〜5:30）は早送り

export const START_MONEY = 3000000;
export const UNDERGROUND_MULT = 1.5; // 地下に建てると高い

// ★ごとの建てられる高さ
export const STAR_LIMITS = {
  1: { top: 14, bottom: 0 },   // 15F まで・地下なし
  2: { top: 39, bottom: -3 },  // 40F・B3 まで
  3: { top: 49, bottom: -5 },  // 50F・B5 まで
};

// 次の★の条件（人数と施設）
export const STAR_GOALS = {
  2: { pop: 300, need: [['security', 1, '警備室']] },
  3: { pop: 1000, need: [['clinic', 1, '医務室'], ['parking', 1, '駐車場'], ['rooms', 10, 'ホテルの部屋10室']] },
};

// 施設
// where: ground=1Fだけ / above=2F より上 / basement=地下だけ / any=どこでも
export const FAC = {
  lobby:        { name: 'ロビー', w: 4, cost: 40000, star: 1, where: 'ground', pop: 0 },
  stairs:       { name: '階段', w: 2, cost: 30000, star: 1, where: 'any', pop: 0 },
  elevator:     { name: 'エレベーター', w: 4, cost: 200000, perLevel: 10000, carCost: 80000, star: 1, where: 'any', pop: 0, upkeepPerCar: 4000 },
  office:       { name: 'オフィス', w: 8, cost: 300000, star: 1, where: 'above', pop: 6, rent: 50000, weekdayOnly: true, tenant: true, moveIn: 0.12 },
  home:         { name: '住まい', w: 8, cost: 400000, star: 1, where: 'above', pop: 3, rent: 15000, moveInFee: 300000, tenant: true, moveIn: 0.10 },
  food:         { name: '飲食店', w: 12, cost: 500000, star: 1, where: 'any', pop: 4, rent: 30000, tenant: true, moveIn: 0.08, seats: 10, minCustomers: 20, stay: [30, 40], hours: [[11, 14], [17, 21]] },
  shop:         { name: 'お店', w: 8, cost: 400000, star: 2, where: 'any', pop: 3, rent: 20000, tenant: true, moveIn: 0.08, seats: 6, minCustomers: 15, stay: [15, 30], hours: [[10, 20]] },
  single:       { name: 'シングル', long: 'ホテル（シングル）', w: 4, cost: 150000, star: 2, where: 'above', pop: 1, price: 15000, beds: 1, hotel: true },
  twin:         { name: 'ツイン', long: 'ホテル（ツイン）', w: 6, cost: 250000, star: 2, where: 'above', pop: 2, price: 26000, beds: 2, hotel: true },
  housekeeping: { name: 'お掃除室', long: 'ハウスキーピング（お掃除室）', w: 6, cost: 300000, star: 2, where: 'above', pop: 4, upkeep: 15000, staff: 4 },
  security:     { name: '警備室', w: 8, cost: 500000, star: 1, where: 'any', pop: 4, upkeep: 20000 },
  clinic:       { name: '医務室', w: 8, cost: 800000, star: 2, where: 'any', pop: 3, upkeep: 30000 },
  parking:      { name: '駐車場', w: 8, cost: 200000, star: 2, where: 'basement', pop: 0, upkeep: 3000, spaces: 4 },
};

export const TOOL_ORDER = ['lobby', 'stairs', 'elevator', 'office', 'home', 'food', 'security', 'shop', 'single', 'twin', 'housekeeping', 'clinic', 'parking'];

export const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日'];

export function levelName(level) {
  return level >= 0 ? `${level + 1}F` : `B${-level}`;
}

export function yen(n) {
  const sign = n < 0 ? '-' : '';
  n = Math.abs(Math.round(n));
  if (n >= 100000000) return `${sign}${(n / 100000000).toFixed(2).replace(/\.?0+$/, '')}億円`;
  if (n >= 10000) return `${sign}${(n / 10000).toFixed(1).replace(/\.0$/, '')}万円`;
  return `${sign}${n}円`;
}
