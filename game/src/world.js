// The city: a grid of blocks between four-lane roads, a beach and a sea along the east, and
// the solid rectangles and props inside them. Generated once from a seed, then read-only, so
// every other system can ask it where walls are without an owner: hitSolids, blocked, and the
// authored places (districts, the marina lot, the market) missions point at.
import {
  BEACH, BLOCK, CITY_H, CITY_W, GRID_X, GRID_Y, PITCH, ROAD, SEA, SIDEWALK, WORLD_H, WORLD_W, roadX, roadY,
} from './config.js';
import { clamp, createRandom, resolveCircleRect, segmentRect } from './util.js';

/** The districts, west to east and north to south: towers, the strip, old town, the marina. */
export const DISTRICTS = {
  norte: { name: 'Norte', roof: [5, 7, 1], wall: [5, 7, 1], floors: [4, 7] },
  centro: { name: 'Centro', roof: [0, 3, 4], wall: [0, 3, 4], floors: [2, 5] },
  viejo: { name: 'Viejo', roof: [2, 6, 3], wall: [2, 6, 3], floors: [1, 3] },
  marina: { name: 'Marina', roof: [4, 0, 7], wall: [4, 0, 7], floors: [1, 4] },
};

export function districtAt(x, y) {
  if (x > CITY_W - 40) return 'marina';
  if (y < PITCH * 2.6) return 'norte';
  if (y > PITCH * 5.4) return 'viejo';
  return 'centro';
}

function splitLot(rng, x, y, w, h, depth, out) {
  const canSplitX = w > 190;
  const canSplitY = h > 190;
  if (depth >= 3 || (!canSplitX && !canSplitY) || (depth >= 1 && rng() < 0.22)) {
    out.push({ x, y, w, h });
    return;
  }
  const alongX = canSplitX && (!canSplitY || (w / h > 1 ? rng() < 0.72 : rng() < 0.3));
  if (alongX) {
    const cut = Math.round(rng.range(0.38, 0.62) * w);
    splitLot(rng, x, y, cut - 3, h, depth + 1, out);
    splitLot(rng, x + cut + 3, y, w - cut - 3, h, depth + 1, out);
  } else {
    const cut = Math.round(rng.range(0.38, 0.62) * h);
    splitLot(rng, x, y, w, cut - 3, depth + 1, out);
    splitLot(rng, x, y + cut + 3, w, h - cut - 3, depth + 1, out);
  }
}

/** Blocks the story needs to be a particular thing, wherever the seed would have put them. */
const FORCED = { '4,3': 'plaza', '7,3': 'lot', '1,1': 'lot', '6,6': 'plaza', '2,6': 'park' };

