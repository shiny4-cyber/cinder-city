// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between title, controls, play, pause and the death card.
//
// ?seed=N fixes the city. ?shot=cover|drive|combat|menu (with &seed=N) stages that scene from
// the real simulation and sets window.__shotReady for a screenshot.
import { createInput } from './input.js';
import { carUnderPlayer, cycleWeapon, enterCar, exitCar } from './player.js';
import { createRenderer } from './render.js';
import { createGame } from './sim.js';
import { createAudio } from './audio.js';
import { createMenu, drawTitle, menuAt, moveMenu } from './screens.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 20261118;

const canvas = document.getElementById('game');
const statusLine = document.getElementById('status');
const boot = document.getElementById('boot');
if (boot) boot.remove();

const renderer = createRenderer(canvas);
renderer.resize();
const audio = createAudio();
const input = createInput(canvas);
const game = createGame({ audio, seed });
game.camera = renderer.camera;
game.renderer = renderer;

const announce = (text) => { statusLine.textContent = text; };

const titleMenu = createMenu([
  { label: 'NEW GAME', action: 'new' },
  { label: 'CONTINUE', action: 'continue' },
  { label: 'HOW TO PLAY', action: 'controls' },
  { label: 'SOUND: ON', action: 'sound' },
]);
const pauseMenu = createMenu([
  { label: 'RESUME', action: 'resume' },
  { label: 'SAVE GAME', action: 'save' },
  { label: 'LOAD GAME', action: 'load' },
  { label: 'HOW TO PLAY', action: 'controls' },
  { label: 'QUIT TO TITLE', action: 'quit' },
]);
game.menus = { title: titleMenu, pause: pauseMenu };

game.reset();
renderer.snapCamera(game);

function startNew() {
  game.reset();
  renderer.snapCamera(game);
  game.state = 'play';
  audio.resume();
  audio.startMusic();
  announce('VELAMAR. New game. Find the gold marker for your first job.');
}

function continueGame() {
  game.reset(true);
  renderer.snapCamera(game);
  game.state = 'play';
  audio.resume();
  audio.startMusic();
  announce('VELAMAR. Continue.');
}

function quitToTitle() {
  game.state = 'title';
  audio.stopMusic();
  titleMenu.index = 0;
  announce('VELAMAR. Press enter to start.');
}

function chooseTitle() {
  const item = titleMenu.items[titleMenu.index];
  if (!item || item.disabled) return;
  if (item.action === 'new') startNew();
  else if (item.action === 'continue') { if (game.save.has()) continueGame(); }
  else if (item.action === 'controls') { game.state = 'controls'; }
  else if (item.action === 'sound') {
    const m = audio.toggleMute();
    item.label = m ? 'SOUND: OFF' : 'SOUND: ON';
    audio.resume();
  }
}

function choosePause() {
  const item = pauseMenu.items[pauseMenu.index];
  if (!item || item.disabled) return;
  if (item.action === 'resume') { game.state = 'play'; announce('Playing.'); }
  else if (item.action === 'save') { game.save.checkpoint(); game.toast = 1.6; }
  else if (item.action === 'load') {
    if (game.save.restore()) { game.state = 'play'; renderer.snapCamera(game); announce('Loaded.'); }
  } else if (item.action === 'controls') { game.state = 'controls'; }
  else if (item.action === 'quit') { quitToTitle(); }
}

function handleMenu(menu, choose) {
  if (input.hit('ArrowUp') || input.hit('KeyW')) moveMenu(menu, -1);
  if (input.hit('ArrowDown') || input.hit('KeyS')) moveMenu(menu, 1);
  const hover = menuAt(menu, input.mouse.x, input.mouse.y);
  if (hover >= 0) menu.index = hover;
  if (input.hit('Enter') || input.hit('Space') || input.mouse.clicked) {
    if (hover >= 0 && input.mouse.clicked) menu.index = hover;
    choose();
  }
}

