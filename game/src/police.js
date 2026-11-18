// The wanted level and the police response to it: a heat value the crimes push up, stars the
// HUD reads, cruisers that hunt the player down, officers who get out and shoot, and a cooldown
// that starts the moment nobody has eyes on you. More stars, more cars, closer spawns, harder ramming.
import { WANTED } from './config.js';
import { clamp, createRandom, dist, wrapAngle } from './util.js';
import { createVehicle, damageVehicle, stepVehicle } from './vehicles.js';
import { createPed, startlePeds } from './pedestrians.js';
import { fireWeapon } from './combat.js';

const rng = createRandom(31337);
const CRIME_HEAT = { gunfire: 0.3, murder: 1.05, carjack: 0.35, copShot: 1.2, copKilled: 2.1, explosion: 1.1 };

export function createWanted() {
  return { heat: 0, stars: 0, unseen: 0, spawnTimer: 1.5, everWanted: false, bustedTimer: 0 };
}

/** A crime happened: push the heat up, and shout about it when a new star lands. */
export function addHeat(game, amount) {
  const w = game.wanted;
  const before = Math.ceil(w.heat);
  w.heat = clamp(w.heat + amount, 0, WANTED.maxStars);
  w.unseen = 0;
  w.stars = Math.min(WANTED.maxStars, Math.ceil(w.heat - 0.001));
  if (w.stars > before) {
    game.audio.play('wanted');
    game.notify(w.stars === 1 ? 'WANTED — the police are looking for you' : `WANTED LEVEL ${w.stars}`, '#e8b64c');
    w.everWanted = true;
  }
}

/** Anything loud or violent: reported if a cruiser or an officer could have seen or heard it. */
export function witnessCrime(game, kind, x, y) {
  const amount = CRIME_HEAT[kind] ?? 0.3;
  if (kind === 'gunfire') {
    if (game.time - (game.wanted.lastGunfire || -9) < 0.7) return;
    game.wanted.lastGunfire = game.time;
  }
  let seen = false;
  for (const v of game.vehicles) {
    if (v.driver === 'police' && dist(v.x, v.y, x, y) < 800) { seen = true; break; }
  }
  if (!seen) {
    for (const c of game.cops) {
      if (!c.dead && dist(c.x, c.y, x, y) < 520) { seen = true; break; }
    }
  }
  // A murder or a shot is always called in by somebody; a jacked car only if it was seen.
  if (!seen && (kind === 'murder' || kind === 'gunfire' || kind === 'copShot' || kind === 'copKilled' || kind === 'explosion')) seen = true;
  if (!seen) return;
  addHeat(game, amount * (seen ? 1 : 0.55));
  startlePeds(game, x, y, 260, 4);
}

/** A police cruiser spawns out of sight and comes looking. */
function spawnCruiser(game) {
  const w = game.wanted;
  for (let tries = 0; tries < 20; tries += 1) {
    const edge = rng.pick(game.streets.edges);
    const t = rng.range(30, edge.len - 30);
    const pt = { x: 0, y: 0 };
    game.streets.pointOn(edge, t, 0, pt);
    const d = dist(pt.x, pt.y, game.player.x, game.player.y);
    const near = w.stars >= 4 ? 380 : 560;
    if (d < near || d > 1500) continue;
    const car = createVehicle('police', pt.x, pt.y, edge.ang);
    car.driver = 'police';
    car.siren = true;
    car.ai = { edge, t, lane: 0, mode: 'pursue', stuck: 0, fireTimer: 0.8 };
    car.vx = Math.cos(edge.ang) * 160;
    car.vy = Math.sin(edge.ang) * 160;
    game.vehicles.push(car);
    return car;
  }
  // Nothing in the band: come from wherever the nearest road is.
  const near = game.streets.nearestEdge(game.player.x + (Math.random() - 0.5) * 900, game.player.y + (Math.random() - 0.5) * 900);
  if (!near.edge) return null;
  const car = createVehicle('police', near.edge.ax + near.edge.dx * near.t, near.edge.ay + near.edge.dy * near.t, near.edge.ang);
  car.driver = 'police';
  car.siren = true;
  car.ai = { edge: near.edge, t: near.t, lane: 0, mode: 'pursue', stuck: 0, fireTimer: 0.8 };
  game.vehicles.push(car);
  return car;
}

