// The HUD: health and armour, the purse, the wanted stars, the weapon in hand, the job's
// objective and its clock, the notifications sliding in at the top and the radar in the corner.
// Drawn in screen space over the world, scaled from a 1280x720 design so it holds at any size.
import { WANTED, WEAPONS } from './config.js';
import { clamp, money } from './util.js';
import { drawMinimap, districtName } from './minimap.js';

const FONT = 'ui-monospace, Menlo, Consolas, monospace';

function plate(ctx, x, y, w, h, alpha = 0.62) {
  ctx.fillStyle = `rgba(16,12,20,${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
}

/** A five-pointed star, the shape the wanted level has used since the year dot. */
function star(ctx, x, y, r, filled) {
  ctx.beginPath();
  for (let k = 0; k < 10; k += 1) {
    const rad = k % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (k * Math.PI) / 5;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  if (filled) {
    ctx.fillStyle = '#f2d24c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,40,10,0.8)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(232,222,200,0.32)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

export function drawHud(ctx, game, W, H, time) {
  const u = clamp(Math.min(W / 1280, H / 720), 0.62, 1.8);
  const p = game.player;
  ctx.save();
  ctx.textBaseline = 'middle';

  // --- health and armour, top left ---
  const hx = 20 * u, hy = 18 * u;
  const barW = 168 * u;
  plate(ctx, hx - 8 * u, hy - 8 * u, barW + 74 * u, 62 * u, 0.55);
  ctx.fillStyle = 'rgba(242,234,214,0.75)';
  ctx.font = `700 ${9 * u}px ${FONT}`;
  ctx.fillText('HEALTH', hx, hy + 4 * u);
  ctx.fillStyle = 'rgba(30,20,26,0.9)';
  ctx.fillRect(hx, hy + 12 * u, barW, 9 * u);
  const hp = clamp(p.health / 100, 0, 1);
  const grad = ctx.createLinearGradient(hx, 0, hx + barW, 0);
  grad.addColorStop(0, hp > 0.35 ? '#7fd08a' : '#e0674f');
  grad.addColorStop(1, hp > 0.35 ? '#c8e08a' : '#f2a06a');
  ctx.fillStyle = grad;
  ctx.fillRect(hx, hy + 12 * u, barW * hp, 9 * u);
  ctx.strokeStyle = 'rgba(242,234,214,0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(hx + 0.5, hy + 12.5 * u, barW - 1, 9 * u - 1);
  // Armour sits under health, only when there is any.
  ctx.fillStyle = 'rgba(30,20,26,0.9)';
  ctx.fillRect(hx, hy + 27 * u, barW, 6 * u);
  if (p.armor > 0) {
    ctx.fillStyle = '#6fa8dc';
    ctx.fillRect(hx, hy + 27 * u, barW * clamp(p.armor / 100, 0, 1), 6 * u);
  }
  ctx.fillStyle = 'rgba(242,234,214,0.5)';
  ctx.font = `700 ${8 * u}px ${FONT}`;
  ctx.fillText('ARMOUR', hx, hy + 40 * u);
  ctx.fillStyle = 'rgba(242,234,214,0.9)';
  ctx.font = `700 ${12 * u}px ${FONT}`;
  ctx.fillText(`${Math.round(p.health)}`, hx + barW + 8 * u, hy + 17 * u);
  if (p.inCar) {
    ctx.fillStyle = 'rgba(242,220,160,0.75)';
    ctx.font = `700 ${8 * u}px ${FONT}`;
    ctx.fillText('IN CAR', hx, hy + 52 * u);
  }

  // --- purse and wanted level, top right ---
  ctx.textAlign = 'right';
  plate(ctx, W - 240 * u, 20 * u, 222 * u, 30 * u, 0.42);
  ctx.font = `700 ${30 * u}px ${FONT}`;
  ctx.fillStyle = 'rgba(12,10,16,0.55)';
  ctx.fillText(money(game.economy.shown), W - 22 * u + 2, 40 * u + 2);
  ctx.fillStyle = '#bfe8a0';
  ctx.fillText(money(game.economy.shown), W - 22 * u, 40 * u);
  const stars = game.wanted.stars;
  plate(ctx, W - 22 * u - 5 * 30 * u, 56 * u, 5 * 30 * u + 8 * u, 30 * u, 0.5);
  for (let k = 0; k < WANTED.maxStars; k += 1) {
    const sx = W - 36 * u - k * 30 * u;
    const on = WANTED.maxStars - k <= stars;
    if (on) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ffd24c';
      ctx.beginPath();
      ctx.arc(sx, 71 * u, 15 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    star(ctx, sx, 71 * u, 12.5 * u, on);
  }
  if (game.wanted.heat > 0.01) {
    // The heat meter: how close the next star is, and how close the level is to falling.
    ctx.fillStyle = 'rgba(30,20,26,0.65)';
    ctx.fillRect(W - 150 * u, 84 * u, 128 * u, 4 * u);
    ctx.fillStyle = '#e8994a';
    ctx.fillRect(W - 150 * u, 84 * u, 128 * u * clamp(game.wanted.heat / WANTED.maxStars, 0, 1), 4 * u);
  }
  ctx.textAlign = 'left';

  // --- bottom right: one panel, the car when driving and the gun either way ---
  const wx = W - 208 * u, wy = H - 100 * u;
  const w = WEAPONS[p.weapon] || WEAPONS.fists;
  plate(ctx, wx, wy, 190 * u, 74 * u, 0.6);
  if (p.inCar) {
    const car = p.inCar;
    ctx.fillStyle = 'rgba(242,234,214,0.6)';
    ctx.font = `700 ${9 * u}px ${FONT}`;
    ctx.fillText(game.vehicleName(car).toUpperCase(), wx + 12 * u, wy + 15 * u);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f2ead6';
    ctx.font = `700 ${24 * u}px ${FONT}`;
    ctx.fillText(String(Math.round(Math.abs(car.speed) * 0.62)), wx + 148 * u, wy + 27 * u);
    ctx.fillStyle = 'rgba(242,234,214,0.5)';
    ctx.font = `700 ${8 * u}px ${FONT}`;
    ctx.fillText('KM/H', wx + 168 * u, wy + 29 * u);
    ctx.textAlign = 'left';
    for (let k = 0; k < 4; k += 1) {
      const on = car.hp > (car.maxHp / 4) * k;
      ctx.fillStyle = on ? '#9fd8a8' : 'rgba(200,90,80,0.35)';
      ctx.fillRect(wx + 12 * u + k * 14 * u, wy + 38 * u, 10 * u, 3 * u);
    }
    ctx.fillStyle = 'rgba(242,234,214,0.75)';
    ctx.font = `700 ${10 * u}px ${FONT}`;
    ctx.fillText(w.name.toUpperCase(), wx + 78 * u, wy + 48 * u);
    ctx.textAlign = 'right';
    if (!w.melee) {
      const ammo = p.ammo[p.weapon] ?? 0;
      ctx.fillStyle = ammo > 0 ? '#f2d98a' : '#e08a7a';
      ctx.font = `700 ${13 * u}px ${FONT}`;
      ctx.fillText(String(ammo), wx + 178 * u, wy + 48 * u);
    }
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = 'rgba(242,234,214,0.6)';
    ctx.font = `700 ${9 * u}px ${FONT}`;
    ctx.fillText('WEAPON', wx + 12 * u, wy + 17 * u);
    ctx.fillStyle = '#f2ead6';
    ctx.font = `700 ${17 * u}px ${FONT}`;
    ctx.fillText(w.name.toUpperCase(), wx + 12 * u, wy + 37 * u);
    ctx.textAlign = 'right';
    if (!w.melee) {
      const ammo = p.ammo[p.weapon] ?? 0;
      ctx.fillStyle = ammo > 0 ? '#f2d98a' : '#e08a7a';
      ctx.font = `700 ${22 * u}px ${FONT}`;
      ctx.fillText(String(ammo), wx + 178 * u, wy + 38 * u);
    } else {
      ctx.fillStyle = 'rgba(242,234,214,0.5)';
      ctx.font = `700 ${13 * u}px ${FONT}`;
      ctx.fillText('—', wx + 178 * u, wy + 38 * u);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(242,234,214,0.4)';
    ctx.font = `600 ${8.5 * u}px ${FONT}`;
    ctx.fillText('Q or wheel changes weapon', wx + 12 * u, wy + 60 * u);
  }

  // --- the job: objective and clock, bottom centre ---
  const objective = game.missions.objective();
  const marker = game.missions.marker();
  if (objective) {
    const tw = Math.min(W - 460 * u, 520 * u);
    const ox = W / 2 - tw / 2, oy = H - 78 * u;
    plate(ctx, ox, oy, tw, 58 * u, 0.6);
    ctx.fillStyle = '#f2d24c';
    ctx.fillRect(ox, oy, 4 * u, 58 * u);
    const active = game.missions.active;
    ctx.fillStyle = 'rgba(242,210,76,0.9)';
    ctx.font = `700 ${10 * u}px ${FONT}`;
    ctx.fillText(active ? `${active.def.title.toUpperCase()} — ${active.def.client.toUpperCase()}` : 'AVAILABLE JOB', ox + 14 * u, oy + 16 * u);
    ctx.fillStyle = '#f2ead6';
    ctx.font = `700 ${14 * u}px ${FONT}`;
    const t = objective.length > 62 ? objective.slice(0, 60) + '…' : objective;
    ctx.fillText(t, ox + 14 * u, oy + 36 * u);
    if (marker && marker.x !== undefined) {
      const d = Math.round(Math.hypot(marker.x - p.x, marker.y - p.y));
      ctx.fillStyle = 'rgba(242,234,214,0.55)';
      ctx.font = `700 ${10 * u}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${d} m`, ox + tw - 14 * u, oy + 36 * u);
      ctx.textAlign = 'left';
    }
    const clock = game.missions.timerLeft();
    if (clock !== null) {
      const label = clock >= 60 ? `${Math.floor(clock / 60)}:${String(Math.ceil(clock % 60)).padStart(2, '0')}` : String(Math.ceil(clock));
      ctx.fillStyle = 'rgba(16,12,20,0.75)';
      ctx.fillRect(ox + tw - 62 * u, oy + 8 * u, 48 * u, 18 * u);
      ctx.fillStyle = clock < 15 ? '#f2706a' : '#f2d24c';
      ctx.font = `700 ${11 * u}px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(label, ox + tw - 20 * u, oy + 17.5 * u);
      ctx.textAlign = 'left';
    }
  }


  // --- notifications, sliding out under the health plate ---
  let ny = hy + 74 * u;
  let shown = 0;
  for (const n of game.notifications) {
    if (shown >= 3) break;
    shown += 1;
    const a = clamp(Math.min(n.t * 6, (n.life - n.t) * 2), 0, 1);
    ctx.globalAlpha = a;
    ctx.font = `700 ${10.5 * u}px ${FONT}`;
    const wdt = ctx.measureText(n.text).width + 20 * u;
    ctx.fillStyle = 'rgba(16,12,20,0.66)';
    ctx.beginPath();
    ctx.roundRect(hx - 8 * u, ny - 10 * u, wdt, 20 * u, 3);
    ctx.fill();
    ctx.fillStyle = n.color;
    ctx.fillText(n.text, hx - 1 * u, ny + 1);
    ny += 24 * u;
  }
  ctx.globalAlpha = 1;

  // --- radar, bottom left, with the district under it ---
  const r = 84 * u;
  drawMinimap(ctx, game, 24 * u + r, H - 24 * u - r, r);
  const dn = districtName(game.world, p.x, p.y);
  ctx.textAlign = 'center';
  ctx.font = `700 ${10 * u}px ${FONT}`;
  ctx.fillStyle = 'rgba(12,10,16,0.5)';
  ctx.fillRect(24 * u + r - 42 * u, H - 24 * u - 16 * u, 84 * u, 16 * u);
  ctx.fillStyle = 'rgba(242,234,214,0.8)';
  ctx.fillText(dn, 24 * u + r, H - 24 * u - 8 * u);
  ctx.textAlign = 'left';

  // --- mission flash: complete or failed, dead centre ---
  const flash = game.missions.flash;
  if (flash) {
    const k = clamp(flash.timer, 0, 1);
    ctx.globalAlpha = Math.min(1, k * 2.4);
    ctx.textAlign = 'center';
    ctx.font = `700 ${40 * u}px ${FONT}`;
    ctx.fillStyle = 'rgba(12,10,16,0.7)';
    ctx.fillText(flash.text, W / 2 + 2, H * 0.34 + 2);
    ctx.fillStyle = flash.good ? '#9fd8a8' : '#e08a7a';
    ctx.fillText(flash.text, W / 2, H * 0.34);
    ctx.font = `700 ${14 * u}px ${FONT}`;
    ctx.fillStyle = 'rgba(242,234,214,0.85)';
    ctx.fillText(flash.sub, W / 2, H * 0.34 + 30 * u);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // --- crosshair: where the mouse is, only while the game is playing ---
  const m = game.mouse;
  if (m && game.state === 'play') {
    ctx.strokeStyle = 'rgba(242,234,214,0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(m.x, m.y, p.inCar ? 8 : 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(m.x - 3, m.y);
    ctx.lineTo(m.x + 3, m.y);
    ctx.moveTo(m.x, m.y - 3);
    ctx.lineTo(m.x, m.y + 3);
    ctx.stroke();
  }
  ctx.restore();
}
