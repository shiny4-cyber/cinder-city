// The screens around the game: the title, the pause menu, the controls sheet and the death
// card. The title is painted, not a picture: a sunset over the bay, two ranks of skyline, palms
// in silhouette, and the name of the city in the middle of it.
import { clamp } from './util.js';

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

/** A menu is a list of items with hit boxes filled in as it is drawn. */
export function createMenu(items) {
  return { items, index: 0, rects: [] };
}

export function moveMenu(menu, dir) {
  if (!menu.items.length) return;
  menu.index = (menu.index + dir + menu.items.length) % menu.items.length;
}

export function menuAt(menu, x, y) {
  for (let i = 0; i < menu.rects.length; i += 1) {
    const r = menu.rects[i];
    if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}

// --- the title -------------------------------------------------------------------
let skyCache = null;
let skyKey = '';

function titleSky(ctx, W, H, time) {
  const key = `${W}x${H}`;
  if (skyKey !== key) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.78);
    g.addColorStop(0, '#20303f');
    g.addColorStop(0.34, '#3c4a58');
    g.addColorStop(0.58, '#8a6a63');
    g.addColorStop(0.76, '#d98a5e');
    g.addColorStop(1, '#f0b271');
    skyCache = g;
    skyKey = key;
  }
  ctx.fillStyle = skyCache;
  ctx.fillRect(0, 0, W, H);

  const horizon = H * 0.66;
  // The sun, low and enormous, with two haloes.
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffd08a';
  ctx.beginPath();
  ctx.arc(W * 0.68, horizon - H * 0.05, H * 0.24, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(W * 0.68, horizon - H * 0.05, H * 0.13, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffe0a8';
  ctx.beginPath();
  ctx.arc(W * 0.68, horizon - H * 0.05, H * 0.072, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Sea: a warm band with the sun's reflection broken into shards.
  ctx.fillStyle = '#25424c';
  ctx.fillRect(0, horizon, W, H - horizon);
  ctx.fillStyle = '#2e5058';
  ctx.fillRect(0, horizon, W, H * 0.08);
  for (let k = 0; k < 26; k += 1) {
    const y = horizon + 6 + k * (H * 0.012);
    const wob = Math.sin(time * 0.8 + k * 0.7) * 10;
    const w = 30 + (k % 5) * 22;
    ctx.fillStyle = `rgba(255,206,140,${0.3 - k * 0.009})`;
    ctx.fillRect(W * 0.68 - w / 2 + wob, y, w, 2);
  }

  // Far skyline, then near: two ranks so the bay has depth.
  const far = [0.12, 0.2, 0.34, 0.5, 0.42, 0.62, 0.8, 0.7, 0.55, 0.36, 0.24];
  for (let i = 0; i < far.length; i += 1) {
    const w = W / far.length;
    const h = H * 0.1 * far[i] * 2.2 + H * 0.02;
    ctx.fillStyle = 'rgba(44,54,66,0.75)';
    ctx.fillRect(i * w, horizon - h, w * 0.92, h);
  }
  const near = [0.18, 0.3, 0.24, 0.46, 0.3, 0.55, 0.26, 0.36];
  for (let i = 0; i < near.length; i += 1) {
    const w = W / near.length;
    const h = H * 0.16 * near[i] * 2.4 + H * 0.035;
    const x = i * w + w * 0.08;
    ctx.fillStyle = '#1b2730';
    ctx.fillRect(x, horizon - h, w * 0.8, h);
    // Lit windows.
    ctx.fillStyle = 'rgba(255,206,140,0.55)';
    for (let wy = horizon - h + 8; wy < horizon - 6; wy += 12) {
      for (let wx = x + 6; wx < x + w * 0.8 - 8; wx += 11) {
        if ((wx * 7 + wy * 13) % 29 < 9) ctx.fillRect(wx, wy, 4, 5);
      }
    }
    ctx.fillStyle = 'rgba(255,220,160,0.6)';
    if (i % 3 === 0) ctx.fillRect(x + w * 0.4, horizon - h - 14, 2, 14);
  }
  ctx.fillStyle = 'rgba(214,140,96,0.25)';
  ctx.fillRect(0, horizon - H * 0.02, W, H * 0.02);

  // Palms hanging into the frame from both bottom corners.
  drawPalmSilhouette(ctx, W * 0.06, H + 10, H * 0.5, -0.5);
  drawPalmSilhouette(ctx, W * 0.94, H + 6, H * 0.44, 0.5);
}

function drawPalmSilhouette(ctx, x, y, size, tilt) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = '#101a1f';
  ctx.lineWidth = size * 0.055;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(tilt * size * 0.2, -size * 0.5, tilt * size * 0.42, -size);
  ctx.stroke();
  const tx = tilt * size * 0.42, ty = -size;
  for (let k = 0; k < 8; k += 1) {
    const a = Math.PI + (k / 7) * Math.PI;
    ctx.lineWidth = size * 0.05;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.quadraticCurveTo(tx + Math.cos(a) * size * 0.28, ty + Math.sin(a) * size * 0.2,
      tx + Math.cos(a) * size * 0.5, ty + Math.sin(a) * size * 0.34 + size * 0.1);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawTitle(ctx, W, H, time, menu, hasSave, muted) {
  const u = clamp(Math.min(W / 1280, H / 720), 0.6, 2);
  titleSky(ctx, W, H, time);

  // A vignette to sit the type on.
  const vg = ctx.createRadialGradient(W * 0.5, H * 0.42, H * 0.1, W * 0.5, H * 0.42, H * 0.9);
  vg.addColorStop(0, 'rgba(10,8,14,0)');
  vg.addColorStop(1, 'rgba(10,8,14,0.78)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // The name.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const titleSize = 84 * u;
  ctx.font = `700 ${titleSize}px ${FONT}`;
  ctx.fillStyle = 'rgba(12,10,16,0.55)';
  ctx.fillText('VELAMAR', W / 2 + 5 * u, H * 0.29 + 5 * u);
  const tg = ctx.createLinearGradient(0, H * 0.29 - titleSize / 2, 0, H * 0.29 + titleSize / 2);
  tg.addColorStop(0, '#fdf3dc');
  tg.addColorStop(0.55, '#f2d9a8');
  tg.addColorStop(1, '#e0a870');
  ctx.fillStyle = tg;
  ctx.fillText('VELAMAR', W / 2, H * 0.29);

  ctx.font = `700 ${14 * u}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,236,200,0.82)';
  ctx.fillText('S U N   ·   S E A   ·   D E B T', W / 2, H * 0.29 + 58 * u);
  ctx.fillStyle = 'rgba(255,236,200,0.45)';
  ctx.font = `600 ${10 * u}px ${FONT}`;
  ctx.fillText('CHAPTER ONE  —  A CITY THAT TAKES ITS CUT', W / 2, H * 0.29 + 78 * u);

  // Rules either side of the subtitle.
  ctx.strokeStyle = 'rgba(255,226,180,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 200 * u, H * 0.29 + 58 * u);
  ctx.lineTo(W / 2 - 150 * u, H * 0.29 + 58 * u);
  ctx.moveTo(W / 2 + 150 * u, H * 0.29 + 58 * u);
  ctx.lineTo(W / 2 + 200 * u, H * 0.29 + 58 * u);
  ctx.stroke();

  // The menu.
  menu.rects = [];
  const startY = H * 0.55;
  const itemH = 34 * u;
  const boxW = 280 * u;
  for (let i = 0; i < menu.items.length; i += 1) {
    const item = menu.items[i];
    const dim = item.disabled;
    const y = startY + i * itemH;
    const x = W / 2 - boxW / 2;
    menu.rects[i] = { x, y: y - itemH / 2, w: boxW, h: itemH };
    if (i === menu.index && !dim) {
      ctx.fillStyle = 'rgba(255,226,170,0.12)';
      ctx.fillRect(x, y - itemH / 2, boxW, itemH);
      ctx.fillStyle = '#f2d24c';
      ctx.fillRect(x, y - itemH / 2, 3 * u, itemH);
    }
    ctx.font = `700 ${16 * u}px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = dim ? 'rgba(240,232,208,0.22)' : i === menu.index ? '#fff0c8' : 'rgba(240,232,208,0.72)';
    ctx.fillText(item.label, x + 18 * u, y);
    if (i === menu.index && !dim) {
      ctx.fillStyle = '#f2d24c';
      ctx.textAlign = 'right';
      ctx.fillText('›', x + boxW - 16 * u, y);
      ctx.textAlign = 'left';
    }
  }

  // Footer.
  ctx.textAlign = 'center';
  ctx.font = `600 ${10 * u}px ${FONT}`;
  ctx.fillStyle = 'rgba(255,236,200,0.5)';
  ctx.fillText('↑ ↓  CHOOSE      ENTER  SELECT      M  ' + (muted ? 'SOUND OFF' : 'SOUND ON'), W / 2, H - 26 * u);
  ctx.fillStyle = 'rgba(255,236,200,0.32)';
  ctx.fillText('WASD move  ·  E car  ·  mouse aim  ·  click fire  ·  Shift run  ·  Space handbrake', W / 2, H - 44 * u);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}

// --- pause and other overlays ------------------------------------------------------
export function drawPause(ctx, W, H, menu, time) {
  const u = clamp(Math.min(W / 1280, H / 720), 0.6, 2);
  ctx.fillStyle = 'rgba(10,9,14,0.62)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${12 * u}px ${FONT}`;
  ctx.fillStyle = 'rgba(242,210,76,0.9)';
  ctx.fillText('PAUSED', W / 2 - 140 * u, H * 0.3 - 34 * u);
  ctx.font = `700 ${44 * u}px ${FONT}`;
  ctx.fillStyle = '#f2ead6';
  ctx.fillText('VELAMAR', W / 2 - 140 * u, H * 0.3);

  menu.rects = [];
  const itemH = 34 * u;
  for (let i = 0; i < menu.items.length; i += 1) {
    const item = menu.items[i];
    const y = H * 0.42 + i * itemH;
    const x = W / 2 - 140 * u;
    menu.rects[i] = { x, y: y - itemH / 2, w: 320 * u, h: itemH };
    if (i === menu.index) {
      ctx.fillStyle = 'rgba(255,226,170,0.14)';
      ctx.fillRect(x - 10 * u, y - itemH / 2, 300 * u, itemH);
      ctx.fillStyle = '#f2d24c';
      ctx.fillRect(x - 10 * u, y - itemH / 2, 3 * u, itemH);
    }
    ctx.font = `700 ${15 * u}px ${FONT}`;
    ctx.fillStyle = item.disabled ? 'rgba(240,232,208,0.25)' : i === menu.index ? '#fff0c8' : 'rgba(240,232,208,0.72)';
    ctx.fillText(item.label, x, y);
  }
  ctx.font = `600 ${10 * u}px ${FONT}`;
  ctx.fillStyle = 'rgba(240,232,208,0.42)';
  ctx.fillText('ENTER select  ·  ESC resume', W / 2 - 140 * u, H * 0.42 + menu.items.length * itemH + 20 * u);
  ctx.textBaseline = 'alphabetic';
}

export function drawControls(ctx, W, H, time) {
  const u = clamp(Math.min(W / 1280, H / 720), 0.6, 2);
  ctx.fillStyle = 'rgba(10,9,14,0.94)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${26 * u}px ${FONT}`;
  ctx.fillStyle = '#f2d24c';
  ctx.fillText('HOW TO RUN A CITY', 80 * u, 82 * u);
  ctx.font = `600 ${12 * u}px ${FONT}`;
  ctx.fillStyle = 'rgba(240,232,208,0.65)';
  ctx.fillText('VELAMAR plays with a keyboard and a mouse.', 80 * u, 112 * u);

  const rows = [
    ['W A S D', 'Walk. Hold Shift to run.'],
    ['Mouse', 'Aim. Left click to fire, or punch with fists out.'],
    ['Q / wheel', 'Change weapon: fists, pistol, SMG, shotgun.'],
    ['E', 'Get into the nearest car, or get out of it.'],
    ['Space', 'Handbrake: hold into a corner to drift.'],
    ['ESC / P', 'Pause, save, load, controls.'],
    ['M', 'Sound on or off.'],
  ];
  let y = 160 * u;
  for (const [key, what] of rows) {
    ctx.fillStyle = 'rgba(255,226,170,0.14)';
    ctx.fillRect(80 * u, y - 13 * u, 104 * u, 26 * u);
    ctx.font = `700 ${12 * u}px ${FONT}`;
    ctx.fillStyle = '#f2d24c';
    ctx.fillText(key, 92 * u, y);
    ctx.font = `600 ${12 * u}px ${FONT}`;
    ctx.fillStyle = '#f2ead6';
    ctx.fillText(what, 200 * u, y);
    y += 34 * u;
  }
  ctx.font = `600 ${11 * u}px ${FONT}`;
  ctx.fillStyle = 'rgba(240,232,208,0.55)';
  ctx.fillText('The jobs are marked in gold on the radar. Walk into a gold circle to take one.', 80 * u, y + 20 * u);
  ctx.fillText('Shoot somebody in the street and the police will come; lose them to make it stop.', 80 * u, y + 38 * u);
  ctx.fillStyle = 'rgba(242,210,76,0.9)';
  ctx.fillText('Press any key to go back', 80 * u, H - 46 * u);
  ctx.textBaseline = 'alphabetic';
}

export function drawDeath(ctx, W, H, timer, text, sub) {
  const u = clamp(Math.min(W / 1280, H / 720), 0.6, 2);
  const a = clamp(timer * 0.9, 0, 1);
  ctx.fillStyle = `rgba(70,10,16,${0.42 * a})`;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${64 * u}px ${FONT}`;
  ctx.fillStyle = `rgba(12,8,12,${0.8 * a})`;
  ctx.fillText(text, W / 2 + 4 * u, H * 0.44 + 4 * u);
  ctx.fillStyle = `rgba(214,70,60,${a})`;
  ctx.fillText(text, W / 2, H * 0.44);
  ctx.font = `700 ${13 * u}px ${FONT}`;
  ctx.fillStyle = `rgba(242,234,214,${0.8 * a})`;
  ctx.fillText(sub, W / 2, H * 0.44 + 44 * u);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
}

/** The small "saved" stamp that slides out of the corner. */
export function drawToast(ctx, W, H, text, t) {
  const u = clamp(Math.min(W / 1280, H / 720), 0.6, 2);
  const a = clamp(Math.min(t * 4, (1.6 - t) * 3), 0, 1);
  if (a <= 0) return;
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.font = `700 ${11 * u}px ${FONT}`;
  const w = ctx.measureText(text).width + 28 * u;
  ctx.fillStyle = 'rgba(16,12,20,0.7)';
  ctx.beginPath();
  ctx.roundRect(W / 2 - w / 2, H - 130 * u, w, 24 * u, 4);
  ctx.fill();
  ctx.fillStyle = '#9fd8a8';
  ctx.fillText(text, W / 2, H - 118 * u);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}
