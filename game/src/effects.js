// Particles, tyre marks, scorch marks and the little words that float up: all the feedback
// that says something happened. A fixed pool of each, so a long chase never grows memory.
import { clamp } from './util.js';

export function createEffects() {
  const parts = [];
  const skids = [];
  const decals = [];
  const texts = [];
  const rings = [];
  let shake = 0;

  function add(p) {
    if (parts.length > 900) parts.shift();
    parts.push(p);
  }

  return {
    get shake() { return shake; },
    addShake(v) { shake = Math.min(14, shake + v); },

    /** Sparks and dust thrown from a collision or a bullet hitting metal. */
    sparks(x, y, dir, n = 8, color = 'rgba(255,210,122,') {
      for (let k = 0; k < n; k += 1) {
        const a = dir + (Math.random() - 0.5) * 1.5;
        const s = 60 + Math.random() * 220;
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.2 + Math.random() * 0.3, t: 0, size: 1.6 + Math.random() * 1.6, color, kind: 'spark', drag: 3.2 });
      }
    },
    smoke(x, y, n = 1, tint = 'rgba(120,116,128,') {
      for (let k = 0; k < n; k += 1) {
        add({ x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: (Math.random() - 0.5) * 26, vy: -14 - Math.random() * 22, life: 0.7 + Math.random() * 0.9, t: 0, size: 7 + Math.random() * 9, color: tint, kind: 'smoke', drag: 1.4 });
      }
    },
    blood(x, y, dir, n = 6) {
      for (let k = 0; k < n; k += 1) {
        const a = dir + (Math.random() - 0.5) * 2.2;
        const s = 40 + Math.random() * 160;
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.4, t: 0, size: 1.6 + Math.random() * 1.8, color: 'rgba(150,28,34,', kind: 'blood', drag: 3 });
      }
      decals.push({ x, y, r: 5 + Math.random() * 4, color: 'rgba(120,20,26,0.35)', kind: 'pool' });
      if (decals.length > 220) decals.shift();
    },
    glass(x, y, dir, n = 7) {
      for (let k = 0; k < n; k += 1) {
        const a = dir + (Math.random() - 0.5) * 2.4;
        const s = 70 + Math.random() * 200;
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.35, t: 0, size: 1.4 + Math.random() * 1.6, color: 'rgba(214,236,240,', kind: 'glass', drag: 2.6 });
      }
    },
    cash(x, y, n = 10) {
      for (let k = 0; k < n; k += 1) {
        add({ x, y, vx: (Math.random() - 0.5) * 130, vy: -40 - Math.random() * 110, life: 0.7 + Math.random() * 0.5, t: 0, size: 2.4, color: 'rgba(120,220,140,', kind: 'cash', drag: 0.8 });
      }
    },
    /** A car going up: fireball, smoke, black scorch, and a ring that runs outward. */
    explosion(x, y) {
      for (let k = 0; k < 26; k += 1) {
        const a = Math.random() * Math.PI * 2;
        const s = 40 + Math.random() * 300;
        add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.5, t: 0, size: 2 + Math.random() * 3.4, color: Math.random() < 0.5 ? 'rgba(255,196,92,' : 'rgba(255,120,60,', kind: 'spark', drag: 2.4 });
      }
      this.smoke(x, y, 14, 'rgba(60,54,64,');
      rings.push({ x, y, r: 6, t: 0, life: 0.7, color: 'rgba(255,214,140,' });
      decals.push({ x, y, r: 26, color: 'rgba(28,24,30,0.5)', kind: 'scorch' });
      if (decals.length > 220) decals.shift();
      this.addShake(11);
    },
    /** A tyre mark, laid under a drifting or braking car. */
    skid(x, y, angle, alpha = 0.5) {
      skids.push({ x, y, angle, alpha });
      if (skids.length > 700) skids.shift();
    },
    text(x, y, text, color = '#f2ead6', size = 12) {
      texts.push({ x, y, text, color, size, t: 0, life: 1.3 });
      if (texts.length > 40) texts.shift();
    },
    ring(x, y, color = 'rgba(255,220,140,') {
      rings.push({ x, y, r: 4, t: 0, life: 0.6, color });
    },

    update(dt) {
      shake = Math.max(0, shake - dt * 26);
      for (let i = parts.length - 1; i >= 0; i -= 1) {
        const p = parts[i];
        p.t += dt;
        if (p.t >= p.life) { parts.splice(i, 1); continue; }
        const d = 1 - p.drag * dt;
        p.vx *= d; p.vy *= d;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'smoke') p.vy -= 9 * dt;
      }
      for (let i = texts.length - 1; i >= 0; i -= 1) {
        texts[i].t += dt;
        texts[i].y -= 22 * dt;
        if (texts[i].t >= texts[i].life) texts.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i -= 1) {
        rings[i].t += dt;
        rings[i].r += 190 * dt;
        if (rings[i].t >= rings[i].life) rings.splice(i, 1);
      }
    },

    /** Marks on the tarmac: under the cars, over the road paint. */
    drawGround(ctx) {
      for (const s of skids) {
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        ctx.fillStyle = `rgba(26,22,30,${s.alpha})`;
        ctx.fillRect(-9, -4.5, 18, 2);
        ctx.fillRect(-9, 2.5, 18, 2);
        ctx.restore();
      }
      for (const d of decals) {
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
    },

    /** Everything in the air: sparks, blood, glass, smoke, fire, and the words. */
    drawAir(ctx) {
      for (const p of parts) {
        const k = 1 - p.t / p.life;
        const a = p.kind === 'smoke' ? k * 0.42 : k;
        ctx.fillStyle = p.color.endsWith(',') ? p.color + a.toFixed(3) + ')' : p.color;
        const s = p.kind === 'smoke' ? p.size * (1.6 - k * 0.6) : p.size;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const r of rings) {
        const k = 1 - r.t / r.life;
        ctx.strokeStyle = r.color + (k * 0.8).toFixed(3) + ')';
        ctx.lineWidth = 3 * k + 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const t of texts) {
        const k = clamp(1 - t.t / t.life, 0, 1);
        ctx.globalAlpha = k;
        ctx.font = `700 ${t.size}px ui-monospace, Menlo, Consolas, monospace`;
        ctx.fillStyle = 'rgba(20,14,24,0.6)';
        ctx.fillText(t.text, t.x + 1, t.y + 1);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
    },
  };
}
