// The radar: a north-up circle of the blocks and roads around the player, with the job marker,
// the police and the player's own arrow on it. It is the one part of the HUD that tells you
// where to go, so it is drawn plainly: pale streets, dark blocks, three colours of blip.
import { BLOCK, GRID_X, GRID_Y, PITCH, ROAD, roadX, roadY, WORLD_H, WORLD_W } from './config.js';

const SCALE = 0.078;

export function drawMinimap(ctx, game, cx, cy, radius) {
  const p = game.player;
  const scale = SCALE;

  ctx.save();
  // The disc, and a thin rim that reads at a glance.
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#5b5b64';
  ctx.fill();
  ctx.save();
  ctx.clip();

  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-p.x, -p.y);

  // Sea and sand.
  ctx.fillStyle = '#2c7c8c';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = '#e0c894';
  ctx.fillRect(game.world.beachX, 0, game.world.seaX - game.world.beachX, WORLD_H);

  // Blocks: pale slabs with a darker building footprint inside them.
  ctx.fillStyle = '#6f6f78';
  ctx.fillRect(0, 0, game.world.beachX, WORLD_H);
  for (let j = 0; j < GRID_Y; j += 1) {
    for (let i = 0; i < GRID_X; i += 1) {
      const b = game.world.block(i, j);
      ctx.fillStyle = '#cfd2bb';
      ctx.fillRect(roadX(i) + ROAD / 2, roadY(j) + ROAD / 2, BLOCK, BLOCK);
      ctx.fillStyle = b.kind === 'park' ? '#8aa46b' : b.kind === 'plaza' ? '#ddd0ae' : '#a9ab97';
      ctx.fillRect(b.x + 17, b.y + 17, BLOCK - 34, BLOCK - 34);
      if (b.kind === 'city') {
        ctx.fillStyle = 'rgba(52,66,64,0.62)';
        for (const bl of b.buildings) ctx.fillRect(bl.x, bl.y, bl.w, bl.h);
      }
    }
  }

  // Pickups and the job, small but coloured.
  for (const it of game.economy.pickups) {
    if (it.taken) continue;
    if (Math.abs(it.x - p.x) > 1400 || Math.abs(it.y - p.y) > 1400) continue;
    ctx.fillStyle = it.kind === 'cash' ? '#9fd8a8' : it.kind === 'health' ? '#e88a8a' : '#9fc8f0';
    ctx.fillRect(it.x - 9, it.y - 9, 18, 18);
  }

  const marker = game.missions.marker();
  if (marker) {
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 3);
    ctx.fillStyle = 'rgba(242,210,76,0.35)';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 40 + pulse * 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2d24c';
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y - 30);
    ctx.lineTo(marker.x + 26, marker.y);
    ctx.lineTo(marker.x, marker.y + 30);
    ctx.lineTo(marker.x - 26, marker.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a2f18';
    ctx.beginPath();
    ctx.arc(marker.x, marker.y, 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // Police, in flashing blue-white so a chase reads on the radar.
  for (const v of game.vehicles) {
    if (v.driver !== 'police') continue;
    ctx.fillStyle = Math.sin(game.time * 12) > 0 ? '#5aa0ff' : '#ff5a5a';
    ctx.fillRect(v.x - 12, v.y - 12, 24, 24);
  }
  for (const c of game.cops) {
    if (c.dead) continue;
    ctx.fillStyle = '#5aa0ff';
    ctx.fillRect(c.x - 9, c.y - 9, 18, 18);
  }

  ctx.restore();

  // The player: an arrow that shows the nose of the car or the man.
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(p.angle + Math.PI / 2);
  ctx.fillStyle = '#f4efe0';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(6, 7);
  ctx.lineTo(0, 3.5);
  ctx.lineTo(-6, 7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Rim, compass, and the district the player is in.
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(18,14,20,0.8)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(240,232,208,0.5)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(240,232,208,0.85)';
  ctx.font = '700 10px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - radius + 9);
  ctx.restore();
}

/** The name of the quarter under the player, for the strip beneath the radar. */
export function districtName(world, x, y) {
  const d = world.districtAt(x, y);
  return { norte: 'NORTE', centro: 'CENTRO', viejo: 'VIEJO', marina: 'MARINA' }[d] || 'VELAMAR';
}
