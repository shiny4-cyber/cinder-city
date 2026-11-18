// Everything that draws: the city's ground, its buildings in fake 3D, its street furniture,
// its cars, its people and its weather-worn detail. Pure paint, no simulation: each function
// is handed what to draw and where the camera is, and returns nothing.
import { BLOCK, C, CAR_TYPES, PITCH, ROAD, SIDEWALK, roadX, roadY } from './config.js';
import { clamp } from './util.js';

// --- small canvas helpers --------------------------------------------------------
function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function fillRound(ctx, x, y, w, h, r, color) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
}

/** A soft elliptical shadow: every object in the city casts one, which is most of the depth. */
export function shadowBlob(ctx, x, y, rx, ry, alpha = 0.22, ox = 5, oy = 4) {
  ctx.fillStyle = `rgba(36,24,46,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(x + ox, y + oy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

// --- textures ---------------------------------------------------------------------
// Three small canvases, made once and repeated: grain on the asphalt, speckle in the stone,
// grit in the sand. Flat colour is what makes a top-down city look like a diagram.
let TEX = null;
function textures(ctx) {
  if (TEX) return TEX;
  const make = (size, paint) => {
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    paint(g, size);
    return ctx.createPattern(c, 'repeat');
  };
  const asphalt = make(56, (g, s) => {
    g.fillStyle = '#4b4650'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 340; i += 1) {
      const v = (i * 37) % 11;
      g.fillStyle = v < 4 ? 'rgba(255,246,230,0.05)' : v < 8 ? 'rgba(12,10,16,0.10)' : 'rgba(120,110,120,0.06)';
      g.fillRect((i * 13) % s, (i * 29) % s, 1 + (i % 2), 1 + ((i * 3) % 2));
    }
  });
  const paving = make(64, (g, s) => {
    g.fillStyle = '#d3c8b0'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 200; i += 1) {
      g.fillStyle = i % 3 ? 'rgba(255,250,235,0.16)' : 'rgba(120,104,84,0.12)';
      g.fillRect((i * 17) % s, (i * 31) % s, 2, 2);
    }
  });
  const sand = make(48, (g, s) => {
    g.fillStyle = '#e7d3a1'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 150; i += 1) {
      g.fillStyle = i % 2 ? 'rgba(255,246,214,0.20)' : 'rgba(180,150,100,0.14)';
      g.fillRect((i * 11) % s, (i * 23) % s, 1.5, 1.5);
    }
  });
  const grass = make(48, (g, s) => {
    g.fillStyle = '#6e9a52'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 130; i += 1) {
      g.fillStyle = i % 2 ? 'rgba(150,190,110,0.18)' : 'rgba(60,90,50,0.16)';
      g.fillRect((i * 7) % s, (i * 19) % s, 2, 2);
    }
  });
  TEX = { asphalt, paving, sand, grass };
  return TEX;
}

// --- the ground ------------------------------------------------------------------
/** Roads, kerbs, lane paint and crossings for every intersection and street in view. */
export function drawStreets(ctx, view) {
  const i0 = Math.max(0, Math.floor(view.x / PITCH) - 1);
  const i1 = Math.min(8, Math.floor((view.x + view.w) / PITCH) + 1);
  const j0 = Math.max(0, Math.floor(view.y / PITCH) - 1);
  const j1 = Math.min(8, Math.floor((view.y + view.h) / PITCH) + 1);

  const tex = textures(ctx);
  ctx.fillStyle = C.asphalt;
  ctx.fillRect(view.x - 40, view.y - 40, view.w + 80, view.h + 80);
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = tex.asphalt;
  ctx.fillRect(view.x - 40, view.y - 40, view.w + 80, view.h + 80);
  ctx.restore();

  // Asphalt is never one flat tone: a few long patches keep the surface from reading as paper.
  ctx.fillStyle = C.asphaltDark;
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const rx = roadX(i), ry = roadY(j);
      if ((i + j) % 2 === 0) ctx.fillRect(rx - ROAD / 2 + 6, ry - ROAD / 2 + 8, ROAD - 12, ROAD - 16);
    }
  }

  // Wear: the middle of every lane is polished lighter, the gutters are dirtier.
  ctx.fillStyle = 'rgba(180,168,150,0.05)';
  for (let j = j0; j <= j1; j += 1) {
    for (const off of [-44, -15, 15, 44]) {
      ctx.fillRect(view.x - 40, roadY(j) + off - 7, view.w + 80, 14);
    }
  }
  ctx.fillStyle = 'rgba(20,16,24,0.16)';
  for (let i = i0; i <= i1; i += 1) {
    for (const off of [-52, 52]) {
      ctx.fillRect(roadX(i) + off - 4, view.y - 40, 8, view.h + 80);
    }
  }
  // Cracks: short dark strokes, seeded off the grid so they never move.
  ctx.strokeStyle = 'rgba(24,20,30,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = i0; i <= i1; i += 1) {
    for (let k = 0; k < 7; k += 1) {
      const cx = roadX(i) + ((k * 37 + i * 53) % 90) - 45;
      const cy = view.y + ((k * 131 + i * 71) % Math.max(1, view.h));
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + 9 + (k % 4) * 5, cy + 4);
      ctx.lineTo(cx + 14 + (k % 3) * 6, cy + 1);
    }
  }
  ctx.stroke();

  // Kerbs, then the pavements: the block slab is one rounded rectangle of pale stone.
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const x = roadX(i) + ROAD / 2, y = roadY(j) + ROAD / 2;
      if (x > view.x + view.w + 40 || y > view.y + view.h + 40) continue;
      ctx.fillStyle = 'rgba(28,22,34,0.22)';
      roundRect(ctx, x - 7, y - 6, BLOCK + 14, BLOCK + 15, 11);
      ctx.fill();
      fillRound(ctx, x - 4, y - 4, BLOCK + 8, BLOCK + 8, 9, C.kerb);
      fillRound(ctx, x, y, BLOCK, BLOCK, 7, C.sidewalk);
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, x, y, BLOCK, BLOCK, 7);
      ctx.clip();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = tex.paving;
      ctx.fillRect(x, y, BLOCK, BLOCK);
      ctx.restore();
      // Paving joints: two faint lines each way, cheap and it reads as stone slabs.
      ctx.strokeStyle = 'rgba(160,144,120,0.42)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < 4; k += 1) {
        ctx.moveTo(x + (BLOCK / 4) * k, y + 3);
        ctx.lineTo(x + (BLOCK / 4) * k, y + BLOCK - 3);
        ctx.moveTo(x + 3, y + (BLOCK / 4) * k);
        ctx.lineTo(x + BLOCK - 3, y + (BLOCK / 4) * k);
      }
      ctx.stroke();
    }
  }

  // Lane paint: a solid centre line and dashed lane dividers, only between kerbs.
  ctx.strokeStyle = C.lane;
  for (let j = j0; j <= j1; j += 1) {
    const y = roadY(j);
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(view.x - 40, y);
    ctx.lineTo(view.x + view.w + 40, y);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 2;
    ctx.setLineDash([16, 20]);
    for (const off of [-29, 29]) {
      ctx.beginPath();
      ctx.moveTo(view.x - 40, y + off);
      ctx.lineTo(view.x + view.w + 40, y + off);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  for (let i = i0; i <= i1; i += 1) {
    const x = roadX(i);
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, view.y - 40);
    ctx.lineTo(x, view.y + view.h + 40);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([16, 20]);
    for (const off of [-29, 29]) {
      ctx.beginPath();
      ctx.moveTo(x + off, view.y - 40);
      ctx.lineTo(x + off, view.y + view.h + 40);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;

  // Crossings and stop bars on each approach to each junction.
  ctx.fillStyle = 'rgba(233,224,196,0.8)';
  for (let j = j0; j <= j1; j += 1) {
    for (let i = i0; i <= i1; i += 1) {
      const cx = roadX(i), cy = roadY(j);
      if (cx < view.x - 120 || cx > view.x + view.w + 120 || cy < view.y - 120 || cy > view.y + view.h + 120) continue;
      const half = ROAD / 2;
      for (let k = 0; k < 5; k += 1) {
        const o = -half + 10 + k * 22;
        ctx.fillRect(cx - half - 18, cy + o, 14, 14);
        ctx.fillRect(cx + half + 4, cy + o, 14, 14);
        ctx.fillRect(cx + o, cy - half - 18, 14, 14);
        ctx.fillRect(cx + o, cy + half + 4, 14, 14);
      }
      // Manhole covers, and the painted arrow that says which way this lane goes.
      ctx.fillStyle = 'rgba(30,26,34,0.42)';
      ctx.beginPath();
      ctx.arc(cx + 18, cy - 20, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx - 24, cy + 26, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(30,26,34,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx + 18, cy - 20, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(232,224,196,0.7)';
      for (const [dx, dy, rot] of [[-29, -1, 0], [29, 1, Math.PI], [-1, 29, Math.PI / 2], [1, -29, -Math.PI / 2]]) {
        ctx.save();
        ctx.translate(cx + dx * 2.1, cy + dy * 2.1);
        ctx.rotate(rot);
        ctx.beginPath();
        ctx.moveTo(9, 0);
        ctx.lineTo(-3, -6);
        ctx.lineTo(-3, -2);
        ctx.lineTo(-9, -2);
        ctx.lineTo(-9, 2);
        ctx.lineTo(-3, 2);
        ctx.lineTo(-3, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  }
}

/** The sea, its foam, the sand and the pier. */
export function drawCoast(ctx, world, view, time) {
  const { beachX, seaX, coast } = world;
  if (view.x + view.w < beachX) return;
  const tex = textures(ctx);
  ctx.fillStyle = C.sand;
  ctx.fillRect(beachX, 0, seaX - beachX, world.bounds.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(beachX, 0, seaX - beachX, world.bounds.h);
  ctx.clip();
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = tex.sand;
  ctx.fillRect(beachX, view.y - 40, seaX - beachX, view.h + 80);
  ctx.restore();
  ctx.fillStyle = C.sandDark;
  for (let k = 0; k < 90; k += 1) {
    const x = beachX + ((k * 137.5) % (seaX - beachX));
    const y = ((k * 421.7) % world.bounds.h);
    if (x < view.x - 20 || x > view.x + view.w + 20 || y < view.y - 20 || y > view.y + view.h + 20) continue;
    ctx.fillRect(x, y, 3, 2);
  }
  // Wet sand, then the water, then foam lines rolling in.
  ctx.fillStyle = 'rgba(180,160,120,0.55)';
  ctx.fillRect(seaX - 16, 0, 16, world.bounds.h);
  ctx.fillStyle = C.seaDeep;
  ctx.fillRect(seaX, 0, world.bounds.w - seaX, world.bounds.h);
  ctx.fillStyle = C.sea;
  ctx.fillRect(seaX, 0, Math.max(0, view.x + view.w - seaX), world.bounds.h);
  ctx.strokeStyle = 'rgba(169,220,216,0.55)';
  ctx.lineWidth = 2;
  for (let k = 0; k < 14; k += 1) {
    const y = (k * 97 + ((time * 14) % 97)) % world.bounds.h;
    if (y < view.y - 30 || y > view.y + view.h + 30) continue;
    ctx.beginPath();
    ctx.moveTo(seaX + 4, y);
    ctx.bezierCurveTo(seaX + 60, y - 6, seaX + 130, y + 6, seaX + 210, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.72)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const foam = Math.sin(time * 0.9) * 6;
  ctx.moveTo(seaX + 2 + foam, 0);
  ctx.lineTo(seaX + 2 + foam, world.bounds.h);
  ctx.stroke();

  // The pier: planks, rails, pilings.
  const p = coast.pier;
  if (p.x < view.x + view.w && p.x + p.w > view.x && p.y < view.y + view.h && p.y + p.h > view.y) {
    ctx.fillStyle = 'rgba(30,20,40,0.22)';
    ctx.fillRect(p.x + 6, p.y + 8, p.w, p.h);
    ctx.fillStyle = '#a9835a';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = 'rgba(90,62,40,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < p.w; x += 12) {
      ctx.moveTo(p.x + x, p.y);
      ctx.lineTo(p.x + x, p.y + p.h);
    }
    ctx.stroke();
    ctx.fillStyle = '#8a6a48';
    ctx.fillRect(p.x, p.y - 3, p.w, 3);
    ctx.fillRect(p.x, p.y + p.h, p.w, 3);
  }
  for (const b of coast.boats) {
    if (b.x < view.x - 120 || b.x > view.x + view.w + 120 || b.y < view.y - 120 || b.y > view.y + view.h + 120) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.angle + Math.sin(time * 0.8 + b.x) * 0.02);
    ctx.fillStyle = 'rgba(20,30,50,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 4, b.len / 2, b.wid / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ['#f2efe6', '#dfe9ea', '#f0d9b5', '#cfe0df'][b.tint];
    ctx.beginPath();
    ctx.moveTo(-b.len / 2, -b.wid / 2);
    ctx.lineTo(b.len / 2 - 6, -b.wid / 2);
    ctx.quadraticCurveTo(b.len / 2 + 4, 0, b.len / 2 - 6, b.wid / 2);
    ctx.lineTo(-b.len / 2, b.wid / 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(40,60,70,0.55)';
    ctx.fillRect(-b.len * 0.16, -b.wid * 0.3, b.len * 0.28, b.wid * 0.6);
    ctx.strokeStyle = '#c8d8d6';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(-2, -26);
    ctx.stroke();
    ctx.restore();
  }
}

/** A block's own surface: lawn, plaza tile, car park or bare lot. */
export function drawBlockGround(ctx, block) {
  if (block.kind === 'park' || block.kind === 'plaza' || block.kind === 'lot') {
    const p = block.lawn || block.plaza || block.lot;
    ctx.fillStyle = block.kind === 'park' ? C.grass : block.kind === 'plaza' ? '#d9cdb2' : '#565258';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    if (block.kind === 'park' || block.kind === 'plaza') {
      ctx.save();
      ctx.beginPath();
      ctx.rect(p.x, p.y, p.w, p.h);
      ctx.clip();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = textures(ctx)[block.kind === 'park' ? 'grass' : 'paving'];
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.restore();
    }
    if (block.kind === 'park') {
      ctx.fillStyle = C.grassDark;
      for (let k = 0; k < 8; k += 1) {
        const gx = p.x + ((k * 71) % p.w);
        const gy = p.y + ((k * 53) % p.h);
        ctx.fillRect(gx, gy, 26, 12);
      }
      // Paths crossing the lawn.
      ctx.fillStyle = C.path;
      ctx.fillRect(p.x, p.y + p.h / 2 - 7, p.w, 14);
      ctx.fillRect(p.x + p.w / 2 - 7, p.y, 14, p.h);
    } else if (block.kind === 'plaza') {
      ctx.strokeStyle = 'rgba(150,132,104,0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < 8; k += 1) {
        ctx.moveTo(p.x + (p.w / 8) * k, p.y);
        ctx.lineTo(p.x + (p.w / 8) * k, p.y + p.h);
        ctx.moveTo(p.x, p.y + (p.h / 8) * k);
        ctx.lineTo(p.x + p.w, p.y + (p.h / 8) * k);
      }
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(226,220,198,0.55)';
      ctx.lineWidth = 2;
      for (const s of block.parking) {
        ctx.strokeRect(s.x - 9, s.y - 17, 18, 34);
      }
    }
  }
  // A shadowed apron where a building meets its pavement.
  for (const b of block.buildings) {
    ctx.fillStyle = 'rgba(60,44,60,0.12)';
    ctx.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
  }
}

// --- buildings -------------------------------------------------------------------
/**
 * One building, extruded: a shadow thrown south-east, a lit east wall, a shaded south wall
 * with its windows and shopfronts, then the roof with whatever plant it keeps up there —
 * a pool, a helipad, a garden, a bank of panels, air handlers, a sign.
 */
export function drawBuilding(ctx, b) {
  const hh = 5.6 * b.floors;
  const hx = hh * 0.3;
  const hy = hh * 0.88;
  const roof = C.roof[b.roofIndex % C.roof.length];
  const wall = C.wall[b.wallIndex % C.wall.length];
  const roofDark = C.roofDark[b.roofIndex % C.roofDark.length];

  // Shadow on the pavement, thrown away from the sun: a long soft one, then a darker core.
  ctx.fillStyle = 'rgba(46,30,54,0.13)';
  ctx.fillRect(b.x + 10 + hy * 0.5, b.y + 16 + hy * 1.15, b.w + hy * 0.2, b.h);
  ctx.fillStyle = 'rgba(44,28,52,0.24)';
  ctx.fillRect(b.x + 7 + hy * 0.22, b.y + 10 + hy * 0.62, b.w + hx * 0.4, b.h);

  // East wall, catching the sun.
  ctx.fillStyle = shade(wall, 0.1);
  ctx.fillRect(b.x + b.w, b.y - hy, hx, b.h + hy);
  ctx.fillStyle = 'rgba(255,240,210,0.14)';
  ctx.fillRect(b.x + b.w, b.y - hy, Math.max(1, hx * 0.35), b.h + hy);

  // South wall, in its own shade, with a plinth at the bottom.
  const sw = shade(wall, -0.48);
  ctx.fillStyle = sw;
  ctx.fillRect(b.x + hx, b.y + b.h - hy, b.w, hy);
  ctx.fillStyle = shade(wall, -0.55);
  ctx.fillRect(b.x + hx, b.y + b.h - 5, b.w, 5);
  ctx.fillStyle = 'rgba(255,246,214,0.16)';
  ctx.fillRect(b.x + hx, b.y + b.h - hy, b.w, 2);

  // Windows: two or three rows of lit glass, warm where the sun lands.
  if (hy > 11) {
    const rows = Math.max(1, Math.floor((hy - 6) / 9));
    for (let r = 0; r < rows; r += 1) {
      const wy = b.y + b.h - hy + 5 + r * 9;
      for (let x = b.x + hx + 5; x < b.x + hx + b.w - 8; x += 12) {
        const lit = ((x * 7 + r * 13 + b.style * 5) % 17) < 6;
        ctx.fillStyle = lit ? 'rgba(255,214,150,0.55)' : 'rgba(40,52,66,0.6)';
        ctx.fillRect(x, wy, 7, 4);
      }
    }
  }

  // Shopfronts: awnings and glass at street level on the low buildings.
  if (b.awning) {
    const ay = b.y + b.h - 4;
    for (let x = b.x + hx + 3; x < b.x + hx + b.w - 10; x += 22) {
      ctx.fillStyle = b.accent % 2 ? '#d0544a' : '#2f8f96';
      ctx.fillRect(x, ay - 6, 18, 6);
      ctx.fillStyle = 'rgba(255,220,170,0.75)';
      ctx.fillRect(x + 1, ay - 5, 16, 3);
    }
  }

  // The roof slab.
  ctx.fillStyle = roof;
  ctx.fillRect(b.x + hx, b.y - hy, b.w, b.h);
  // Sun on one corner, shade on the other: two cheap washes are enough to give it a shape.
  ctx.fillStyle = 'rgba(255,246,214,0.13)';
  ctx.fillRect(b.x + hx, b.y - hy, b.w * 0.55, b.h * 0.5);
  ctx.fillStyle = 'rgba(40,30,50,0.10)';
  ctx.fillRect(b.x + hx, b.y - hy + b.h * 0.62, b.w, b.h * 0.38);
  // Parapet.
  ctx.strokeStyle = roofDark;
  ctx.lineWidth = 3;
  ctx.strokeRect(b.x + hx + 1.5, b.y - hy + 1.5, b.w - 3, b.h - 3);
  ctx.strokeStyle = 'rgba(255,248,222,0.22)';
  ctx.lineWidth = 1;
  ctx.strokeRect(b.x + hx + 4.5, b.y - hy + 4.5, b.w - 9, b.h - 9);

  // Gravel, seams and weathering: a roof is never one flat colour.
  ctx.fillStyle = 'rgba(60,46,64,0.16)';
  const seed = Math.imul(Math.round(b.x), 73856093) ^ Math.imul(Math.round(b.y), 19349663);
  for (let k = 0; k < 10; k += 1) {
    const rx = b.x + hx + 8 + ((seed >>> (k * 3)) % Math.max(1, b.w - 16));
    const ry = b.y - hy + 8 + ((seed >>> (k * 5 + 2)) % Math.max(1, b.h - 16));
    ctx.fillRect(rx, ry, 3 + (k % 3), 2);
  }

  if (b.glass) {
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 10; x < b.w - 6; x += 16) {
      ctx.moveTo(b.x + hx + x, b.y - hy + 5);
      ctx.lineTo(b.x + hx + x, b.y - hy + b.h - 5);
    }
    for (let y = 10; y < b.h - 6; y += 16) {
      ctx.moveTo(b.x + hx + 5, b.y - hy + y);
      ctx.lineTo(b.x + hx + b.w - 5, b.y - hy + y);
    }
    ctx.stroke();
  }

  drawRoofLife(ctx, b, hx, hy, roof, roofDark);
  // A stair bulkhead and a skylight strip: every roof needs a way down and a way to the light.
  if (b.w > 78 && b.h > 60) {
    const bx = b.x + hx + b.w - 30, by = b.y - hy + b.h - 30;
    ctx.fillStyle = 'rgba(40,30,50,0.22)';
    ctx.fillRect(bx - 8, by - 6, 20, 16);
    ctx.fillStyle = shade(roof, -0.2);
    ctx.fillRect(bx - 10, by - 8, 20, 16);
    ctx.fillStyle = 'rgba(255,240,206,0.22)';
    ctx.fillRect(bx - 10, by - 8, 20, 2);
    ctx.fillStyle = 'rgba(30,24,34,0.5)';
    ctx.fillRect(bx - 3, by + 1, 5, 7);
  }
  if (b.w > 96 && b.h > 80) {
    // A water tank on legs: the one silhouette that says "roof" from the air.
    const tx = b.x + hx + 22, ty = b.y - hy + 20;
    ctx.strokeStyle = 'rgba(50,40,50,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx - 7, ty + 10); ctx.lineTo(tx - 4, ty + 2);
    ctx.moveTo(tx + 7, ty + 10); ctx.lineTo(tx + 4, ty + 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(46,34,50,0.28)';
    ctx.beginPath();
    ctx.ellipse(tx + 3, ty + 4, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#8c8272';
    ctx.beginPath();
    ctx.arc(tx, ty, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#a89c86';
    ctx.beginPath();
    ctx.arc(tx - 1, ty - 1, 6.5, 0, Math.PI * 2);
    ctx.fill();
  }
  if (b.w > 70) {
    ctx.fillStyle = 'rgba(190,226,240,0.35)';
    ctx.fillRect(b.x + hx + 12, b.y - hy + b.h - 24, 16, 10);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x + hx + 12, b.y - hy + b.h - 24, 16, 10);
  }

  // Rooftop plant: air handlers, vents, water tanks, a stair hut.
  for (const p of b.roofProps) {
    const sx = p.x + hx, sy = p.y - hy;
    if (sx < b.x + hx + 5 || sx > b.x + hx + b.w - 5 || sy < b.y - hy + 5 || sy > b.y - hy + b.h - 5) continue;
    ctx.fillStyle = 'rgba(40,30,50,0.25)';
    ctx.fillRect(sx - p.s / 2 + 2.5, sy - p.s / 2 + 2.5, p.s, p.s);
    if (p.kind === 'tank') {
      ctx.fillStyle = '#a89a86';
      ctx.beginPath();
      ctx.arc(sx, sy, p.s / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a7d69';
      ctx.beginPath();
      ctx.arc(sx - 1, sy - 1, p.s / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,246,215,0.3)';
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (p.kind === 'solar') {
      ctx.fillStyle = '#33495c';
      ctx.fillRect(sx - p.s / 2, sy - p.s / 2, p.s, p.s * 0.7);
      ctx.strokeStyle = 'rgba(190,230,255,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - p.s / 2, sy - p.s / 2, p.s, p.s * 0.7);
    } else if (p.kind === 'hut') {
      ctx.fillStyle = shade(roof, -0.18);
      ctx.fillRect(sx - p.s, sy - p.s, p.s * 2, p.s * 1.6);
      ctx.fillStyle = 'rgba(56,40,58,0.45)';
      ctx.fillRect(sx - p.s + 2, sy - p.s + 2, p.s * 2 - 4, p.s * 1.6 - 4);
      ctx.fillStyle = 'rgba(255,226,160,0.6)';
      ctx.fillRect(sx - p.s * 0.3, sy - p.s + 4, 4, 3);
    } else {
      ctx.fillStyle = '#bdb9ae';
      ctx.fillRect(sx - p.s / 2, sy - p.s / 2, p.s, p.s);
      ctx.fillStyle = 'rgba(70,70,80,0.55)';
      ctx.fillRect(sx - p.s / 2 + 2, sy - p.s / 2 + 2, p.s - 4, p.s - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(sx - p.s / 2 + 1, sy - p.s / 2 + 1, p.s - 2, 1);
    }
  }

  // A painted sign board on the roof edge, the city's own advertising.
  if (b.sign) {
    const w = Math.min(b.w - 12, Math.max(46, b.sign.text.length * 6.2));
    const sx = b.x + hx + 6;
    const sy = b.y - hy + 6;
    ctx.fillStyle = 'rgba(40,26,48,0.34)';
    ctx.fillRect(sx + 3, sy + 3, w, 14);
    ctx.fillStyle = 'rgba(20,16,24,0.5)';
    ctx.fillRect(sx - 1, sy - 1, w + 2, 16);
    ctx.fillStyle = ['#f0e6cf', '#d94f4f', '#2f7f8f', '#efc04a'][b.accent % 4];
    ctx.fillRect(sx, sy, w, 14);
    ctx.fillStyle = 'rgba(32,26,38,0.92)';
    ctx.font = '700 9px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.sign.text, sx + 3, sy + 7, w - 6);
  }
}

/** What lives on this particular roof: a pool, a helipad, a garden, or a bank of panels. */
function drawRoofLife(ctx, b, hx, hy, roof, roofDark) {
  const x = b.x + hx, y = b.y - hy;
  if (b.roofKind === 'pool' && b.w > 70 && b.h > 70) {
    const w = b.w * 0.5, h = b.h * 0.34;
    const px = x + b.w * 0.26, py = y + b.h * 0.3;
    ctx.fillStyle = '#cbbc9c';
    ctx.fillRect(px - 3, py - 3, w + 6, h + 6);
    ctx.fillStyle = '#4fb6c4';
    ctx.fillRect(px, py, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(px + 2, py + 2, w * 0.5, 1.5);
    ctx.fillRect(px + 4, py + 6, w * 0.3, 1.2);
    ctx.fillStyle = '#f2ead6';
    ctx.fillRect(px + w + 8, py + 3, 4, 9);
    ctx.fillRect(px + w + 8, py + h - 10, 4, 9);
  } else if (b.roofKind === 'helipad' && b.w > 80 && b.h > 80) {
    const cx = x + b.w / 2, cy = y + b.h / 2, r = Math.min(b.w, b.h) * 0.3;
    ctx.fillStyle = 'rgba(50,44,54,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(242,230,200,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(242,230,200,0.9)';
    ctx.font = `700 ${Math.round(r * 0.9)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('H', cx, cy + 1);
    ctx.textAlign = 'left';
  } else if (b.roofKind === 'garden' && b.w > 66 && b.h > 66) {
    ctx.fillStyle = '#6f9153';
    ctx.fillRect(x + b.w * 0.18, y + b.h * 0.2, b.w * 0.6, b.h * 0.55);
    ctx.fillStyle = '#5d7d46';
    for (let k = 0; k < 6; k += 1) {
      ctx.beginPath();
      ctx.arc(x + b.w * (0.24 + 0.1 * k), y + b.h * (0.3 + ((k % 3) * 0.14)), 4 + (k % 2), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,246,214,0.5)';
    ctx.fillRect(x + b.w * 0.3, y + b.h * 0.45, b.w * 0.3, 3);
  } else if (b.roofKind === 'solar' && b.w > 62) {
    ctx.fillStyle = '#33495c';
    for (let k = 0; k < 3; k += 1) {
      ctx.fillRect(x + 8 + k * 16, y + 10, 12, 9);
      ctx.fillRect(x + 8 + k * 16, y + 22, 12, 9);
    }
    ctx.strokeStyle = 'rgba(190,230,255,0.4)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 3; k += 1) {
      ctx.strokeRect(x + 8 + k * 16, y + 10, 12, 9);
      ctx.strokeRect(x + 8 + k * 16, y + 22, 12, 9);
    }
  }
  // Every roof gets a vent stack and a hatch, so none of them reads as a bare rectangle.
  ctx.fillStyle = roofDark;
  ctx.fillRect(x + b.w - 16, y + 10, 5, 5);
  ctx.fillRect(x + 10, y + b.h - 16, 7, 5);
  ctx.fillStyle = 'rgba(255,246,214,0.35)';
  ctx.fillRect(x + b.w - 15, y + 11, 3, 1);
}

