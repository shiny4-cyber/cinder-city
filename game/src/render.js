// The frame: a camera that leans into speed, one pass over the world in painter's order
// (ground, then everything standing on it sorted by its feet), then the effects, the HUD and
// the screens on top. The simulation never calls into this file; it only reads the state.
import { BLOCK, PITCH, ROAD, SIDEWALK, roadX, roadY } from './config.js';
import { clamp, damp } from './util.js';
import { drawBlockGround, drawBuilding, drawCar, drawCoast, drawPed, drawPlayer, drawProp, drawStreets, shadowBlob } from './art.js';
import { drawBullets } from './combat.js';
import { drawPickup } from './economy.js';
import { drawHud } from './hud.js';
import { drawControls, drawDeath, drawPause, drawTitle } from './screens.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const camera = { x: 0, y: 0, zoom: 1, lookX: 0, lookY: 0, shakeX: 0, shakeY: 0 };
  let grade = null;
  let gradeKey = '';

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, canvas.clientWidth || window.innerWidth);
    const h = Math.max(240, canvas.clientHeight || window.innerHeight);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.imageSmoothingEnabled = true;
    return { w: canvas.width, h: canvas.height, dpr };
  }

  /** Follow the player (or the car), zoom out a little with speed, and lean into the turn. */
  function updateCamera(game, dt) {
    const p = game.player;
    const target = p.inCar || p;
    const vx = p.inCar ? p.inCar.vx : p.vx;
    const vy = p.inCar ? p.inCar.vy : p.vy;
    const speed = Math.hypot(vx, vy);
    camera.lookX = damp(camera.lookX, vx * 0.34, 3.2, dt);
    camera.lookY = damp(camera.lookY, vy * 0.34, 3.2, dt);
    camera.x = damp(camera.x, target.x + camera.lookX, 7.5, dt);
    camera.y = damp(camera.y, target.y + camera.lookY, 7.5, dt);
    const wantZoom = p.inCar ? clamp(0.94 - speed / 2600, 0.72, 0.94) : 1.0;
    camera.zoom = damp(camera.zoom, wantZoom, 2.4, dt);
    const sh = game.effects.shake;
    camera.shakeX = (Math.random() - 0.5) * sh;
    camera.shakeY = (Math.random() - 0.5) * sh;
    const marginX = canvas.width / 2 / camera.zoom;
    camera.x = clamp(camera.x, -200 + marginX * 0.2, game.world.bounds.w - marginX * 0.2);
  }

  function snapCamera(game) {
    const p = game.player;
    const target = p.inCar || p;
    camera.x = target.x;
    camera.y = target.y;
    camera.lookX = 0;
    camera.lookY = 0;
    camera.zoom = p.inCar ? 0.82 : 1;
  }

  /** The job marker: a ring that breathes, a chevron, and a name plate above it. */
  function drawMarker(marker, time) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 3);
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.strokeStyle = `rgba(242,210,76,${0.45 + pulse * 0.4})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(242,210,76,0.14)';
    ctx.beginPath();
    ctx.arc(0, 0, 26 + pulse * 6, 0, Math.PI * 2);
    ctx.fill();
    if (marker.radius > 40) {
      ctx.strokeStyle = 'rgba(242,210,76,0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, marker.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    // The chevron bobs above the marker.
    const bob = Math.sin(time * 2.6) * 4;
    ctx.fillStyle = '#f2d24c';
    ctx.beginPath();
    ctx.moveTo(0, -46 + bob);
    ctx.lineTo(11, -62 + bob);
    ctx.lineTo(-11, -62 + bob);
    ctx.closePath();
    ctx.fill();
    if (marker.label) {
      ctx.font = '700 10px ui-monospace, Menlo, Consolas, monospace';
      const w = ctx.measureText(marker.label).width + 14;
      ctx.fillStyle = 'rgba(18,14,22,0.72)';
      ctx.fillRect(-w / 2, -84 + bob, w, 15);
      ctx.fillStyle = '#f2d24c';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(marker.label, 0, -76 + bob);
      ctx.textAlign = 'left';
    }
    ctx.restore();
  }

  function drawWorld(game, time) {
    const W = canvas.width, H = canvas.height;
    const zoom = camera.zoom;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2b8fa0';
    ctx.fillRect(0, 0, W, H);

    const cx = camera.x + camera.shakeX;
    const cy = camera.y + camera.shakeY;
    ctx.setTransform(zoom, 0, 0, zoom, W / 2 - cx * zoom, H / 2 - cy * zoom);
    const view = { x: cx - W / 2 / zoom, y: cy - H / 2 / zoom, w: W / zoom, h: H / zoom };

    drawStreets(ctx, view);
    drawCoast(ctx, game.world, view, time);

    const i0 = clamp(Math.floor(view.x / PITCH) - 1, 0, 7);
    const i1 = clamp(Math.floor((view.x + view.w) / PITCH) + 1, 0, 7);
    const j0 = clamp(Math.floor(view.y / PITCH) - 1, 0, 7);
    const j1 = clamp(Math.floor((view.y + view.h) / PITCH) + 1, 0, 7);
    const blocks = [];
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const b = game.world.block(i, j);
        blocks.push(b);
        drawBlockGround(ctx, b);
      }
    }
    game.effects.drawGround(ctx);

    // Everything that stands up, sorted by where it meets the ground.
    const items = [];
    for (const b of blocks) {
      for (const bl of b.buildings) {
        if (bl.x > view.x + view.w || bl.y > view.y + view.h || bl.x + bl.w < view.x || bl.y + bl.h < view.y) continue;
        items.push({ y: bl.y + bl.h, kind: 'building', o: bl });
      }
      for (const prop of b.props) {
        if (prop.x < view.x - 60 || prop.x > view.x + view.w + 60 || prop.y < view.y - 60 || prop.y > view.y + view.h + 60) continue;
        items.push({ y: prop.y, kind: 'prop', o: prop });
      }
      for (const t of b.trees) {
        if (t.x < view.x - 60 || t.x > view.x + view.w + 60 || t.y < view.y - 60 || t.y > view.y + view.h + 60) continue;
        items.push({ y: t.y, kind: 'tree', o: t });
      }
    }
    for (const c of game.world.coast.props) {
      if (c.x < view.x - 80 || c.x > view.x + view.w + 80 || c.y < view.y - 80 || c.y > view.y + view.h + 80) continue;
      items.push({ y: c.y, kind: 'prop', o: c });
    }
    for (const v of game.vehicles) {
      if (v.x < view.x - 90 || v.x > view.x + view.w + 90 || v.y < view.y - 90 || v.y > view.y + view.h + 90) continue;
      items.push({ y: v.y + 14, kind: 'car', o: v });
    }
    for (const ped of game.peds) {
      if (ped.x < view.x - 40 || ped.x > view.x + view.w + 40 || ped.y < view.y - 40 || ped.y > view.y + view.h + 40) continue;
      items.push({ y: ped.y, kind: 'ped', o: ped });
    }
    for (const cop of game.cops) {
      if (cop.dead) continue;
      items.push({ y: cop.y, kind: 'ped', o: cop });
    }
    for (const it of game.economy.pickups) {
      if (it.taken) continue;
      if (it.x < view.x - 30 || it.x > view.x + view.w + 30 || it.y < view.y - 30 || it.y > view.y + view.h + 30) continue;
      items.push({ y: it.y, kind: 'pickup', o: it });
    }
    if (!game.player.inCar) items.push({ y: game.player.y, kind: 'player', o: game.player });

    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      switch (it.kind) {
        case 'building': drawBuilding(ctx, it.o); break;
        case 'prop': drawProp(ctx, it.o, time); break;
        case 'tree': {
          if (it.o.kind === 'palm') drawProp(ctx, { type: 'palm', x: it.o.x, y: it.o.y, r: it.o.r, angle: it.o.angle }, time);
          else drawProp(ctx, { type: 'leaf', x: it.o.x, y: it.o.y, r: it.o.r }, time);
          break;
        }
        case 'car': drawCar(ctx, it.o, time); break;
        case 'ped': {
          if (it.o.dead) {
            ctx.globalAlpha = it.o.fade ?? 1;
            shadowBlob(ctx, it.o.x, it.o.y, 9, 5, 0.22, 3, 2);
            ctx.fillStyle = it.o.shirt;
            ctx.save();
            ctx.translate(it.o.x, it.o.y);
            ctx.rotate(it.o.deadAngle || 0);
            ctx.fillRect(-9, -4, 18, 8);
            ctx.fillStyle = it.o.skin;
            ctx.beginPath();
            ctx.arc(7, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            ctx.globalAlpha = 1;
          } else {
            drawPed(ctx, it.o, time);
          }
          break;
        }
        case 'pickup': drawPickup(ctx, it.o, time); break;
        case 'player': drawPlayer(ctx, it.o, time); break;
        default: break;
      }
    }

    const marker = game.missions.marker();
    if (marker) drawMarker(marker, time);

    drawBullets(ctx, game);
    game.effects.drawAir(ctx);

    // Aim line: a thin dotted ray from the player's gun to the cursor, so aim is legible.
    if (!game.player.inCar && game.state === 'play' && game.player.weapon !== 'fists') {
      const p = game.player;
      ctx.save();
      ctx.strokeStyle = 'rgba(242,234,214,0.18)';
      ctx.setLineDash([4, 8]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16);
      ctx.lineTo(p.x + Math.cos(p.angle) * 190, p.y + Math.sin(p.angle) * 190);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** The last pass: warm light, a vignette, and the HUD and screens over everything. */
  function drawGrade(game, W, H) {
    const key = `${W}x${H}`;
    if (gradeKey !== key) {
      const g = ctx.createRadialGradient(W * 0.42, H * 0.3, H * 0.1, W * 0.5, H * 0.5, H * 0.95);
      g.addColorStop(0, 'rgba(255,196,120,0.10)');
      g.addColorStop(0.55, 'rgba(255,160,90,0.02)');
      g.addColorStop(1, 'rgba(24,12,30,0.42)');
      grade = g;
      gradeKey = key;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(255,176,96,0.16)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    ctx.fillStyle = grade;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,186,110,0.045)';
    ctx.fillRect(0, 0, W, H);
  }

  function draw(game, time) {
    const W = canvas.width, H = canvas.height;
    drawWorld(game, time);
    drawGrade(game, W, H);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (game.state === 'play' || game.state === 'pause' || game.state === 'dead') {
      drawHud(ctx, game, W, H, time);
    }
    if (game.state === 'title') drawTitle(ctx, W, H, time, game.menus.title, game.save.has(), game.audio.muted);
    else if (game.state === 'controls') drawControls(ctx, W, H, time);
    else if (game.state === 'pause') drawPause(ctx, W, H, game.menus.pause, time);
    if (game.state === 'dead') drawDeath(ctx, W, H, game.deathTime, 'WASTED', 'The clinic stitched you up. It cost $100.');
    if (game.state === 'busted') drawDeath(ctx, W, H, game.deathTime, 'BUSTED', 'The precinct let you go at dawn. It cost $150.');
  }

  return { ctx, camera, resize, updateCamera, snapCamera, draw, drawWorld };
}
