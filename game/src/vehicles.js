// Vehicles: the arcade driving model every car, taxi and police cruiser shares. Forward speed
// and sideways slip are held apart, so a handbrake makes the back step out instead of the car
// turning on a rail; walls and other cars push back and cost bodywork.
import { CAR_TYPES } from './config.js';
import { clamp, createRandom } from './util.js';

let nextId = 1;
const rng = createRandom(90210);

/** Half the car's length and width, plus a little, as the collision radius. */
export const carRadius = (v) => (CAR_TYPES[v.type] || CAR_TYPES.sedan).len * 0.46;

export function createVehicle(type, x, y, angle, opts = {}) {
  const t = CAR_TYPES[type] || CAR_TYPES.sedan;
  const color = opts.color || rng.pick(['#e8e2d2', '#d9534f', '#3fa7a0', '#e8b64c', '#6a7fc4', '#c9c9d2', '#8e5fb0', '#69a35e', '#e0834a', '#2f3b48']);
  return {
    id: nextId++, type, x, y, angle,
    vx: 0, vy: 0, speed: 0,
    hp: t.hp, maxHp: t.hp,
    color,
    driver: null,          // 'player' | 'traffic' | 'police' | 'gang' | null
    ai: null,              // filled by traffic.js or police.js
    braking: false,
    handbraking: false,
    dead: false,
    burn: 0,
    occupants: 1,
    isHero: !!opts.isHero,
    locked: !!opts.locked,
    parked: !!opts.parked,
    lastHit: 0,
  };
}

/**
 * One physics step. `input` is {throttle 0..1, brake 0..1, steer -1..1, handbrake bool}.
 * The car answers the wheel with weight: slower to turn when slow, looser at the limit.
 */
export function stepVehicle(v, dt, input, world, effects) {
  const t = CAR_TYPES[v.type] || CAR_TYPES.sedan;
  if (v.dead) {
    v.vx *= 1 - 2.4 * dt;
    v.vy *= 1 - 2.4 * dt;
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    v.burn += dt;
    if (effects && v.burn > 0.2 && Math.random() < 0.4) effects.smoke(v.x, v.y - 6, 1, 'rgba(52,48,58,');
    return;
  }

  const fx = Math.cos(v.angle), fy = Math.sin(v.angle);
  const rx = -fy, ry = fx;
  let vF = v.vx * fx + v.vy * fy;
  let vL = v.vx * rx + v.vy * ry;

  const throttle = input.throttle || 0;
  const brake = input.brake || 0;
  const steer = input.steer || 0;

  // Engine: torque falls away as the car nears its top speed.
  if (throttle > 0) {
    const head = clamp(1 - Math.abs(vF) / t.top, 0, 1);
    vF += t.accel * throttle * (0.35 + 0.65 * head) * dt;
  }
  if (brake > 0) {
    if (vF > 6) vF -= 460 * brake * dt;
    else if (vF > -t.top * 0.34) vF -= t.accel * 0.62 * brake * dt;
  }
  // Rolling resistance and air drag.
  vF -= vF * 0.55 * dt;
  vF -= Math.sign(vF) * Math.min(Math.abs(vF), 26 * dt);

  // Steering: the wheel bites harder at speed up to a point, then the car runs wide.
  const bite = clamp(Math.abs(vF) / 95, 0, 1) * (1 - 0.35 * clamp((Math.abs(vF) - 260) / 260, 0, 1));
  const turn = steer * t.turn * bite * dt * Math.sign(vF || 1) * (input.handbrake ? 1.35 : 1);
  v.angle += turn;

  // Grip: the sideways component bleeds off; the handbrake lets it live, and that is a drift.
  const grip = input.handbrake ? 0.22 : t.grip;
  vL *= 1 - clamp(grip * 7.2 * dt, 0, 1);
  vL += turn * vF * 0.5; // the body leans, so turning throws weight sideways

  v.braking = brake > 0.1 || (input.handbrake && Math.abs(vF) > 40);
  v.handbraking = !!input.handbrake;

  // Rebuild the world velocity from the two components, then measure slip for the tyres.
  const speed = Math.hypot(vF, vL);
  v.speed = vF;
  v.vx = Math.cos(v.angle) * vF - Math.sin(v.angle) * vL;
  v.vy = Math.sin(v.angle) * vF + Math.cos(v.angle) * vL;
  v.x += v.vx * dt;
  v.y += v.vy * dt;

  if (effects && Math.abs(vL) > 55 && Math.abs(vF) > 40) {
    const bx = v.x - Math.cos(v.angle) * (t.len * 0.3);
    const by = v.y - Math.sin(v.angle) * (t.len * 0.3);
    effects.skid(bx, by, v.angle, clamp(Math.abs(vL) / 220, 0.2, 0.6));
    if (Math.random() < 0.5) effects.smoke(bx, by, 1, 'rgba(150,146,150,');
  }

  // Walls: test the four corners, push out along the normal, and hand the driver a bill.
  const corners = [[t.len * 0.46, t.wid * 0.42], [t.len * 0.46, -t.wid * 0.42], [-t.len * 0.46, t.wid * 0.42], [-t.len * 0.46, -t.wid * 0.42]];
  let worst = null;
  for (const [lx, ly] of corners) {
    const cx = v.x + Math.cos(v.angle) * lx - Math.sin(v.angle) * ly;
    const cy = v.y + Math.sin(v.angle) * lx + Math.cos(v.angle) * ly;
    const hit = world.hitSolids(cx, cy, 5);
    if (hit && (!worst || hit.depth > worst.depth)) worst = hit;
  }
  if (worst) {
    v.x = worst.x + (worst.x - v.x) * 0.05;
    v.y = worst.y + (worst.y - v.y) * 0.05;
    const into = v.vx * worst.nx + v.vy * worst.ny;
    if (into < 0) {
      v.vx -= worst.nx * into * 1.45;
      v.vy -= worst.ny * into * 1.45;
      const impact = Math.abs(into);
      if (impact > 55) {
        damageVehicle(v, impact * 0.075, effects);
        if (effects) {
          effects.sparks(v.x - worst.nx * 12, v.y - worst.ny * 12, Math.atan2(worst.ny, worst.nx), 6);
          effects.addShake(Math.min(8, impact * 0.035));
        }
      }
    }
    v.vx *= 0.72;
    v.vy *= 0.72;
  }
  v.speed = v.vx * Math.cos(v.angle) + v.vy * Math.sin(v.angle);
  if (speed > 0 && v.hp < v.maxHp * 0.4 && effects && Math.random() < 0.07) effects.smoke(v.x, v.y, 1, 'rgba(70,66,72,');
}