/** A block's own layout: buildings, garden, car park or market stalls. */
function makeBlock(rng, i, j) {
  const x = roadX(i) + ROAD / 2;
  const y = roadY(j) + ROAD / 2;
  const district = districtAt(x + BLOCK / 2, y + BLOCK / 2);
  const block = { i, j, x, y, w: BLOCK, h: BLOCK, district, buildings: [], props: [], kind: 'city', lots: [], trees: [] };
  const inner = { x: x + SIDEWALK, y: y + SIDEWALK, w: BLOCK - SIDEWALK * 2, h: BLOCK - SIDEWALK * 2 };
  const roll = rng();
  if (FORCED[`${i},${j}`]) block.kind = FORCED[`${i},${j}`];
  else if (y > PITCH * 5.2 && rng() < 0.5) block.kind = 'park';
  else if (roll < 0.09) block.kind = 'park';
  else if (roll < 0.16) block.kind = 'plaza';
  else if (roll < 0.23) block.kind = 'lot';

  if (block.kind === 'park') {
    block.lawn = { x: inner.x, y: inner.y, w: inner.w, h: inner.h };
    const count = rng.int(7, 12);
    for (let k = 0; k < count; k += 1) {
      block.trees.push({
        x: rng.range(inner.x + 14, inner.x + inner.w - 14),
        y: rng.range(inner.y + 14, inner.y + inner.h - 14),
        r: rng.range(15, 26), kind: rng() < 0.7 ? 'palm' : 'leaf', angle: rng.range(0, 6.28),
      });
    }
    block.props.push({ type: 'fountain', x: inner.x + inner.w / 2, y: inner.y + inner.h / 2, r: 30 });
    block.props.push({ type: 'bench', x: inner.x + 34, y: inner.y + inner.h * 0.5, angle: 0, r: 10 });
    block.props.push({ type: 'bench', x: inner.x + inner.w - 34, y: inner.y + inner.h * 0.5, angle: Math.PI, r: 10 });
    return block;
  }

  if (block.kind === 'plaza') {
    block.plaza = { x: inner.x, y: inner.y, w: inner.w, h: inner.h };
    for (let k = 0; k < 4; k += 1) {
      block.props.push({
        type: 'stall', x: inner.x + 40 + k * ((inner.w - 80) / 3), y: inner.y + inner.h * 0.5,
        angle: k % 2 ? Math.PI : 0, r: 16, tint: k % 4,
      });
    }
    for (let k = 0; k < 3; k += 1) {
      block.trees.push({ x: inner.x + 30 + k * 100, y: inner.y + 26, r: 18, kind: 'palm', angle: rng.range(0, 6.28) });
    }
    return block;
  }

  if (block.kind === 'lot') {
    block.lot = { x: inner.x, y: inner.y, w: inner.w, h: inner.h };
    block.parking = [];
    const rows = 3, cols = 4;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        block.parking.push({
          x: inner.x + 24 + c * ((inner.w - 48) / (cols - 1)),
          y: inner.y + 40 + r * ((inner.h - 80) / (rows - 1)),
          angle: Math.PI / 2,
        });
      }
    }
    block.props.push({ type: 'sign', x: inner.x + 18, y: inner.y + 12, r: 12, text: 'P' });
    return block;
  }

  const d = DISTRICTS[district];
  const lots = [];
  splitLot(rng, inner.x, inner.y, inner.w, inner.h, 0, lots);
  for (const lot of lots) {
    const pad = 2;
    const w = Math.max(48, lot.w - pad);
    const h = Math.max(48, lot.h - pad);
    const floors = rng.int(d.floors[0], d.floors[1]);
    const style = rng.pick(d.roof);
    const b = {
      x: lot.x + pad, y: lot.y + pad, w, h, floors, style,
      roofIndex: style, wallIndex: style,
      glass: rng() < 0.34 && floors > 2,
      accent: rng.pick([0, 1, 2, 3, 4]),
      awning: rng() < 0.4,
      roofProps: [],
      sign: null,
    };
    // Rooftops get a job of their own: it is the biggest surface the player ever looks at.
    const roll = rng();
    b.roofKind = floors >= 5 && roll < 0.22 ? 'helipad'
      : roll < 0.34 ? 'garden'
      : (district === 'marina' || district === 'viejo') && roll < 0.6 ? 'pool'
      : roll < 0.72 ? 'solar'
      : 'plain';
    const props = rng.int(1, 3);
    for (let k = 0; k < props; k += 1) {
      b.roofProps.push({
        kind: rng.pick(['ac', 'vent', 'tank', 'solar', 'hut', 'ac']),
        x: rng.range(b.x + 12, b.x + w - 12),
        y: rng.range(b.y + 12, b.y + h - 12),
        s: rng.range(7, 14),
      });
    }
    if (rng() < 0.22 && w > 90) {
      b.sign = { text: rng.pick(['SOL COLA', 'VELA BANK', 'DELFÍN FC', 'MAR ROSA', 'HOTEL LUNA', 'PESCA FRESCA', 'RADIO 88', 'CASA NORTE', 'TACOS YA', 'MUEBLES RÍO']) };
    }
    block.buildings.push(b);
    block.lots.push(lot);
  }
  return block;
}

