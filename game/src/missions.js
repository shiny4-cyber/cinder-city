// The story: four jobs, each a list of objectives with a marker in the world, a fail state and
// a payout. A mission is a little state machine — walk into the contact, the first objective
// lights up, each step checks its own condition, and the money lands when the last one is done.
// Failing puts the job back on the board so it can be tried again.
import { CAR_TYPES } from './config.js';
import { clamp, createRandom, dist } from './util.js';
import { createPed, hitPed } from './pedestrians.js';
import { createVehicle, damageVehicle, stepVehicle } from './vehicles.js';
import { fireWeapon } from './combat.js';
import { addHeat, clearWanted } from './police.js';
import { cycleWeapon } from './player.js';

const rng = createRandom(5150);

/** A gang member who will shoot back, placed for a job. */
function spawnGang(game, x, y, weapon = 'pistol') {
  const ped = createPed(x, y, { gang: true, hostile: true, armed: true, shirt: '#5d3f6b', ring: null });
  ped.health = 90;
  ped.weapon = weapon;
  ped.fireTimer = 0.6 + Math.random();
  ped.homeX = x;
  ped.homeY = y;
  game.peds.push(ped);
  return ped;
}

/** A car that hunts the player: used by the courier job and by gang retaliation. */
function spawnChaser(game, x, y) {
  const car = createVehicle('muscle', x, y, rng.range(0, 6.28), { color: '#4a2f3d' });
  car.driver = 'gang';
  car.ai = { hunt: true, fireTimer: 1.2 };
  game.vehicles.push(car);
  return car;
}

export function createMissions(world) {
  const p = world.places;
  const M = [];

  // ---- 1. The Repo Man: take a car that is not yours and hand it to a man at the docks ----
  M.push({
    id: 'repo',
    title: 'The Repo Man',
    client: 'Celia',
    blurb: 'Celia lends money to people who should know better. One of them stopped paying.',
    start: { x: p.marina.x, y: p.marina.y - 40 },
    payout: 450,
    steps: [
      {
        text: 'Find the Viento GT in the marina lot',
        marker: () => ({ x: p.marina.x, y: p.marina.y + 20, label: 'VIENTO' }),
        done: (g) => !!g.mission.data.hero && g.player.inCar === g.mission.data.hero,
        enter: (g) => {
          if (!g.mission.data.hero) g.mission.data.hero = g.placeHero();
        },
        hint: 'Walk to the cream sports car and press E',
      },
      {
        text: 'Deliver the Viento to the docks warehouse',
        marker: () => ({ x: p.docks.x, y: p.docks.y, label: 'WAREHOUSE' }),
        done: (g) => g.player.inCar === g.mission.data.hero && dist(g.player.x, g.player.y, p.docks.x, p.docks.y) < 46,
        fail: (g) => (g.mission.data.hero && g.mission.data.hero.dead ? 'The Viento is wrecked' : null),
        hint: 'Stay in the car until you reach the marker',
      },
    ],
    outro: 'Celia pays in cash and says nothing else.',
  });

  // ---- 2. Shakedown: a market stall that stopped paying its dues ----
  M.push({
    id: 'shakedown',
    title: 'Shakedown',
    client: 'Celia',
    blurb: 'Three men at Sol Market are selling somebody else\'s stock. Celia wants the cash and the point made.',
    start: { x: p.market.x + 60, y: p.market.y + 60 },
    payout: 600,
    steps: [
      {
        text: 'Go to Sol Market',
        marker: () => ({ x: p.market.x, y: p.market.y, label: 'SOL MARKET' }),
        done: (g) => dist(g.player.x, g.player.y, p.market.x, p.market.y) < 150,
      },
      {
        text: 'Take out the three men at the stalls',
        marker: () => ({ x: p.market.x, y: p.market.y, label: 'CREW' }),
        enter: (g) => {
          const spots = [[-70, -50], [70, -40], [10, 70]];
          for (const [dx, dy] of spots) {
            g.mission.data.enemies.push(spawnGang(g, p.market.x + dx, p.market.y + dy, dx < 0 ? 'smg' : 'pistol'));
          }
        },
        done: (g) => g.mission.data.enemies.every((e) => e.dead),
        hint: 'Fists work, but a pistol answers faster',
      },
      {
        text: 'Collect the cash',
        marker: () => ({ x: p.market.x, y: p.market.y - 4, label: 'CASH' }),
        done: (g) => dist(g.player.x, g.player.y, p.market.x, p.market.y) < 34,
        enter: (g) => g.effects.cash(p.market.x, p.market.y, 14),
      },
    ],
    outro: 'The market goes quiet behind you.',
  });

  // ---- 3. Overdue Delivery: a package across town, with a clock and company ----
  M.push({
    id: 'delivery',
    title: 'Overdue Delivery',
    client: 'Tavo',
    blurb: 'Tavo needs a package at the pier before the boat leaves. Two cars full of men would rather it did not arrive.',
    start: { x: p.park.x, y: p.park.y + 50 },
    payout: 900,
    steps: [
      {
        text: 'Pick up the package in Parque Viejo',
        marker: () => ({ x: p.park.x, y: p.park.y, label: 'PACKAGE' }),
        done: (g) => dist(g.player.x, g.player.y, p.park.x, p.park.y) < 36,
        enter: (g) => {
          g.effects.ring(p.park.x, p.park.y, 'rgba(255,220,140,');
          g.notify('Package secured — get to the pier', '#f2d98a');
        },
      },
      {
        text: 'Deliver the package to the pier',
        marker: () => ({ x: p.pier.x, y: p.pier.y, label: 'PIER' }),
        timer: 130,
        done: (g) => dist(g.player.x, g.player.y, p.pier.x, p.pier.y) < 60,
        fail: (g) => (g.mission.timer <= 0 ? 'The boat left without it' : null),
        enter: (g) => {
          for (let k = 0; k < 2; k += 1) {
            const a = (k / 2) * Math.PI * 2 + 0.6;
            g.mission.data.enemies.push(spawnChaser(g, g.player.x + Math.cos(a) * 520, g.player.y + Math.sin(a) * 520));
          }
          g.notify('Two cars are on you. Move.', '#e8a07a');
        },
      },
    ],
    outro: 'The boat takes the package and a nod. Nothing else.',
  });

  // ---- 4. Pier Pressure: the club, the crew, and the sirens ----
  M.push({
    id: 'pier',
    title: 'Pier Pressure',
    client: 'Tavo',
    blurb: 'The Coral Club has been moving product on Tavo\'s pier. Clear it out, then lose whatever the club calls for help.',
    start: { x: p.club.x, y: p.club.y + 40 },
    payout: 1500,
    steps: [
      {
        text: 'Walk into the Coral Club',
        marker: () => ({ x: p.club.x, y: p.club.y, label: 'CORAL CLUB' }),
        done: (g) => dist(g.player.x, g.player.y, p.club.x, p.club.y) < 90,
      },
      {
        text: 'Clear the club crew: 4 left',
        marker: () => ({ x: p.club.x, y: p.club.y, label: 'CREW' }),
        enter: (g) => {
          const spots = [[-90, -60], [90, -50], [-40, 90], [60, 80]];
          for (const [dx, dy] of spots) {
            g.mission.data.enemies.push(spawnGang(g, p.club.x + dx, p.club.y + dy, rng() < 0.5 ? 'smg' : 'pistol'));
          }
          g.notify('They are not going to hand it over', '#e8a07a');
        },
        done: (g) => g.mission.data.enemies.every((e) => e.dead),
        textFn: (g) => `Clear the club crew: ${g.mission.data.enemies.filter((e) => !e.dead).length} left`,
      },
      {
        text: 'Lose the police',
        marker: () => null,
        enter: (g) => {
          addHeat(g, 2.1);
          g.notify('Somebody called it in. Get out of sight.', '#e8b64c');
        },
        done: (g) => g.wanted.stars === 0 && g.wanted.heat < 0.05,
        hint: 'Break line of sight and keep driving',
      },
    ],
    outro: 'The pier is Tavo\'s. For now.',
  });

  return M;
}