function spawnOfficer(game, x, y) {
  const cop = createPed(x, y, { cop: true, armed: true, hostile: true, shirt: '#2a3550', ring: null });
  cop.health = 120;
  cop.r = 9;
  cop.speed = 132;
  cop.fireTimer = rng.range(0.3, 1);
  cop.weapon = 'pistol';
  game.cops.push(cop);
  return cop;
}

/** Cruiser driving: chase the player, ram at speed, shoot from the window at three stars. */
function driveCop(game, v, dt) {
  const p = game.player;
  const target = p.inCar ? p.inCar : p;
  const lead = 0.28;
  const tx = target.x + (target.vx || 0) * lead;
  const ty = target.y + (target.vy || 0) * lead;
  const want = Math.atan2(ty - v.y, tx - v.x);
  const diff = wrapAngle(want - v.angle);
  const d = dist(v.x, v.y, p.x, p.y);

  let throttle = 1;
  let brake = 0;
  if (Math.abs(diff) > 1.25 && v.speed > 190) { throttle = 0.15; brake = 0.45; }
  if (d < 54) { throttle = 0.5; brake = 0.25; }
  // Reverse out when stuck nose-first in a wall.
  if (Math.abs(v.speed) < 24 && v.ai.stuck > 1.2) {
    brake = 1;
    throttle = 0;
  }
  stepVehicle(v, dt, {
    throttle: v.ai.stuck > 1.2 && v.speed < 10 ? 0 : throttle,
    brake: v.ai.stuck > 1.2 && v.speed < 10 ? 1 : brake,
    steer: clamp(diff * 2.8, -1, 1),
    handbrake: Math.abs(diff) > 1.9 && Math.abs(v.speed) > 120,
  }, game.world, game.effects);
  v.ai.stuck = Math.abs(v.speed) < 20 ? v.ai.stuck + dt : 0;

  // An officer gets out when the cruiser is close and stopped enough to jump out.
  if (d < 78 && Math.abs(v.speed) < 95 && game.cops.filter((c) => !c.dead).length < 3 + game.wanted.stars) {
    if (!v.ai.dropped) {
      v.ai.dropped = true;
      spawnOfficer(game, v.x + Math.cos(v.angle) * 30, v.y + Math.sin(v.angle) * 30);
      game.audio.play('door');
    }
  }

  // Drive-by fire, once the player is worth shooting at.
  if (game.wanted.stars >= 3 && d < 330 && game.world.lineClear(v.x, v.y, p.x, p.y)) {
    v.ai.fireTimer -= dt;
    if (v.ai.fireTimer <= 0) {
      v.ai.fireTimer = 0.85 + Math.random() * 0.7;
      const a = Math.atan2(p.y - v.y, p.x - v.x) + (Math.random() - 0.5) * 0.24;
      fireWeapon(game, { x: v.x, y: v.y, angle: a, weapon: 'pistol', owner: 'cop' }, false);
    }
  }

  if (d > 1500 || v.dead) {
    v.gone = true;
  }
}