/** Street furniture around every block: lamps, palms, hydrants, benches, bins, kerb paint. */
function dressBlock(rng, block) {
  const { x, y, w, h } = block;
  const inset = SIDEWALK - 7;
  const edge = [
    { ax: x + inset, ay: y + inset, bx: x + w - inset, by: y + inset, nx: 0, ny: 1 },
    { ax: x + w - inset, ay: y + inset, bx: x + w - inset, by: y + h - inset, nx: -1, ny: 0 },
    { ax: x + w - inset, ay: y + h - inset, bx: x + inset, by: y + h - inset, nx: 0, ny: -1 },
    { ax: x + inset, ay: y + h - inset, bx: x + inset, by: y + inset, nx: 1, ny: 0 },
  ];
  for (const e of edge) {
    const len = Math.hypot(e.bx - e.ax, e.by - e.ay);
    const n = Math.max(1, Math.round(len / 76));
    for (let k = 0; k < n; k += 1) {
      const t = (k + 0.5) / n;
      const px = e.ax + (e.bx - e.ax) * t;
      const py = e.ay + (e.by - e.ay) * t;
      const roll = rng();
      const face = Math.atan2(e.ny, e.nx);
      if (roll < 0.3) block.props.push({ type: 'lamp', x: px, y: py, angle: face, r: 6 });
      else if (roll < 0.5) block.props.push({ type: 'palm', x: px + e.nx * 4, y: py + e.ny * 4, angle: rng.range(0, 6.28), r: 12 });
      else if (roll < 0.57) block.props.push({ type: 'hydrant', x: px, y: py, r: 5 });
      else if (roll < 0.64) block.props.push({ type: 'bin', x: px, y: py, r: 6 });
      else if (roll < 0.71) block.props.push({ type: 'planter', x: px, y: py, r: 9 });
      else if (roll < 0.78) block.props.push({ type: 'bench', x: px, y: py, angle: face, r: 9 });
      else if (roll < 0.84) block.props.push({ type: 'newsbox', x: px, y: py, angle: face, r: 6, tint: rng.int(0, 3) });
      else if (roll < 0.9) block.props.push({ type: 'scooter', x: px, y: py, angle: face + Math.PI / 2, r: 8, tint: rng.int(0, 3) });
      else if (roll < 0.95) block.props.push({ type: 'mailbox', x: px, y: py, angle: face, r: 5 });
      else block.props.push({ type: 'table', x: px, y: py, angle: face, r: 10, tint: rng.int(0, 3) });
    }
  }
  // Corners get a palm every time: they read instantly as a coastal city in a screenshot.
  for (const [cx, cy] of [[x + 12, y + 12], [x + w - 12, y + 12], [x + w - 12, y + h - 12], [x + 12, y + h - 12]]) {
    block.props.push({ type: 'palm', x: cx, y: cy, angle: rng.range(0, 6.28), r: 13, corner: true });
  }
}

/** The beach, the sea wall and the marina pier, east of the last road. */
function makeCoast(rng) {
  const coast = { beachX: CITY_W, seaX: CITY_W + BEACH, props: [], boats: [], pier: null };
  const sandTop = 8;
  for (let k = 0; k < 26; k += 1) {
    coast.props.push({
      type: rng() < 0.62 ? 'palm' : 'umbrella',
      x: rng.range(CITY_W + 20, CITY_W + BEACH - 26),
      y: rng.range(sandTop + 20, CITY_H - 30),
      angle: rng.range(0, 6.28), r: 12, tint: rng.int(0, 3),
    });
  }
  const pierY = CITY_H * 0.42;
  coast.pier = { x: CITY_W + BEACH - 30, y: pierY, w: SEA * 0.45, h: 46 };
  for (let k = 0; k < 7; k += 1) {
    coast.props.push({ type: 'piling', x: coast.pier.x + 30 + k * (coast.pier.w / 7), y: pierY - 20, r: 6 });
    coast.props.push({ type: 'piling', x: coast.pier.x + 30 + k * (coast.pier.w / 7), y: pierY + 66, r: 6 });
  }
  for (let k = 0; k < 5; k += 1) {
    coast.boats.push({
      x: coast.pier.x + 60 + k * 130, y: pierY - 60 - rng.range(0, 40),
      angle: -0.15 + rng.range(-0.2, 0.2), len: rng.range(40, 64), wid: rng.range(14, 20),
      tint: rng.int(0, 3),
    });
  }
  return coast;
}