/** The mission runner: the active job, its step, its clock, and the board of contacts. */
export function createMissionRunner(game) {
  const runner = {
    list: game.missionList,
    active: null,
    completed: new Set(),
    flash: null,       // {text, sub, timer, good}
    cooldown: 0,

    /** The contact circle the player can walk into right now, if any. */
    contact() {
      if (runner.active) return null;
      const next = runner.nextMission();
      if (!next) return null;
      return { x: next.start.x, y: next.start.y, mission: next };
    },
    nextMission() {
      for (const m of runner.list) if (!runner.completed.has(m.id)) return m;
      return null;
    },

    start(mission) {
      runner.active = {
        def: mission,
        index: 0,
        timer: 0,
        state: 'active',
        data: { enemies: [], hero: null, cars: [] },
        entered: false,
      };
      game.mission = runner.active;
      game.notify(`${mission.title} — ${mission.client}`, '#f2d98a');
      game.audio.play('mission');
      runner.cooldown = 1.2;
    },

    step(dt) {
      runner.cooldown = Math.max(0, runner.cooldown - dt);
      if (runner.flash) {
        runner.flash.timer -= dt;
        if (runner.flash.timer <= 0) runner.flash = null;
      }
      const a = runner.active;
      if (!a) {
        // Walk into a contact to take the job.
        const c = runner.contact();
        if (c && runner.cooldown <= 0 && dist(game.player.x, game.player.y, c.x, c.y) < 28 && !game.player.inCar) {
          runner.start(c.mission);
        }
        return;
      }
      if (a.state !== 'active') return;

      const step = a.def.steps[a.index];
      if (!a.entered) {
        a.entered = true;
        a.timer = step.timer || 0;
        step.enter?.(game);
      }
      if (step.timer) {
        a.timer -= dt;
        if (a.timer <= 0) { runner.fail('Out of time'); return; }
      }

      // A blown-up mission car, or anything else the step calls a failure.
      const why = step.fail?.(game);
      if (why) { runner.fail(why); return; }

      if (step.done(game)) {
        a.index += 1;
        a.entered = false;
        if (a.index >= a.def.steps.length) runner.complete();
        else {
          game.audio.play('checkpoint');
          game.notify('Objective complete', '#9fd8a8');
        }
      }
    },

    complete() {
      const a = runner.active;
      const def = a.def;
      runner.completed.add(def.id);
      game.addMoney(def.payout);
      runner.flash = { text: 'MISSION COMPLETE', sub: `${def.title}  +$${def.payout}`, timer: 4.2, good: true };
      game.notify(`+$${def.payout} — ${def.title}`, '#9fd8a8');
      game.audio.play('complete');
      for (const e of a.data.enemies) if (!e.dead) { e.gang = false; e.hostile = false; }
      runner.active = null;
      game.mission = null;
      game.save.checkpoint();
      runner.cooldown = 2.5;
    },

    fail(why) {
      const a = runner.active;
      if (!a) return;
      a.state = 'failed';
      runner.flash = { text: 'MISSION FAILED', sub: why, timer: 3.4, good: false };
      game.notify(`Mission failed: ${why}`, '#e08a7a');
      game.audio.play('fail');
      for (const e of a.data.enemies) if (!e.dead && e.gang) { e.dead = true; e.timer = 0; }
      runner.active = null;
      game.mission = null;
      runner.cooldown = 3;
    },

    /** Called by police when the heat reaches zero: a step may be waiting on that. */
    onWantedCleared() {},

    /** The world marker the HUD and minimap point at. */
    marker() {
      const a = runner.active;
      if (!a) {
        const c = runner.contact();
        return c ? { x: c.x, y: c.y, label: 'JOB', contact: true } : null;
      }
      const step = a.def.steps[a.index];
      const m = step.marker?.(game);
      if (!m) return null;
      return { x: m.x, y: m.y, label: m.label, radius: a.def.id === 'shakedown' ? 150 : 26 };
    },

    objective() {
      const a = runner.active;
      if (!a) {
        const c = runner.contact();
        return c ? `Next job: ${c.mission.title}` : 'No jobs left. The city is yours.';
      }
      const step = a.def.steps[a.index];
      return step.textFn ? step.textFn(game) : step.text;
    },

    timerLeft() {
      const a = runner.active;
      if (!a) return null;
      const step = a.def.steps[a.index];
      return step.timer ? Math.max(0, a.timer) : null;
    },
  };
  return runner;
}

