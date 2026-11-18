// Staged scenes for the four screenshots. Each one is built out of the game's own pieces — the
// same cars, the same police, the same mission runner — then the simulation is stepped for real
// for a second or two, so what the camera catches is a frame of a running world and not a posed
// picture. ?shot=<name> selects one; window.__shotReady says it is painted.
import { CAR_TYPES, PITCH, ROAD, roadX, roadY } from './config.js';
import { createVehicle } from './vehicles.js';
import { createPed } from './pedestrians.js';
import { addHeat } from './police.js';

/** A stand-in for the keyboard that holds whatever a scene needs held. */
function scripted(keys = {}) {
  const held = new Set(keys.hold || []);
  return {
    isDown: (code) => held.has(code),
    hit: () => false,
    move: () => ({ x: keys.x || 0, y: keys.y || 0, len: keys.x || keys.y ? 1 : 0 }),
    run: () => held.has('ShiftLeft'),
    handbrake: () => held.has('Space'),
    fire: () => !!keys.fire,
    firePressed: () => !!keys.fire,
    endFrame: () => {},
    mouse: { x: 0, y: 0 },
  };
}

/** A car in a lane, heading the way that lane goes. */
function carOnRoad(type, i, j, lane = 0, along = true, dir = 1, opts = {}) {
  const off = lane === 0 ? 15 : 44;
  const x = along ? roadX(i) + dir * 40 : roadX(i) + dir * off;
  const y = along ? roadY(j) + dir * off : roadY(j) + dir * 40;
  const car = createVehicle(type, x, y, along ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), opts);
  car.vx = Math.cos(car.angle) * 60;
  car.vy = Math.sin(car.angle) * 60;
  return car;
}

/** Put the player in a car at a spot, facing an angle, already rolling. */
function driveIn(game, car, speed = 0) {
  game.player.inCar = car;
  car.driver = 'player';
  car.parked = false;
  game.player.x = car.x;
  game.player.y = car.y;
  game.player.angle = car.angle;
  car.vx = Math.cos(car.angle) * speed;
  car.vy = Math.sin(car.angle) * speed;
  car.speed = speed;
}

function setMission(game, id, index) {
  const def = game.missionList.find((m) => m.id === id);
  if (!def) return null;
  game.missions.start(def);
  const a = game.missions.active;
  a.index = index;
  a.entered = false;
  a.timer = def.steps[index].timer || 0;
  game.notifications.length = 0;
  return a;
}

function policeBehind(game, n, gap = 150) {
  const p = game.player;
  const car = p.inCar || p;
  for (let k = 0; k < n; k += 1) {
    const a = car.angle + Math.PI + (k - (n - 1) / 2) * 0.18;
    const d = gap + k * 70;
    const cop = createVehicle('police', car.x + Math.cos(a) * d, car.y + Math.sin(a) * d, car.angle);
    cop.driver = 'police';
    cop.siren = true;
    cop.ai = { mode: 'pursue', stuck: 0, fireTimer: 0.6 };
    cop.vx = Math.cos(car.angle) * 240;
    cop.vy = Math.sin(car.angle) * 240;
    game.vehicles.push(cop);
  }
}

/** A crowd on a pavement, for the scenes that want the city busy. */
function crowd(game, x, y, n, spread = 120) {
  for (let k = 0; k < n; k += 1) {
    const a = (k / n) * Math.PI * 2;
    const ped = createPed(x + Math.cos(a) * spread * (0.4 + Math.random() * 0.6), y + Math.sin(a) * spread * (0.4 + Math.random() * 0.6), {
      angle: a, ring: null,
    });
    ped.state = 'walk';
    ped.speed = 30 + Math.random() * 30;
    game.peds.push(ped);
  }
}

function paint(renderer, game, frames = 2) {
  let done = 0;
  function step() {
    renderer.updateCamera(game, 1 / 60);
    renderer.draw(game, game.time);
    done += 1;
    if (done < frames) requestAnimationFrame(step);
    else window.__shotReady = true;
  }
  requestAnimationFrame(step);
}

