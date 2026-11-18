// The simulation: builds the city once, wires the systems together, and advances the world in
// fixed 1/60 s steps. Input, rendering and menus live outside; this file is the rules.
import { PLAYER, STEP, WEAPONS } from './config.js';
import { clamp, createRandom, dist } from './util.js';
import { createWorld } from './world.js';
import { createStreets } from './streets.js';
import { createEffects } from './effects.js';
import { createPlayer, stepPlayer, enterCar, exitCar, carUnderPlayer, cycleWeapon, hurtPlayer } from './player.js';
import { createVehicle, stepVehicle, collideVehicles, explodeVehicle, carRadius, damageVehicle } from './vehicles.js';
import { stepTraffic, refillTraffic, scatterParkedCars, placeHeroCar } from './traffic.js';
import { stepPeds, populatePeds, runOverPed, startlePeds, hitPed } from './pedestrians.js';
import { stepBullets, playerAttack } from './combat.js';
import { createWanted, stepPolice, addHeat, witnessCrime, clearWanted } from './police.js';
import { createMissions, createMissionRunner, stepGang, stepChasers } from './missions.js';
import { createEconomy } from './economy.js';
import { createSave } from './save.js';

const TYPE_NAMES = {
  sedan: 'Lark Sedan', coupe: 'Meridian Coupe', sport: 'Viento GT', van: 'Bongo Van',
  taxi: 'Sol Cab', police: 'Vela PD Cruiser', muscle: 'Barracuda',
};

const DEFAULT_SEED = 20261118;