/** An officer on foot: close in, shoot from cover range, and keep coming even when hit. */
function stepOfficer(game, cop, dt) {
  const p = game.player;
  if (cop.dead) return;
  const d = dist(cop.x, cop.y, p.x, p.y);
  const tx = p.inCar ? p.inCar.x : p.x;
  const ty = p.inCar ? p.inCar.y : p.y;
  cop.phase += dt * 12;
  if (d > 40) {
    const a = Math.atan2(ty - cop.y, tx - cop.x);
    cop.angle = a;
    const speed = d > 260 ? 150 : 120;
    cop.x += Math.cos(a) * speed * dt;
    cop.y += Math.sin(a) * speed * dt;
    const hit = game.world.hitSolids(cop.x, cop.y, cop.r);
    if (hit) { cop.x = hit.x; cop.y = hit.y; }
  } else {
    cop.angle = Math.atan2(ty - cop.y, tx - cop.x);
  }
  // Shooting.
  const canSee = d < 380 && game.world.lineClear(cop.x, cop.y, tx, ty);
  cop.fireTimer -= dt;
  if (canSee && cop.fireTimer <= 0) {
    cop.fireTimer = 0.9 + Math.random() * 0.9;
    const a = cop.angle + (Math.random() - 0.5) * 0.2;
    fireWeapon(game, { x: cop.x, y: cop.y, angle: a, weapon: 'pistol', owner: 'cop' }, false);
  }
  // Hands on the player at arm's length: a pistol whip.
  if (d < 26) {
    cop.meleeTimer = (cop.meleeTimer || 0) - dt;
    if (cop.meleeTimer <= 0) {
      cop.meleeTimer = 1.1;
      game.damagePlayer(9, 'melee');
    }
  }
  if (d > 1700) cop.dead = true;
}

/** One step of the whole response: decay, spawns, pursuit, officers, bookkeeping. */
export function stepPolice(game, dt) {
  const w = game.wanted;
  const p = game.player;

  // Anyone with eyes on the player?
  let seen = false;
  for (const v of game.vehicles) {
    if (v.driver === 'police' && !v.dead && dist(v.x, v.y, p.x, p.y) < 760 && game.world.lineClear(v.x, v.y, p.x, p.y)) { seen = true; break; }
  }
  if (!seen) {
    for (const c of game.cops) {
      if (!c.dead && dist(c.x, c.y, p.x, p.y) < 620) { seen = true; break; }
    }
  }
  if (seen) w.unseen = 0;
  else if (w.heat > 0) w.unseen += dt;

  if (w.heat > 0 && !seen && w.unseen > WANTED.decayDelay) {
    w.heat = Math.max(0, w.heat - WANTED.decayRate * dt * (w.stars >= 4 ? 0.75 : 1));
    if (w.heat <= 0.02) {
      w.heat = 0;
      if (w.stars > 0) {
        w.stars = 0;
        game.notify('You lost the police', '#9fd8a8');
        game.audio.play('clean');
        game.missions.onWantedCleared?.(game);
      }
    } else {
      w.stars = Math.min(WANTED.maxStars, Math.ceil(w.heat - 0.001));
    }
  }

  // Spawns: one cruiser every second or so until the stars are covered.
  w.spawnTimer -= dt;
  const cruisers = game.vehicles.filter((v) => v.driver === 'police' && !v.dead).length;
  if (w.stars > 0 && cruisers < WANTED.copCap[w.stars] && w.spawnTimer <= 0) {
    w.spawnTimer = w.stars >= 4 ? 0.6 : 1.4;
    if (seen || w.unseen < 6) spawnCruiser(game);
  }

  for (const v of game.vehicles) {
    if (v.driver === 'police' && !v.dead) driveCop(game, v, dt);
  }
  for (const c of game.cops) stepOfficer(game, c, dt);

  // Sweep what left the world.
  for (let i = game.vehicles.length - 1; i >= 0; i -= 1) {
    const v = game.vehicles[i];
    if (v.gone) game.vehicles.splice(i, 1);
  }
  game.cops = game.cops.filter((c) => !c.dead || c.timer < 12);

  // A blow-up in a police car hurts the chase, not the score.
  if (w.stars === 0) {
    for (const v of game.vehicles) {
      if (v.driver === 'police') v.siren = false;
    }
  }
}

/** Wipe the slate: used on death and on a clean save load. */
export function clearWanted(game) {
  game.wanted.heat = 0;
  game.wanted.stars = 0;
  game.wanted.unseen = 0;
  for (const v of game.vehicles) if (v.driver === 'police') { v.driver = null; v.siren = false; }
  for (const c of game.cops) c.dead = true;
  game.cops = [];
}