export function stageShot(game, renderer, name) {
  // Common ground: a running world, no menus, and the camera pointed at the player.
  game.state = 'play';
  game.menus = game.menus || {};
  const aimAt = (x, y) => ({ x, y });

  if (name === 'cover') {
    const i = 2, j = 3;
    const x = roadX(i) + 90, y = roadY(j) + 15;
    const car = createVehicle('sport', x, y, 0, { color: '#e8503f', isHero: true });
    game.vehicles.push(car);
    driveIn(game, car, 210);
    // The job is live: this is the Viento the first mission asks for, and it is on the move.
    const job = setMission(game, 'repo', 1);
    if (job) job.data.hero = car;
    game.wanted.heat = 2.62;
    game.wanted.stars = 3;
    game.wanted.unseen = 0;
    game.economy.money = 1240;
    game.economy.shown = 1240;
    policeBehind(game, 2, 170);
    // Traffic alongside and ahead.
    for (const [ti, tj, dir] of [[3, 3, 1], [4, 3, 1], [1, 3, -1], [2, 2, 1], [3, 4, 1]]) {
      const t = carOnRoad(['sedan', 'taxi', 'van', 'coupe'][Math.floor(Math.random() * 4)], ti, tj, 0, true, dir);
      t.driver = 'traffic';
      t.ai = { edge: game.streets.edges[0], t: 0, lane: 0, cruise: 150, stuck: 0 };
      game.vehicles.push(t);
    }
    crowd(game, roadX(3) + ROAD / 2 + 40, roadY(2) + 150, 7, 70);
    game.notifications.length = 0;
    game.notify('Suspect heading east on Avenida Sol', '#e8b64c');
    game.notifications.length = 1;
    game.runSteps(80, scripted({ y: -1, hold: ['KeyW'] }), () => aimAt(game.player.x + 400, game.player.y - 40));
    // A handbrake turn to finish: the frame catches the car sideways with its tyres smoking.
    game.runSteps(44, scripted({ y: -1, x: -1, hold: ['KeyW', 'Space'] }), () => aimAt(game.player.x + 300, game.player.y - 120));
    game.wanted.heat = 2.62;
    game.wanted.stars = 3;
    game.notifications.length = 0;
    game.notify('Suspect heading east on Avenida Sol', '#e8b64c');
    renderer.snapCamera(game);
    paint(renderer, game);
    return true;
  }

  if (name === 'drive') {
    const i = 4, j = 2;
    const car = createVehicle('muscle', roadX(i) + 120, roadY(j) + 15, 0, { color: '#2f8f96' });
    game.vehicles.push(car);
    driveIn(game, car, 220);
    game.wanted.heat = 0;
    game.wanted.stars = 0;
    game.economy.money = 860;
    game.economy.shown = 860;
    for (const [ti, tj, dir, type] of [[3, 2, -1, 'taxi'], [5, 2, 1, 'sedan'], [4, 1, 1, 'van'], [4, 3, 1, 'coupe'], [2, 2, -1, 'sport']]) {
      const t = carOnRoad(type, ti, tj, 0, true, dir);
      t.driver = 'traffic';
      t.ai = { edge: game.streets.edges[0], t: 0, lane: 0, cruise: 165, stuck: 0 };
      game.vehicles.push(t);
    }
    crowd(game, roadX(5) + ROAD / 2 + 60, roadY(2) + 60, 9, 100);
    crowd(game, roadX(3) + ROAD / 2 + 60, roadY(2) + 240, 6, 80);
    game.notifications.length = 0;
    game.notify('Norte — the towers are close now', '#f2d98a');
    game.runSteps(120, scripted({ y: -1, hold: ['KeyW'] }), () => aimAt(game.player.x + 400, game.player.y));
    // This frame is the quiet drive, not a chase: whatever the traffic did on the way through,
    // the HUD shows the city and the job board, and no cruiser is on the road.
    game.wanted.heat = 0;
    game.wanted.stars = 0;
    game.wanted.unseen = 0;
    for (let k = game.vehicles.length - 1; k >= 0; k -= 1) {
      const v = game.vehicles[k];
      if (v.driver === 'police') game.vehicles.splice(k, 1);
    }
    renderer.snapCamera(game);
    paint(renderer, game);
    return true;
  }

  if (name === 'combat') {
    const place = game.world.places.market;
    game.player.x = place.x - 86;
    game.player.y = place.y + 92;
    game.player.angle = -Math.PI / 2;
    game.player.health = 62;
    game.player.armor = 24;
    game.player.weapon = 'smg';
    game.player.ammo.smg = 96;
    game.wanted.heat = 1.35;
    game.wanted.stars = 2;
    game.economy.money = 1930;
    game.economy.shown = 1930;
    setMission(game, 'shakedown', 1);
    game.runSteps(6, scripted({}), () => aimAt(place.x - 20, place.y - 40));
    // Make sure the crew is up and shooting at the player, and the player is returning fire.
    for (const g of game.peds) {
      if (!g.gang) continue;
      g.x = place.x + (Math.random() - 0.5) * 150;
      g.y = place.y - 20 + (Math.random() - 0.5) * 90;
      g.state = 'walk';
    }
    crowd(game, place.x + 140, place.y + 90, 5, 60);
    game.runSteps(50, scripted({ fire: true }), () => aimAt(place.x - 20, place.y - 40));
    game.player.health = 58;
    game.notifications.length = 0;
    game.notify('Clear the club crew: 2 left', '#e8b64c');
    renderer.snapCamera(game);
    renderer.camera.zoom = 0.98;
    paint(renderer, game);
    return true;
  }

  if (name === 'menu') {
    game.state = 'title';
    try {
      window.localStorage.setItem('velamar.save.v1', JSON.stringify({
        v: 1, at: Date.now(), money: 2450, health: 84, armor: 20, x: 1930, y: 1600, angle: 0.4,
        weapon: 'smg', ammo: { pistol: 34, smg: 88, shotgun: 0 }, completed: ['repo', 'shakedown'],
        wanted: 0, playtime: 940, stats: {}, seed: 20261118,
      }));
    } catch { /* storage off: the menu still draws, without CONTINUE */ }
    paint(renderer, game);
    return true;
  }

  return false;
}
