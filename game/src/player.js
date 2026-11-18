// The player on foot and at the wheel: walking, running, aiming, getting in and out of cars,
// and taking damage. Health, money and the wanted level live on the game; this file owns the
// body, what it is holding, and which seat it is in.
import { PLAYER, WEAPONS } from './config.js';
import { approachAngle, clamp, wrapAngle } from './util.js';
import { carRadius } from './vehicles.js';

export function createPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, angle: -Math.PI / 2, aimAngle: -Math.PI / 2,
    health: PLAYER.maxHealth, armor: 0,
    inCar: null,
    moving: false, running: false, aiming: false,
    phase: 0,
    weapon: 'pistol',
    ammo: { fists: Infinity, pistol: 48, smg: 0, shotgun: 0 },
    cooldown: 0, meleeCooldown: 0,
    invuln: 0, dead: false, deathTimer: 0,
    hitFlash: 0,
    step: 0,
  };
}

/** Which car the player could get into right now, if any. */
export function carUnderPlayer(game, range = 74) {
  let best = null, bestD = range * range;
  for (const v of game.vehicles) {
    if (v.dead) continue;
    const d = (v.x - game.player.x) ** 2 + (v.y - game.player.y) ** 2;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

export function enterCar(game, car) {
  const p = game.player;
  if (!car || p.inCar || p.dead) return false;
  const traffic = car.driver === 'traffic' || car.driver === 'gang';
  if (traffic) {
    // Hauled out at the wheel: they run for it, and may tell the police about it later.
    game.panicPedAt(car.x, car.y, 1);
    if (game.witnessCrime) game.witnessCrime('carjack', car.x, car.y);
  }
  car.driver = 'player';
  car.ai = null;
  car.parked = false;
  car.siren = false;
  p.inCar = car;
  p.vx = 0; p.vy = 0;
  p.x = car.x; p.y = car.y;
  game.audio.play('door');
  game.notify(`Stole a ${game.vehicleName(car)}`, '#f2d98a');
  game.stats.carsStolen += 1;
  return true;
}

export function exitCar(game) {
  const p = game.player;
  const car = p.inCar;
  if (!car) return false;
  const side = Math.cos(car.angle) * 0 + -Math.sin(car.angle) * 1;
  const sdx = -Math.sin(car.angle), sdy = Math.cos(car.angle);
  let ox = car.x + sdx * (carRadius(car) + 14);
  let oy = car.y + sdy * (carRadius(car) + 14);
  const hit = game.world.hitSolids(ox, oy, PLAYER.radius);
  if (hit) { ox = car.x - sdx * (carRadius(car) + 14); oy = car.y - sdy * (carRadius(car) + 14); }
  p.x = ox; p.y = oy;
  p.vx = car.vx * 0.4; p.vy = car.vy * 0.4;
  p.angle = car.angle;
  car.driver = null;
  car.speed = 0;
  p.inCar = null;
  game.audio.play('door');
  return true;
}

/** The walking body: accelerate towards the stick, slide along walls, mind the cars. */
export function stepPlayer(game, input, dt, aimPoint) {
  const p = game.player;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.meleeCooldown = Math.max(0, p.meleeCooldown - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.hitFlash = Math.max(0, p.hitFlash - dt * 2.6);

  if (p.dead) {
    p.deathTimer += dt;
    return;
  }

  const aim = Math.atan2(aimPoint.y - p.y, aimPoint.x - p.x);
  p.aimAngle = aim;

  if (p.inCar) {
    const car = p.inCar;
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.dead) {
      // Blown up with the player inside: thrown clear and hurt.
      exitCar(game);
      game.damagePlayer(38, 'explosion');
      game.effects.addShake(10);
    }
    return;
  }

  const move = input.move();
  const wantRun = input.run();
  const speedTarget = wantRun ? PLAYER.run : PLAYER.walk;
  p.running = wantRun && move.len > 0;
  p.aiming = input.fire() || input.isDown('KeyQ');

  let tx = 0, ty = 0;
  if (move.len > 0) {
    const sp = p.aiming ? speedTarget * 0.62 : speedTarget;
    tx = move.x * sp;
    ty = move.y * sp;
  }
  const accel = PLAYER.accel * (p.aiming ? 0.7 : 1);
  p.vx += clamp(tx - p.vx, -accel * dt, accel * dt);
  p.vy += clamp(ty - p.vy, -accel * dt, accel * dt);
  if (move.len === 0) {
    const f = Math.exp(-PLAYER.friction * dt);
    p.vx *= f; p.vy *= f;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const speed = Math.hypot(p.vx, p.vy);
  p.moving = speed > 12;
  if (p.moving) p.phase += dt * (speed > 150 ? 15 : 9);
  p.step += dt;

  // Face where you walk, or where you point the gun.
  if (p.aiming) p.angle = approachAngle(p.angle, aim, 14 * dt);
  else if (p.moving) p.angle = approachAngle(p.angle, Math.atan2(p.vy, p.vx), 12 * dt);

  // Walls.
  const hit = game.world.hitSolids(p.x, p.y, PLAYER.radius);
  if (hit) {
    p.x = hit.x; p.y = hit.y;
    const into = p.vx * hit.nx + p.vy * hit.ny;
    if (into < 0) { p.vx -= hit.nx * into; p.vy -= hit.ny * into; }
  }

  // Cars are solid too: shoulder past them, never through.
  for (const v of game.vehicles) {
    if (v.dead && Math.hypot(v.x - p.x, v.y - p.y) > 90) continue;
    const d = Math.hypot(v.x - p.x, v.y - p.y);
    const min = carRadius(v) + PLAYER.radius;
    if (d < min && d > 0.01) {
      const nx = (p.x - v.x) / d, ny = (p.y - v.y) / d;
      p.x = v.x + nx * min;
      p.y = v.y + ny * min;
      // A car moving fast enough into the player hurts.
      const rel = Math.hypot(v.vx, v.vy);
      if (rel > 130 && p.invuln <= 0) {
        game.damagePlayer(clamp(rel * 0.055, 4, 34), 'car');
        const a = Math.atan2(p.y - v.y, p.x - v.x);
        p.vx += Math.cos(a) * 180;
        p.vy += Math.sin(a) * 180;
      }
    }
  }

  // The sand and the pier slow nobody, but the sea is the edge of the world.
  p.x = clamp(p.x, 20, game.world.bounds.w - 30);
  p.y = clamp(p.y, 16, game.world.bounds.h - 16);
}

/** How much room the player has, for the health bar and the death check. */
export function hurtPlayer(game, amount, cause) {
  const p = game.player;
  if (p.dead) return;
  if (p.invuln > 0 && cause !== 'explosion') return;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, amount * 0.6);
    p.armor -= absorbed;
    amount -= absorbed;
  }
  p.health = Math.max(0, p.health - amount);
  p.hitFlash = 1;
  game.audio.play('hurt');
  if (p.health <= 0) {
    p.dead = true;
    p.deathTimer = 0;
    p.vx = 0; p.vy = 0;
    if (p.inCar) { p.inCar.driver = null; p.inCar = null; }
    game.onPlayerDeath(cause);
  }
}

/** Ammo for the weapon in hand, as a short string for the HUD. */
export function ammoOf(p) {
  const w = WEAPONS[p.weapon] || WEAPONS.fists;
  if (w.melee) return '';
  const n = p.ammo[p.weapon] ?? 0;
  return n > 0 ? String(n) : '0';
}

/** Switch weapons, skipping the ones with no ammo. */
export function cycleWeapon(game, dir) {
  const order = ['fists', 'pistol', 'smg', 'shotgun'];
  const p = game.player;
  let i = order.indexOf(p.weapon);
  for (let k = 0; k < order.length; k += 1) {
    i = (i + dir + order.length) % order.length;
    const key = order[i];
    const w = WEAPONS[key];
    if (w.melee || (p.ammo[key] ?? 0) > 0) {
      p.weapon = key;
      game.audio.play('click');
      return;
    }
  }
}