export function createGame({ audio, seed }) {
  const world = createWorld(seed || DEFAULT_SEED);
  const streets = createStreets();
  const effects = createEffects();
  const player = createPlayer(world.places.market.x - 260, world.places.market.y + 210);

  const game = {
    state: 'title',
    time: 0,
    deaths: 0,
    deathTime: 0,
    world, streets, effects, audio,
    player,
    vehicles: [],
    peds: [],
    cops: [],
    bullets: [],
    notifications: [],
    stats: { carsStolen: 0, shotsFired: 0, hits: 0, civiliansKilled: 0, pickups: 0, missionsDone: 0, distance: 0 },
    wanted: createWanted(),
    camera: { x: player.x, y: player.y, zoom: 1 },
    mouse: { x: 0, y: 0 },
    menus: {},
    toast: 0,
    seed: seed || DEFAULT_SEED,
  };

  game.missionList = createMissions(world);
  game.economy = createEconomy(game);
  game.missions = createMissionRunner(game);
  game.save = createSave(game);
  game.mission = null;

  game.notify = (text, color = '#f2ead6') => {
    game.notifications.unshift({ text, color, t: 0, life: 4.2 });
    if (game.notifications.length > 4) game.notifications.pop();
  };
  game.addMoney = (n) => game.economy.add(n);
  game.damagePlayer = (n, cause) => hurtPlayer(game, n, cause);
  game.witnessCrime = (kind, x, y) => witnessCrime(game, kind, x, y);
  game.panicPedAt = (x, y, n) => startlePeds(game, x, y, 220, 3 + n);
  game.vehicleName = (v) => TYPE_NAMES[v.type] || 'Car';
  game.addHeat = (n) => addHeat(game, n);

  /** A free patch of tarmac or paving near a point, for something that must not spawn inside a car. */
  game.freeSpot = (x, y, radius = 46) => {
    for (let k = 0; k < 24; k += 1) {
      const a = (k / 24) * Math.PI * 2;
      const r = radius * (1 + Math.floor(k / 8));
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r;
      if (game.world.hitSolids(px, py, 24)) continue;
      let clear = true;
      for (const v of game.vehicles) if (dist(v.x, v.y, px, py) < 46) { clear = false; break; }
      if (clear) return { x: px, y: py };
    }
    return { x, y };
  };

  /** The car the first job is about: cream, fast, parked in the marina lot. */
  game.placeHero = () => {
    if (game.vehicles.some((v) => v.isHero)) return game.vehicles.find((v) => v.isHero);
    const spot = game.freeSpot(world.places.marina.x, world.places.marina.y, 60);
    return placeHeroCar(game, spot.x, spot.y, Math.PI / 2);
  };

  /** Start a fresh run: money, body, wanted level, job board, the cars around town. */
  game.reset = (fromSave = false) => {
    game.vehicles.length = 0;
    game.peds.length = 0;
    game.cops.length = 0;
    game.bullets.length = 0;
    game.notifications.length = 0;
    game.missions.active = null;
    game.missions.completed = new Set();
    game.missions.flash = null;
    game.mission = null;
    clearWanted(game);
    const p = game.player;
    p.health = PLAYER.maxHealth;
    p.armor = 0;
    p.dead = false;
    p.inCar = null;
    p.weapon = 'pistol';
    p.ammo.pistol = 48;
    p.ammo.smg = 0;
    p.ammo.shotgun = 0;
    p.x = world.places.market.x - 260;
    p.y = world.places.market.y + 210;
    p.vx = 0; p.vy = 0;
    p.angle = 0;
    game.economy.money = 0;
    game.economy.shown = 0;
    game.time = 0;
    game.deaths = 0;
    for (const k of Object.keys(game.stats)) game.stats[k] = 0;
    if (fromSave) game.save.restore();
    scatterParkedCars(game);
    for (let i = 0; i < 8; i += 1) refillTraffic(game);
    populatePeds(game, 30);
    game.economy.scatter(world);
  };

  game.onPlayerDeath = (cause) => {
    game.state = 'dead';
    game.deathTime = 0;
    game.deaths += 1;
    if (game.missions.active) game.missions.fail(cause === 'car' ? 'Run down in the street' : 'You died');
    game.audio.play('fail');
    game.effects.addShake(6);
  };

  /** Respawn at the clinic with the bill paid and the slate clean. */
  game.respawn = () => {
    const p = game.player;
    p.dead = false;
    p.health = PLAYER.maxHealth;
    p.armor = 0;
    p.inCar = null;
    const clinic = game.freeSpot(world.places.market.x + 40, world.places.market.y - 150, 40);
    p.x = clinic.x;
    p.y = clinic.y;
    p.vx = 0; p.vy = 0;
    p.invuln = 2.4;
    game.economy.money = Math.max(0, game.economy.money - 100);
    clearWanted(game);
    game.bullets.length = 0;
    game.state = 'play';
  };

  /** One fixed step. `input` is the keyboard/mouse state; `aim` is the cursor in world units. */
  game.tick = (input, aim) => {
    const dt = STEP;
    game.time += dt;
    const p = game.player;

    // --- the player: at the wheel, or on their feet ---
    if (p.inCar) {
      const car = p.inCar;
      const move = input.move();
      // Steering is relative to the screen: W is forward, A and D turn while rolling.
      const steer = (move.x || 0) * -1;
      const inputCar = {
        throttle: move.y < 0 ? 1 : 0,
        brake: move.y > 0 ? 1 : 0,
        steer: clamp(steer, -1, 1),
        handbrake: input.handbrake(),
      };
      if (input.isDown('ArrowUp')) inputCar.throttle = 1;
      if (input.isDown('ArrowDown')) inputCar.brake = 1;
      if (input.isDown('ArrowLeft')) inputCar.steer = -1;
      if (input.isDown('ArrowRight')) inputCar.steer = 1;
      const before = { x: car.x, y: car.y };
      stepVehicle(car, dt, inputCar, game.world, game.effects);
      game.stats.distance += Math.hypot(car.x - before.x, car.y - before.y) * 0.01;
      p.x = car.x; p.y = car.y; p.angle = car.angle;
      if (car.dead && car.burn > 3.2 && !car.exploded) {
        car.exploded = true;
        explodeVehicle(car, game.effects, game);
        if (car.ai && car.ai.edge) car.ai = null;
      }
      if (!car.dead) playerAttack(game, input);
    } else {
      stepPlayer(game, input, dt, aim);
      playerAttack(game, input);
    }

    // --- civilians ---
    for (const v of game.vehicles) if (v.driver === 'traffic') stepTraffic(game, v, dt);

    // --- things hitting other things ---
    for (let i = 0; i < game.vehicles.length; i += 1) {
      const a = game.vehicles[i];
      for (let j = i + 1; j < game.vehicles.length; j += 1) {
        const b = game.vehicles[j];
        if (Math.abs(a.x - b.x) > 90 || Math.abs(a.y - b.y) > 90) continue;
        collideVehicles(a, b, game.effects);
      }
    }
    for (const v of game.vehicles) {
      if (Math.abs(v.speed) < 30 || v.dead) continue;
      for (const ped of game.peds) {
        if (ped.dead) continue;
        if (Math.abs(ped.x - v.x) > 46 || Math.abs(ped.y - v.y) > 46) continue;
        if (Math.hypot(ped.x - v.x, ped.y - v.y) < carRadius(v) + ped.r - 4) {
          runOverPed(game, ped, v);
          if (v.driver === 'player') game.witnessCrime('murder', ped.x, ped.y);
        }
      }
    }

    // --- the response, the pavement, the guns ---
    stepPolice(game, dt);
    stepPeds(game, dt);
    stepGang(game, dt);
    stepChasers(game, dt);
    stepBullets(game, dt);

    // --- jobs, money, noise ---
    game.missions.step(dt);
    game.economy.step(dt);
    for (let i = game.notifications.length - 1; i >= 0; i -= 1) {
      const n = game.notifications[i];
      n.t += dt;
      if (n.t >= n.life) game.notifications.splice(i, 1);
    }
    effects.update(dt);
    // A watchdog: anything that escaped the world's arithmetic is taken off the board.
    if (Math.random() < 0.02) {
      for (let i = game.vehicles.length - 1; i >= 0; i -= 1) {
        if (!Number.isFinite(game.vehicles[i].x) || !Number.isFinite(game.vehicles[i].y)) game.vehicles.splice(i, 1);
      }
      for (let i = game.peds.length - 1; i >= 0; i -= 1) {
        if (!Number.isFinite(game.peds[i].x) || !Number.isFinite(game.peds[i].y)) game.peds.splice(i, 1);
      }
    }
    refillTraffic(game);
    if (game.peds.length < 52 && Math.random() < 0.12) populatePeds(game, 56);
    game.toast = Math.max(0, game.toast - dt);
    game.deathTime += game.state === 'dead' ? dt : 0;
  };

  /** Run several steps at once, for staged scenes and for tests that need the world moving. */
  game.runSteps = (n, input, aimFn) => {
    for (let k = 0; k < n; k += 1) game.tick(input, aimFn ? aimFn(k) : { x: game.player.x + 100, y: game.player.y });
  };

  return game;
}