/** Bodywork damage; at zero the car catches fire and a moment later goes up. */
export function damageVehicle(v, amount, effects) {
  if (v.dead) return;
  v.hp = Math.max(0, v.hp - amount);
  if (v.hp <= 0) {
    v.dead = true;
    v.burn = 0;
    v.braking = false;
    if (effects) effects.smoke(v.x, v.y, 4, 'rgba(48,44,52,');
  }
}

/** Vehicle against vehicle: separate them and split the momentum by mass. */
export function collideVehicles(a, b, effects) {
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(b.x) || !Number.isFinite(b.y)) return false;
  const ta = CAR_TYPES[a.type] || CAR_TYPES.sedan;
  const tb = CAR_TYPES[b.type] || CAR_TYPES.sedan;
  const ra = carRadius(a), rb = carRadius(b);
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const min = ra + rb;
  if (d >= min || d < 0.001) return false;
  const nx = dx / d, ny = dy / d;
  const overlap = min - d;
  const ma = ta.mass, mb = tb.mass;
  const total = ma + mb;
  a.x -= nx * overlap * (mb / total);
  a.y -= ny * overlap * (mb / total);
  b.x += nx * overlap * (ma / total);
  b.y += ny * overlap * (ma / total);

  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const impulse = (-rel * 1.35) / (1 / ma + 1 / mb);
    a.vx -= (impulse / ma) * nx;
    a.vy -= (impulse / ma) * ny;
    b.vx += (impulse / mb) * nx;
    b.vy += (impulse / mb) * ny;
    const impact = -rel;
    if (impact > 50) {
      damageVehicle(a, (impact * 0.05) / ma, effects);
      damageVehicle(b, (impact * 0.05) / mb, effects);
      if (effects) {
        effects.sparks((a.x + b.x) / 2, (a.y + b.y) / 2, Math.atan2(ny, nx), 5);
        effects.addShake(Math.min(6, impact * 0.02));
      }
    }
  }
  a.speed = a.vx * Math.cos(a.angle) + a.vy * Math.sin(a.angle);
  b.speed = b.vx * Math.cos(b.angle) + b.vy * Math.sin(b.angle);
  return true;
}

/** A car blown up: occupants out, the paint black, a fireball. */
export function explodeVehicle(v, effects, game) {
  v.dead = true;
  v.hp = 0;
  v.color = '#3a3238';
  v.explodeAt = 0;
  if (effects) effects.explosion(v.x, v.y);
  if (game) {
    game.effects.addShake(12);
    for (const other of game.vehicles) {
      if (other === v || other.dead) continue;
      const d = Math.hypot(other.x - v.x, other.y - v.y);
      if (d < 90) {
        damageVehicle(other, 55 * (1 - d / 90), effects);
        const k = 220 * (1 - d / 90);
        const a = Math.atan2(other.y - v.y, other.x - v.x);
        other.vx += Math.cos(a) * k;
        other.vy += Math.sin(a) * k;
        other.angle += 0.2;
      }
    }
    const dp = Math.hypot(game.player.x - v.x, game.player.y - v.y);
    if (dp < 110 && !game.player.inCar) {
      game.damagePlayer(46 * (1 - dp / 110), 'explosion');
    }
  }
}