/** Gang members that are fighting: they close in, keep their distance, and shoot. */
export function stepGang(game, dt) {
  const p = game.player;
  for (const g of game.peds) {
    if (!g.gang || g.dead || !g.hostile) continue;
    const d = dist(g.x, g.y, p.x, p.y);
    if (d > 900) continue;
    g.phase += dt * 10;
    const tx = p.inCar ? p.inCar.x : p.x;
    const ty = p.inCar ? p.inCar.y : p.y;
    const a = Math.atan2(ty - g.y, tx - g.x);
    if (d > 150) {
      g.x += Math.cos(a) * 72 * dt;
      g.y += Math.sin(a) * 72 * dt;
      const hit = game.world.hitSolids(g.x, g.y, g.r);
      if (hit) { g.x = hit.x; g.y = hit.y; }
    }
    g.angle = a;
    if (d < 430 && game.world.lineClear(g.x, g.y, tx, ty)) {
      g.fireTimer -= dt;
      if (g.fireTimer <= 0) {
        g.fireTimer = (g.weapon === 'smg' ? 0.5 : 1.1) + Math.random() * 0.7;
        fireWeapon(game, { x: g.x, y: g.y, angle: a + (Math.random() - 0.5) * 0.22, weapon: g.weapon, owner: 'gang' }, false);
      }
    }
  }
}

/** Chaser cars from the courier job: drive at the player and lean out of the window. */
export function stepChasers(game, dt) {
  const p = game.player;
  for (const v of game.vehicles) {
    if (v.driver !== 'gang' || v.dead) continue;
    const target = p.inCar || p;
    const tx = target.x, ty = target.y;
    const d = dist(v.x, v.y, p.x, p.y);
    const want = Math.atan2(ty - v.y, tx - v.x);
    let diff = want - v.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    stepVehicle(v, dt, {
      throttle: d > 120 ? 1 : 0.45,
      brake: Math.abs(diff) > 1.3 && v.speed > 200 ? 0.5 : 0,
      steer: clamp(diff * 2.6, -1, 1),
      handbrake: Math.abs(diff) > 2 && Math.abs(v.speed) > 140,
    }, game.world, game.effects);
    v.ai.fireTimer -= dt;
    if (d < 260 && v.ai.fireTimer <= 0 && game.world.lineClear(v.x, v.y, p.x, p.y)) {
      v.ai.fireTimer = 1.4 + Math.random();
      fireWeapon(game, { x: v.x, y: v.y, angle: Math.atan2(p.y - v.y, p.x - v.x) + (Math.random() - 0.5) * 0.2, weapon: 'pistol', owner: 'gang' }, false);
    }
    if (d > 2600) v.gone = true;
  }
}
