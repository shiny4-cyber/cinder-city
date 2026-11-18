// Pedestrians: they walk the pavements of their own block, sometimes cross the road, and when
// a gun goes off or a body lands they scatter. A car that hits one knocks it flat; one that hits
// it fast kills it, and the city remembers who was driving.
import { BLOCK, GRID_X, GRID_Y, PITCH, ROAD, SIDEWALK, roadX, roadY } from './config.js';
import { clamp, createRandom, dist } from './util.js';

const rng = createRandom(4242);
const SHIRTS = ['#e8e2d2', '#3fa7a0', '#d9534f', '#e8b64c', '#6a7fc4', '#c9c9d2', '#8e5fb0', '#f0f0e8', '#e0834a', '#69a35e'];
const SKINS = ['#8a5a3b', '#b1794f', '#d9a06d', '#6b432c', '#c98f61', '#f0c39a'];

/** The rectangle a block's pavement walks around, and how long that circuit is. */
export function blockRing(block) {
  const pad = SIDEWALK - 8;
  return { x0: block.x + pad, y0: block.y + pad, w: BLOCK - pad * 2, h: BLOCK - pad * 2, len: (BLOCK - pad * 2) * 4 };
}

/** Point and heading at distance s around a ring. */
export function ringPoint(ring, s, out) {
  const w = ring.w, h = ring.h;
  let t = s % ring.len;
  if (t < 0) t += ring.len;
  if (t < w) { out.x = ring.x0 + t; out.y = ring.y0; out.a = 0; }
  else if (t < w + h) { out.x = ring.x0 + w; out.y = ring.y0 + (t - w); out.a = Math.PI / 2; }
  else if (t < 2 * w + h) { out.x = ring.x0 + w - (t - w - h); out.y = ring.y0 + h; out.a = Math.PI; }
  else { out.x = ring.x0; out.y = ring.y0 + h - (t - 2 * w - h); out.a = -Math.PI / 2; }
  return out;
}

/** The s value on a ring nearest a world point. */
function nearestRingS(ring, x, y) {
  const w = ring.w, h = ring.h;
  const dl = Math.abs(x - ring.x0), dr = Math.abs(x - (ring.x0 + w));
  const dt = Math.abs(y - ring.y0), db = Math.abs(y - (ring.y0 + h));
  const m = Math.min(dl, dr, dt, db);
  if (m === dt) return clamp(x - ring.x0, 0, w);
  if (m === dr) return w + clamp(y - ring.y0, 0, h);
  if (m === db) return w + h + clamp(ring.x0 + w - x, 0, w);
  return 2 * w + h + clamp(ring.y0 + h - y, 0, h);
}

export function createPed(x, y, opts = {}) {
  return {
    x, y, angle: opts.angle ?? 0, phase: rng.range(0, 6.28),
    speed: rng.range(38, 58), r: rng.range(8.5, 10.5),
    shirt: opts.shirt || rng.pick(SHIRTS), skin: rng.pick(SKINS),
    health: 100, state: 'walk', timer: 0, armed: !!opts.armed,
    ring: opts.ring || null, s: opts.s || 0, dir: rng() < 0.5 ? -1 : 1,
    cross: null, fleeFrom: null, dead: false, down: 0, fade: 1,
    gang: !!opts.gang, hostile: !!opts.hostile, cop: !!opts.cop,
    hitFlash: 0,
  };
}

/** Attach a fresh pedestrian to a block's pavement, outside the player's sight if possible. */
export function spawnPed(game, block) {
  const ring = blockRing(block);
  const s = rng.range(0, ring.len);
  const p = { x: 0, y: 0, a: 0 };
  ringPoint(ring, s, p);
  const ped = createPed(p.x, p.y, { ring, s, angle: p.a });
  game.peds.push(ped);
  return ped;
}

/** Fill the pavements around the camera up to the population cap. */
export function populatePeds(game, count = 46) {
  let guard = 0;
  while (game.peds.filter((p) => !p.dead).length < count && guard < 200) {
    guard += 1;
    const ci = clamp(Math.floor(game.camera.x / PITCH), 0, GRID_X - 1);
    const cj = clamp(Math.floor(game.camera.y / PITCH), 0, GRID_Y - 1);
    const i = clamp(ci + rng.int(-3, 3), 0, GRID_X - 1);
    const j = clamp(cj + rng.int(-3, 3), 0, GRID_Y - 1);
    const block = game.world.block(i, j);
    if (!block) continue;
    const ring = blockRing(block);
    const s = rng.range(0, ring.len);
    const pt = { x: 0, y: 0, a: 0 };
    ringPoint(ring, s, pt);
    if (dist(pt.x, pt.y, game.player.x, game.player.y) < 120) continue;
    game.peds.push(createPed(pt.x, pt.y, { ring, s, angle: pt.a }));
  }
}

/** Panic: everyone within `radius` runs from (x, y) for a few seconds. */
export function startlePeds(game, x, y, radius = 260, seconds = 4.5) {
  for (const p of game.peds) {
    if (p.dead || p.cop) continue;
    if (dist(p.x, p.y, x, y) < radius) {
      p.state = 'flee';
      p.timer = seconds + rng() * 2;
      p.fleeFrom = { x, y };
      p.cross = null;
    }
  }
}