export function createWorld(seed) {
  const rng = createRandom(seed);
  const blocks = [];
  for (let j = 0; j < GRID_Y; j += 1) {
    for (let i = 0; i < GRID_X; i += 1) {
      const block = makeBlock(rng, i, j);
      if (block.kind !== 'park') dressBlock(rng, block);
      blocks.push(block);
    }
  }
  const coast = makeCoast(rng);

  // The places the story names, at the centre of the blocks the story uses.
  const at = (i, j) => ({ x: i * PITCH + ROAD + BLOCK / 2, y: j * PITCH + ROAD + BLOCK / 2 });
  const places = {
    market: at(4, 3),
    marina: at(7, 3),
    docks: at(1, 1),
    club: at(6, 6),
    park: at(2, 6),
    pier: { x: coast.pier.x + 150, y: coast.pier.y + coast.pier.h / 2 },
  };

  // A uniform grid over the buildings, so a bullet or a car asks one bucket, not 6,000 rects.
  const CELL = 160;
  const cols = Math.ceil(WORLD_W / CELL) + 1;
  const rows = Math.ceil(WORLD_H / CELL) + 1;
  const buckets = new Array(cols * rows);
  const buildings = [];
  for (const block of blocks) {
    for (const b of block.buildings) {
      buildings.push(b);
      const i0 = Math.floor(b.x / CELL), i1 = Math.floor((b.x + b.w) / CELL);
      const j0 = Math.floor(b.y / CELL), j1 = Math.floor((b.y + b.h) / CELL);
      for (let jj = j0; jj <= j1; jj += 1) {
        for (let ii = i0; ii <= i1; ii += 1) {
          const k = jj * cols + ii;
          if (k < 0 || k >= buckets.length) continue;
          (buckets[k] ||= []).push(b);
        }
      }
    }
  }

  const world = {
    seed, blocks, buildings, coast, places, cols, rows, cell: CELL, buckets,
    bounds: { x: 0, y: 0, w: WORLD_W, h: WORLD_H },
    beachX: CITY_W, seaX: CITY_W + BEACH,
    /** Nearly every pedestrian and car spawn uses these, so both are on the road/sidewalk. */
    districtAt,
  };

  /** Push a circle out of every building it is inside; returns the deepest contact or null. */
  world.hitSolids = (x, y, r) => {
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL);
    const j0 = Math.floor((y - r) / CELL), j1 = Math.floor((y + r) / CELL);
    let px = x, py = y, hit = null;
    for (let jj = j0; jj <= j1; jj += 1) {
      for (let ii = i0; ii <= i1; ii += 1) {
        const list = buckets[jj * cols + ii];
        if (!list) continue;
        for (const b of list) {
          const res = resolveCircleRect(px, py, r, b.x, b.y, b.w, b.h);
          if (res) {
            px = res.x; py = res.y;
            hit = res;
          }
        }
      }
    }
    return hit ? { x: px, y: py, nx: hit.nx, ny: hit.ny, depth: hit.depth } : null;
  };

  /** Is this point inside a building? Sight lines and bullet paths ask. */
  world.blocked = (x, y) => {
    if (x < -40 || y < -40 || x > WORLD_W + 40 || y > WORLD_H + 40) return true;
    const k = Math.floor(y / CELL) * cols + Math.floor(x / CELL);
    const list = buckets[k];
    if (list) for (const b of list) if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
    return false;
  };

  /** Clear line between two points? Walks the segment one cell at a time. */
  world.lineClear = (ax, ay, bx, by) => {
    const steps = Math.ceil(Math.hypot(bx - ax, by - ay) / 24);
    for (let s = 1; s < steps; s += 1) {
      const t = s / steps;
      if (world.blocked(ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
    }
    return true;
  };

  /** Segment against buildings, for bullets that should stop at a wall. */
  world.segmentHitsBuilding = (ax, ay, bx, by) => {
    const i0 = Math.floor(Math.min(ax, bx) / CELL), i1 = Math.floor(Math.max(ax, bx) / CELL);
    const j0 = Math.floor(Math.min(ay, by) / CELL), j1 = Math.floor(Math.max(ay, by) / CELL);
    for (let jj = j0; jj <= j1; jj += 1) {
      for (let ii = i0; ii <= i1; ii += 1) {
        const list = buckets[jj * cols + ii];
        if (!list) continue;
        for (const b of list) if (segmentRect(ax, ay, bx, by, b.x, b.y, b.w, b.h)) return true;
      }
    }
    return false;
  };

  /** A block by grid index, safe at the edges. */
  world.block = (i, j) => blocks[clamp(j, 0, GRID_Y - 1) * GRID_X + clamp(i, 0, GRID_X - 1)];

  /** Clamp a point into the streets-and-sand play area. */
  world.clampPoint = (p) => {
    p.x = clamp(p.x, 24, WORLD_W - 60);
    p.y = clamp(p.y, 24, WORLD_H - 24);
    return p;
  };

  return world;
}
