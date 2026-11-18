// Civilian traffic: cars that keep to the right-hand lane, follow the lane's centre line, keep
// their distance, choose a turn at every junction, and spawn and vanish off camera. Parked cars
// are laid out here too, because a street without them looks abandoned.
import { CAR_TYPES, GRID_X, GRID_Y, PITCH, ROAD, roadX, roadY } from './config.js';
import { clamp, createRandom, dist, wrapAngle } from './util.js';
import { createVehicle, stepVehicle } from './vehicles.js';

const rng = createRandom(777);
const TRAFFIC_TYPES = ['sedan', 'sedan', 'sedan', 'coupe', 'taxi', 'van', 'muscle', 'sport'];
const TRAFFIC_TARGET = 26;

/** A car already rolling in a lane, far enough from the player not to appear out of thin air. */
export function spawnTrafficCar(game, minDist = 620) {
  for (let tries = 0; tries < 24; tries += 1) {
    const edge = rng.pick(game.streets.edges);
    const t = rng.range(20, edge.len - 20);
    const lane = rng() < 0.5 ? 0 : 1;
    const pt = { x: 0, y: 0 };
    game.streets.pointOn(edge, t, lane, pt);
    if (dist(pt.x, pt.y, game.player.x, game.player.y) < minDist) continue;
    if (Math.abs(pt.x - game.camera.x) > 1100 || Math.abs(pt.y - game.camera.y) > 800) continue;
    const type = rng.pick(TRAFFIC_TYPES);
    const car = createVehicle(type, pt.x, pt.y, edge.ang, { parked: false });
    car.driver = 'traffic';
    car.ai = { edge, t, lane, speed: 0, cruise: rng.range(120, 175), stuck: 0, next: null };
    car.vx = Math.cos(edge.ang) * car.ai.cruise;
    car.vy = Math.sin(edge.ang) * car.ai.cruise;
    car.speed = car.ai.cruise;
    game.vehicles.push(car);
    return car;
  }
  return null;
}

/** Keep the streets around the player busy without ever flooding them. */
export function refillTraffic(game) {
  let alive = 0;
  for (const v of game.vehicles) if (v.driver === 'traffic' && !v.dead) alive += 1;
  if (alive < TRAFFIC_TARGET && Math.random() < 0.25) spawnTrafficCar(game);
  for (let i = game.vehicles.length - 1; i >= 0; i -= 1) {
    const v = game.vehicles[i];
    if (v.driver !== 'traffic') continue;
    if (dist(v.x, v.y, game.player.x, game.player.y) > 1900 || v.dead) {
      game.vehicles.splice(i, 1);
    }
  }
}

/** Is another car close in front of this one, and how close? */
function gapAhead(game, v) {
  const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
  let best = 999;
  for (const o of game.vehicles) {
    if (o === v) continue;
    const dx = o.x - v.x, dy = o.y - v.y;
    const d = Math.hypot(dx, dy);
    if (d > 90) continue;
    const ahead = (dx * fx + dy * fy) / (d || 1);
    if (ahead < 0.62) continue;
    best = Math.min(best, d);
  }
  const p = game.player;
  if (!p.inCar && !p.dead) {
    const dx = p.x - v.x, dy = p.y - v.y;
    const d = Math.hypot(dx, dy);
    if (d < 70 && (dx * fx + dy * fy) / (d || 1) > 0.6) best = Math.min(best, d);
  }
  return best;
}

/**
 * One step of a civilian's drive: read the lane ahead, steer to it, ease off for the car in
 * front and for the junction. `t` is measured from the car's own position each step, so a
 * shunt or a spin-out puts it back on the lane rather than into a wall.
 */
export function stepTraffic(game, v, dt) {
  const ai = v.ai;
  if (!ai || v.dead) return;
  if (!ai.edge || !Number.isFinite(ai.edge.ax)) {
    ai.edge = game.streets.nearestEdge(v.x, v.y).edge;
    if (!ai.edge) return;
  }
  const edge = ai.edge;
  const s = (v.x - edge.ax) * edge.dx + (v.y - edge.ay) * edge.dy;
  ai.t = s;

  if (s > edge.len - 4) {
    const next = game.streets.nextEdge(edge, rng);
    if (next) {
      ai.edge = next;
      ai.lane = rng() < 0.72 ? ai.lane : 1 - ai.lane;
    }
  }

  const look = 34 + Math.abs(v.speed) * 0.38;
  const target = { x: 0, y: 0 };
  game.streets.pointOn(ai.edge, clamp(s + look, 0, ai.edge.len), ai.lane, target);
  const want = Math.atan2(target.y - v.y, target.x - v.x);
  const diff = wrapAngle(want - v.angle);

  const gap = gapAhead(game, v);
  const nearJunction = s > edge.len - 60;
  let cruise = ai.cruise * (nearJunction ? 0.55 : 1);
  if (gap < 90) cruise *= clamp((gap - 26) / 64, 0, 1);
  if (Math.abs(diff) > 0.8) cruise *= 0.55;

  const input = {
    throttle: v.speed < cruise ? clamp((cruise - v.speed) / 60, 0.12, 1) : 0,
    brake: v.speed > cruise * 1.12 ? clamp((v.speed - cruise) / 90, 0.2, 1) : 0,
    steer: clamp(diff * 2.4, -1, 1),
    handbrake: false,
  };
  if (gap < 34) { input.throttle = 0; input.brake = 1; }
  stepVehicle(v, dt, input, game.world, game.effects);

  // A civilian that ends up jammed against a wall for a while gives up and is towed away.
  if (Math.abs(v.speed) < 6 && gap > 200) ai.stuck += dt; else ai.stuck = 0;
  if (ai.stuck > 7) v.hp = 0;
}

/** Cars parked in the lots and along the kerbs, every one of them stealable. */
export function scatterParkedCars(game) {
  for (const block of game.world.blocks) {
    if (block.kind === 'lot' && block.parking) {
      for (const stall of block.parking) {
        if (rng() < 0.55) continue;
        const car = createVehicle(rng.pick(TRAFFIC_TYPES), stall.x, stall.y, stall.angle, { parked: true });
        car.driver = null;
        game.vehicles.push(car);
      }
    }
  }
  // A few at the kerb, angle along the street, on both sides of a road.
  for (let j = 0; j < GRID_Y; j += 1) {
    for (let i = 0; i < GRID_X; i += 1) {
      if (rng() < 0.55) continue;
      const along = rng() < 0.5;
      const x = along ? roadX(i) + rng.range(-160, 160) : roadX(i) + (rng() < 0.5 ? -1 : 1) * (ROAD / 2 - 12);
      const y = along ? roadY(j) + (rng() < 0.5 ? -1 : 1) * (ROAD / 2 - 12) : roadY(j) + rng.range(-160, 160);
      const cx = clamp(x, 40, game.world.beachX - 40);
      const cy = clamp(y, 40, game.world.bounds.h - 40);
      if (game.world.blocked(cx, cy)) continue;
      const car = createVehicle(rng.pick(TRAFFIC_TYPES), cx, cy, along ? 0 : Math.PI / 2, { parked: true });
      car.driver = null;
      game.vehicles.push(car);
    }
  }
}

/** A named car for the first mission: it sits in the marina lot with its own paint. */
export function placeHeroCar(game, x, y, angle) {
  const car = createVehicle('sport', x, y, angle, { parked: true, color: '#f0e6cf', isHero: true });
  car.driver = null;
  car.plate = 'VELA-01';
  game.vehicles.push(car);
  return car;
}