/** Darken (k<0) or lighten (k>0) a #rrggbb colour by a fraction. */
export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (k >= 0) {
    r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k;
  } else {
    r *= 1 + k; g *= 1 + k; b *= 1 + k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// --- street furniture --------------------------------------------------------------
export function drawProp(ctx, p, time) {
  switch (p.type) {
    case 'palm': return drawPalm(ctx, p.x, p.y, p.r * 1.5 + 8, p.angle);
    case 'leaf': return drawLeafTree(ctx, p.x, p.y, p.r);
    case 'lamp': return drawLamp(ctx, p.x, p.y, p.angle);
    case 'hydrant': {
      shadowBlob(ctx, p.x, p.y, 4, 2.5, 0.24, 3, 2);
      ctx.fillStyle = '#c8402f';
      ctx.fillRect(p.x - 2, p.y - 4, 4, 6);
      ctx.fillRect(p.x - 3.5, p.y - 1.5, 7, 2);
      return;
    }
    case 'bin': {
      shadowBlob(ctx, p.x, p.y, 4, 3, 0.22, 3, 2);
      ctx.fillStyle = '#4c6a5c';
      ctx.fillRect(p.x - 3, p.y - 4, 6, 7);
      return;
    }
    case 'planter': {
      shadowBlob(ctx, p.x, p.y, 6, 4, 0.2, 3, 2);
      ctx.fillStyle = '#a3906f';
      ctx.fillRect(p.x - 5, p.y - 5, 10, 9);
      ctx.fillStyle = '#5f8c4c';
      ctx.beginPath();
      ctx.arc(p.x, p.y - 5, 4.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'bench': {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = 'rgba(36,24,46,0.22)';
      ctx.fillRect(-8, -1, 18, 6);
      ctx.fillStyle = '#8a6a48';
      ctx.fillRect(-9, -3, 18, 5);
      ctx.fillStyle = '#6b503a';
      ctx.fillRect(-9, -4.5, 18, 2);
      ctx.restore();
      return;
    }
    case 'stall': {
      const tint = ['#d9544a', '#3f9a96', '#e0b04a', '#6b6fc0'][(p.tint || 0) % 4];
      ctx.fillStyle = 'rgba(36,24,46,0.25)';
      ctx.fillRect(p.x - 14 + 4, p.y - 10 + 4, 28, 20);
      ctx.fillStyle = '#e8dfc8';
      ctx.fillRect(p.x - 14, p.y - 8, 28, 16);
      ctx.fillStyle = tint;
      ctx.fillRect(p.x - 16, p.y - 12, 32, 6);
      ctx.fillStyle = shade(tint, -0.25);
      for (let k = 0; k < 5; k += 1) ctx.fillRect(p.x - 16 + k * 7, p.y - 12, 3, 6);
      ctx.fillStyle = 'rgba(60,44,40,0.5)';
      ctx.fillRect(p.x - 10, p.y - 4, 8, 5);
      ctx.fillRect(p.x + 2, p.y - 4, 8, 5);
      return;
    }
    case 'fountain': {
      ctx.fillStyle = 'rgba(36,30,50,0.18)';
      ctx.beginPath();
      ctx.arc(p.x + 4, p.y + 4, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#cbbc9c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#63b6c0';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r - 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const t = Math.sin(time * 2) * 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4 + t * 0.4, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'umbrella': {
      const tint = ['#e05a4a', '#2f9a9e', '#efc04a', '#e9e2d0'][(p.tint || 0) % 4];
      ctx.fillStyle = 'rgba(36,24,46,0.2)';
      ctx.beginPath();
      ctx.ellipse(p.x + 6, p.y + 6, 16, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e6dcc4';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tint;
      for (let k = 0; k < 4; k += 1) {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, 15, (k * Math.PI) / 2, (k * Math.PI) / 2 + Math.PI / 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = '#b9a888';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'piling': {
      shadowBlob(ctx, p.x, p.y, 4, 4, 0.28, 3, 3);
      ctx.fillStyle = '#5c4530';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case 'newsbox': {
      shadowBlob(ctx, p.x, p.y, 5, 3, 0.22, 3, 2);
      ctx.fillStyle = ['#d4543f', '#2f7f8f', '#e0b04a', '#5b6bb0'][(p.tint || 0) % 4];
      ctx.fillRect(p.x - 4, p.y - 5, 8, 9);
      ctx.fillStyle = 'rgba(24,20,28,0.5)';
      ctx.fillRect(p.x - 2.5, p.y - 2, 5, 3);
      return;
    }
    case 'scooter': {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = 'rgba(36,24,46,0.2)';
      ctx.fillRect(-7, -2, 15, 7);
      ctx.fillStyle = ['#d9544a', '#3fa7a0', '#e8e2d2', '#e8b64c'][(p.tint || 0) % 4];
      ctx.fillRect(-7, -3, 14, 5);
      ctx.fillStyle = '#2a2530';
      ctx.fillRect(-7, -3.5, 3, 6);
      ctx.fillRect(5, -3.5, 3, 6);
      ctx.fillRect(-1, -6, 3, 3);
      ctx.restore();
      return;
    }
    case 'mailbox': {
      shadowBlob(ctx, p.x, p.y, 4, 3, 0.22, 3, 2);
      ctx.fillStyle = '#3f5f9a';
      ctx.fillRect(p.x - 3.5, p.y - 5, 7, 8);
      ctx.fillStyle = '#2e4a7a';
      ctx.fillRect(p.x - 3.5, p.y - 6, 7, 2);
      return;
    }
    case 'table': {
      shadowBlob(ctx, p.x, p.y, 8, 6, 0.2, 4, 3);
      ctx.fillStyle = '#e8dfc8';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ['#d9544a', '#3f9a96', '#e0b04a', '#6b6fc0'][(p.tint || 0) % 4];
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6a48';
      ctx.fillRect(p.x - 11, p.y - 2, 3, 3);
      ctx.fillRect(p.x + 8, p.y - 2, 3, 3);
      return;
    }
    case 'sign': {
      ctx.fillStyle = 'rgba(36,24,46,0.22)';
      ctx.fillRect(p.x - 7 + 3, p.y - 7 + 3, 14, 14);
      ctx.fillStyle = '#2f6f86';
      ctx.fillRect(p.x - 7, p.y - 7, 14, 14);
      ctx.fillStyle = '#f0ece0';
      ctx.font = '700 10px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.text || 'P', p.x, p.y + 1);
      ctx.textAlign = 'left';
      return;
    }
    default:
  }
}

/** A palm: bent trunk, a crown of fronds, and a long shadow across the pavement. */
export function drawPalm(ctx, x, y, size, angle) {
  const lean = Math.sin(angle) * size * 0.16;
  ctx.save();
  ctx.translate(x, y);
  // Shadow first, offset with the sun.
  ctx.fillStyle = 'rgba(36,24,46,0.22)';
  ctx.beginPath();
  ctx.ellipse(8, 7, size * 0.5, size * 0.3, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#8a6b45';
  ctx.lineWidth = Math.max(2, size * 0.09);
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.quadraticCurveTo(lean * 0.4, -size * 0.5, lean, -size * 0.95);
  ctx.stroke();
  const tipX = lean, tipY = -size * 0.95;
  for (let k = 0; k < 7; k += 1) {
    const a = (k / 7) * Math.PI * 2 + angle;
    const len = size * 0.62;
    ctx.strokeStyle = k % 2 ? '#3f7a45' : '#4e8f4c';
    ctx.lineWidth = Math.max(2, size * 0.08);
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.quadraticCurveTo(tipX + Math.cos(a) * len * 0.6, tipY + Math.sin(a) * len * 0.6 - size * 0.16,
      tipX + Math.cos(a) * len, tipY + Math.sin(a) * len * 0.8);
    ctx.stroke();
  }
  ctx.fillStyle = '#6a5a34';
  ctx.beginPath();
  ctx.arc(tipX, tipY, Math.max(2, size * 0.1), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawLeafTree(ctx, x, y, r) {
  shadowBlob(ctx, x, y, r * 0.8, r * 0.5, 0.2, 5, 4);
  ctx.fillStyle = '#6b4a32';
  ctx.fillRect(x - 2, y - 4, 4, 6);
  ctx.fillStyle = '#4f8a45';
  ctx.beginPath();
  ctx.arc(x, y - r * 0.4, r * 0.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5f9c4e';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.6, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawLamp(ctx, x, y, angle) {
  shadowBlob(ctx, x, y, 8, 3, 0.22, 6, 4);
  ctx.fillStyle = '#4a4a54';
  ctx.fillRect(x - 1.5, y - 15, 3, 17);
  ctx.fillStyle = '#3c3c46';
  const ax = Math.cos(angle) * 6, ay = Math.sin(angle) * 6;
  ctx.fillRect(x - 2 + ax, y - 16 + ay, 4, 4);
  ctx.fillStyle = 'rgba(255,214,140,0.85)';
  ctx.fillRect(x - 3 + ax, y - 17 + ay, 6, 3);
}

// --- cars ------------------------------------------------------------------------
/** A car seen from above: shadow, body, cabin, glass, lights, wheels and its damage. */
export function drawCar(ctx, car, time) {
  const t = CAR_TYPES[car.type] || CAR_TYPES.sedan;
  const L = t.len, W = t.wid;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow, thrown south-east regardless of heading.
  ctx.save();
  ctx.rotate(-car.angle);
  ctx.fillStyle = 'rgba(30,20,42,0.28)';
  roundRect(ctx, -L / 2 + 5, -W / 2 + 6, L, W, 6);
  ctx.fill();
  ctx.restore();

  const body = car.color;
  const trim = shade(body, -0.24);
  ctx.fillStyle = body;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(22,16,26,0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  // Bonnet and boot shading, so the car has a front.
  ctx.fillStyle = shade(body, 0.12);
  ctx.fillRect(L * 0.24, -W / 2 + 2, L * 0.2, W - 4);
  ctx.fillStyle = trim;
  ctx.fillRect(-L / 2 + 3, -W / 2 + 2, 4, W - 4);

  // Cabin: roof plate with glass front and back.
  ctx.fillStyle = shade(body, -0.12);
  roundRect(ctx, -L * 0.18, -W / 2 + 3, L * 0.42, W - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,248,226,0.22)';
  ctx.fillRect(-L * 0.16, -W / 2 + 4, L * 0.36, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(L * 0.17, -W / 2 + 5, 2, W - 10);
  ctx.fillStyle = 'rgba(38,58,74,0.9)';
  ctx.fillRect(L * 0.16, -W / 2 + 4, L * 0.07, W - 8);
  ctx.fillRect(-L * 0.22, -W / 2 + 4, L * 0.05, W - 8);
  // Side windows.
  ctx.fillStyle = 'rgba(60,86,100,0.75)';
  ctx.fillRect(-L * 0.14, -W / 2 + 2, L * 0.26, 3);
  ctx.fillRect(-L * 0.14, W / 2 - 5, L * 0.26, 3);

  // Lights: white forward, red back, brighter on the brake.
  ctx.fillStyle = '#fff3cf';
  ctx.fillRect(L / 2 - 3, -W / 2 + 3, 3, 5);
  ctx.fillRect(L / 2 - 3, W / 2 - 8, 3, 5);
  ctx.fillStyle = car.braking ? '#ff5a4a' : '#b03a34';
  ctx.fillRect(-L / 2, -W / 2 + 3, 3, 5);
  ctx.fillRect(-L / 2, W / 2 - 8, 3, 5);

  // Wheels just outside the body.
  ctx.fillStyle = '#221d26';
  ctx.fillRect(-L * 0.28, -W / 2 - 2, 8, 4);
  ctx.fillRect(-L * 0.28, W / 2 - 2, 8, 4);
  ctx.fillRect(L * 0.16, -W / 2 - 2, 8, 4);
  ctx.fillRect(L * 0.16, W / 2 - 2, 8, 4);

  if (car.type === 'taxi') {
    ctx.fillStyle = '#1f1f26';
    for (let k = 0; k < 4; k += 1) ctx.fillRect(-L * 0.12 + k * 5, -1.5, 2.5, 3);
    ctx.fillStyle = '#f2e2a0';
    ctx.fillRect(-3, -W / 2 + 1, 6, 4);
  }
  if (car.type === 'police') {
    ctx.fillStyle = '#1d2a4a';
    ctx.fillRect(-L * 0.1, -W / 2 + 2, L * 0.2, 4);
    ctx.fillRect(-L * 0.1, W / 2 - 6, L * 0.2, 4);
    // The light bar: red and blue, alternating at speed.
    const blink = Math.sin(time * 16) > 0;
    ctx.fillStyle = blink ? '#ff4a4a' : '#5a2020';
    ctx.fillRect(-2, -W / 2, 5, W / 2 - 1);
    ctx.fillStyle = blink ? '#20406a' : '#5aa0ff';
    ctx.fillRect(-2, 0, 5, W / 2 - 1);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = blink ? '#ff4a4a' : '#4a8cff';
    ctx.beginPath();
    ctx.arc(0, 0, 40 + Math.sin(time * 12) * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // Damage: dark scars, more of them as the body gives up.
  if (car.hp < (car.maxHp || 100) * 0.75) {
    ctx.fillStyle = 'rgba(28,22,30,0.55)';
    ctx.fillRect(-L * 0.1, -W / 2 + 1, 6, 3);
    ctx.fillRect(L * 0.05, W / 2 - 4, 5, 3);
    if (car.hp < (car.maxHp || 100) * 0.4) {
      ctx.fillStyle = 'rgba(20,16,22,0.7)';
      ctx.fillRect(-L * 0.3, -2, 10, 5);
      ctx.fillRect(L * 0.3, 1, 7, 4);
    }
  }
  ctx.restore();

  // Sirens paint the road under a police car, so a chase reads at a glance.
  if (car.type === 'police' && car.siren) {
    const blink = Math.sin(time * 16) > 0;
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = blink ? '#ff3b3b' : '#3b7bff';
    ctx.beginPath();
    ctx.ellipse(car.x, car.y, 34, 26, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// --- people ----------------------------------------------------------------------
/** A person from above: shadow, shoulders, head, and a hint of the walk cycle. */
export function drawPed(ctx, p, time) {
  const s = p.r || 8;
  shadowBlob(ctx, p.x, p.y, s * 0.8, s * 0.55, 0.24, 4, 3);
  const bob = Math.sin(p.phase || 0) * 1.2;
  ctx.save();
  ctx.translate(p.x, p.y - bob * 0.4);
  ctx.rotate(p.angle + Math.PI / 2);
  ctx.fillStyle = p.shirt;
  roundRect(ctx, -s * 0.55, -s * 0.4, s * 1.1, s * 0.95, s * 0.35);
  ctx.fill();
  ctx.strokeStyle = 'rgba(24,18,26,0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Arms swing with the stride.
  ctx.fillStyle = shade(p.shirt, -0.2);
  const swing = Math.sin(p.phase || 0) * s * 0.28;
  ctx.fillRect(-s * 0.72, -s * 0.1 + swing, s * 0.24, s * 0.5);
  ctx.fillRect(s * 0.48, -s * 0.1 - swing, s * 0.24, s * 0.5);
  ctx.fillStyle = p.skin;
  ctx.beginPath();
  ctx.arc(0, -s * 0.32, s * 0.34, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(30,20,30,0.55)';
  ctx.beginPath();
  ctx.arc(0, -s * 0.42, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (p.armed) {
    ctx.fillStyle = '#2a2630';
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillRect(s * 0.4, -1.4, 7, 3);
    ctx.restore();
  }
}

/** The player, drawn larger and in their own colours, with the gun when it is out. */
export function drawPlayer(ctx, pl, time) {
  const s = 12;
  shadowBlob(ctx, pl.x, pl.y, s * 0.85, s * 0.6, 0.3, 4, 4);
  const bob = Math.sin(pl.phase || 0) * (pl.moving ? 1.6 : 0.4);
  ctx.save();
  ctx.translate(pl.x, pl.y - bob * 0.35);
  ctx.rotate(pl.angle + Math.PI / 2);
  // Legs.
  ctx.fillStyle = '#33455c';
  const swing = Math.sin(pl.phase || 0) * (pl.moving ? 3.4 : 0.6);
  ctx.fillRect(-4.4, 2 + swing * 0.5, 3.4, 7);
  ctx.fillRect(1.2, 2 - swing * 0.5, 3.4, 7);
  // Torso: a pale linen shirt, the one the poster shows.
  ctx.fillStyle = '#f2ead6';
  roundRect(ctx, -5.6, -4.6, 11.2, 10.5, 4);
  ctx.fill();
  ctx.fillStyle = '#d9c9a8';
  ctx.fillRect(-5.6, 1.4, 11.2, 1.6);
  // Arms, and the gun hand when armed.
  ctx.fillStyle = '#e8dcc2';
  ctx.fillRect(-7.4, -2.6, 2.4, 6.4);
  ctx.fillRect(5, -2.6, 2.4, 6.4);
  if (pl.aiming) {
    ctx.fillStyle = '#2b2731';
    ctx.fillRect(4.4, -8.6, 3, 7);
    ctx.fillStyle = '#4a4550';
    ctx.fillRect(4.8, -8.4, 2.2, 3);
  }
  // Head, hair, and the sunglasses that go with the weather.
  ctx.fillStyle = '#c98f61';
  ctx.beginPath();
  ctx.arc(0, -3.4, 3.9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#2a2028';
  ctx.beginPath();
  ctx.arc(0, -4.4, 3.3, Math.PI * 0.9, Math.PI * 2.1);
  ctx.fill();
  ctx.restore();
}