function handleActions() {
  if (input.hit('KeyM')) {
    const m = audio.toggleMute();
    titleMenu.items[3].label = m ? 'SOUND: OFF' : 'SOUND: ON';
    game.notify(m ? 'Sound off' : 'Sound on', '#f2ead6');
  }

  if (game.state === 'title') {
    titleMenu.items[1].disabled = !game.save.has();
    handleMenu(titleMenu, chooseTitle);
  } else if (game.state === 'controls') {
    if (input.hit('Escape') || input.hit('Enter') || input.hit('Space') || input.mouse.clicked) {
      game.state = game.player && game.time > 0 ? 'pause' : 'title';
    }
  } else if (game.state === 'play') {
    if (input.hit('Escape') || input.hit('KeyP')) {
      game.state = 'pause';
      pauseMenu.index = 0;
      announce('Paused.');
    } else if (input.hit('KeyE')) {
      if (game.player.inCar) exitCar(game);
      else enterCar(game, carUnderPlayer(game));
    } else if (input.hit('KeyQ')) {
      cycleWeapon(game, 1);
    } else if (input.hit('KeyF')) {
      game.save.checkpoint();
      game.toast = 1.6;
    }
    if (input.mouse.wheel) cycleWeapon(game, input.mouse.wheel > 0 ? 1 : -1);
  } else if (game.state === 'pause') {
    pauseMenu.items[2].disabled = !game.save.has();
    if (input.hit('Escape')) { game.state = 'play'; announce('Playing.'); }
    else handleMenu(pauseMenu, choosePause);
  } else if (game.state === 'dead') {
    if (game.deathTime > 2.6) {
      game.respawn();
      renderer.snapCamera(game);
      announce('You woke up at the clinic.');
    }
  }
}

const idleInput = {
  isDown: () => false,
  hit: () => false,
  move: () => ({ x: 0, y: 0, len: 0 }),
  run: () => false,
  handbrake: () => false,
  fire: () => false,
  firePressed: () => false,
  endFrame: () => {},
  mouse: { x: 0, y: 0 },
};

/** Cursor to world units, through the camera's own transform. */
function aimPoint() {
  const W = canvas.width, H = canvas.height;
  const z = renderer.camera.zoom;
  return {
    x: renderer.camera.x + (input.mouse.x - W / 2) / z,
    y: renderer.camera.y + (input.mouse.y - H / 2) / z,
  };
}

function frame(now) {
  if (!frame.last) frame.last = now;
  const dt = Math.min((now - frame.last) / 1000, MAX_FRAME);
  frame.last = now;
  game.mouse.x = input.mouse.x;
  game.mouse.y = input.mouse.y;

  handleActions();

  if (game.state === 'play' || game.state === 'dead') {
    frame.acc = (frame.acc || 0) + dt;
    let steps = 0;
    const aim = aimPoint();
    while (frame.acc >= 1 / 60 && steps < 6) {
      game.tick(game.state === 'play' ? input : idleInput, aim);
      frame.acc -= 1 / 60;
      steps += 1;
    }
    if (game.state === 'pause') frame.acc = 0;
  } else {
    frame.acc = 0;
  }

  renderer.updateCamera(game, dt);

  // Sound follows the state: engine while driving, siren by proximity.
  const p = game.player;
  if (p.inCar && game.state === 'play') {
    audio.engineOn(true);
    const car = p.inCar;
    audio.engineState(car.speed, car.dead ? 0.2 : 1);
  } else {
    audio.engineOn(false);
  }
  let nearest = Infinity;
  for (const v of game.vehicles) {
    if (v.driver !== 'police') continue;
    nearest = Math.min(nearest, Math.hypot(v.x - p.x, v.y - p.y));
  }
  audio.sirenState(game.wanted.stars > 0 && nearest < 900 ? 1 - nearest / 900 : 0);
  audio.updateMusic();

  renderer.draw(game, game.time);
  input.endFrame();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => renderer.resize());
window.addEventListener('pointerdown', () => audio.resume(), { once: true });
window.addEventListener('keydown', () => audio.resume(), { once: true });
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.state === 'play') {
    game.state = 'pause';
    announce('Paused.');
  }
});

game.audio = audio;
window.__game = game;
window.__velamar = { game, renderer, audio, input };

/** Run the real simulation forward without waiting on frames (used by headless play-tests). */
window.__velamar.advance = (seconds, aimAt) => {
  const steps = Math.max(1, Math.round(seconds * 60));
  const aim = aimAt ? { x: aimAt[0], y: aimAt[1] } : { x: game.player.x + 120, y: game.player.y };
  for (let k = 0; k < steps; k += 1) {
    game.tick(game.state === 'play' ? input : idleInput, aim);
    if (game.state === 'dead' && game.deathTime > 2.6) game.respawn();
  }
  return { time: game.time, state: game.state };
};

if (shot) {
  const ok = stageShot(game, renderer, shot);
  if (!ok) window.__shotError = shot;
} else {
  announce('VELAMAR. Press enter to start a new game.');
  requestAnimationFrame(frame);
}