/** Someone with a gun near the player makes the pavement nervous. */
export function stepPeds(game, dt) {
  const peds = game.peds;
  for (let i = peds.length - 1; i >= 0; i -= 1) {
    const p = peds[i];
    if (p.dead) {
      p.timer += dt;
      p.fade = Math.max(0, 1 - Math.max(0, p.timer - 14) / 3);
      if (p.fade <= 0) peds.splice(i, 1);
      continue;
    }
    const far = dist(p.x, p.y, game.player.x, game.player.y) > 1500;
    if (far) { peds.splice(i, 1); continue; }
    p.timer = Math.max(0, p.timer - dt);
    p.phase += dt * (p.state === 'flee' ? 14 : 8);
    p.hitFlash = Math.max(0, p.hitFlash - dt * 3);

    if (p.down > 0) {
      p.down -= dt;
      if (p.down <= 0) p.state = 'flee';
      continue;
    }

    if (p.state === 'flee') {
      const away = p.fleeFrom ? Math.atan2(p.y - p.fleeFrom.y, p.x - p.fleeFrom.x) : p.angle;
      p.angle += 0;
      p.x += Math.cos(away) * 126 * dt;
      p.y += Math.sin(away) * 126 * dt;
      p.angle = away;
      const hit = game.world.hitSolids(p.x, p.y, p.r);
      if (hit) { p.x = hit.x; p.y = hit.y; p.angle = away + Math.PI * 0.5; }
      if (p.timer <= 0) { p.state = 'walk'; p.cross = null; }
      continue;
    }

    if (p.state === 'cross' && p.cross) {
      const a = Math.atan2(p.cross.y - p.y, p.cross.x - p.x);
      p.angle = a;
      p.x += Math.cos(a) * p.speed * 1.25 * dt;
      p.y += Math.sin(a) * p.speed * 1.25 * dt;
      if (dist(p.x, p.y, p.cross.x, p.cross.y) < 5) {
        if (p.cross.ring) {
          p.ring = p.cross.ring;
          p.s = nearestRingS(p.ring, p.x, p.y);
        }
        p.state = 'walk';
        p.cross = null;
      }
      continue;
    }

    if (!p.ring) continue;
    p.s += p.speed * p.dir * dt;
    const pt = { x: 0, y: 0, a: 0 };
    ringPoint(p.ring, p.s, pt);
    p.x = pt.x;
    p.y = pt.y;
    p.angle = pt.a + (p.dir < 0 ? Math.PI : 0);

    // Now and then, cross the street to the block over the way.
    if (p.timer <= 0 && rng() < dt * 0.14) {
      p.timer = 6 + rng() * 8;
      const ci = Math.floor((p.x - ROAD / 2) / PITCH);
      const cj = Math.floor((p.y - ROAD / 2) / PITCH);
      const dirX = rng() < 0.5 ? -1 : 1;
      const ni = clamp(ci + dirX, 0, GRID_X - 1);
      const nb = game.world.block(ni, cj);
      if (nb) {
        const nr = blockRing(nb);
        const tx = clamp(p.x + dirX * (ROAD + 20), nr.x0 + 6, nr.x0 + nr.w - 6);
        p.state = 'cross';
        p.cross = { x: tx, y: clamp(p.y, nr.y0 + 6, nr.y0 + nr.h - 6), ring: nr };
      }
    }
  }
}

/** A bullet or a fist lands on a pedestrian. */
export function hitPed(game, p, damage, dirX, dirY, byPlayer = false) {
  if (p.dead) return;
  p.health -= damage;
  p.hitFlash = 1;
  game.effects.blood(p.x, p.y, Math.atan2(dirY, dirX), 5);
  if (p.health <= 0) {
    p.dead = true;
    p.deadAngle = Math.atan2(dirY, dirX);
    p.timer = 0;
    p.timer = 0;
    if (game.witnessCrime && car.driver === 'player') game.witnessCrime('murder', p.x, p.y);
    if (!p.gang && !p.cop) game.stats.civiliansKilled += 1;
  } else {
    p.state = 'flee';
    p.timer = 5;
    p.fleeFrom = { x: p.x - dirX * 20, y: p.y - dirY * 20 };
  }
  if (!p.gang && !p.cop) startlePeds(game, p.x, p.y, 210, 4);
}

/** A car runs someone down. */
export function runOverPed(game, p, car) {
  if (p.dead) return;
  const speed = Math.hypot(car.vx, car.vy);
  if (speed < 40) {
    p.down = 0.6;
    p.state = 'flee';
    p.timer = 3;
    return;
  }
  const dmg = clamp(speed * 0.4, 20, 130);
  p.health -= dmg;
  game.effects.blood(p.x, p.y, car.angle, 8);
  p.x += Math.cos(car.angle) * 10;
  p.y += Math.sin(car.angle) * 10;
  if (p.health <= 0) {
    p.dead = true;
    p.deadAngle = car.angle;
    p.timer = 0;
    if (game.witnessCrime) game.witnessCrime('murder', p.x, p.y);
  } else {
    p.down = 1.4;
    p.state = 'flee';
    p.timer = 4;
    p.fleeFrom = { x: car.x, y: car.y };
  }
  startlePeds(game, p.x, p.y, 240, 5);
}
