// Small maths the whole game leans on: angles, easing, a seeded random, and the two collision
// tests used everywhere (circle against rectangle, and a swept segment against a rectangle).

export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy; };

/** Wrap an angle into (-PI, PI]. */
export function wrapAngle(a) {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  if (r <= -Math.PI) r += TAU;
  return r;
}

/** Turn `from` towards `to` by at most `maxStep` radians, the short way round. */
export function approachAngle(from, to, maxStep) {
  const d = wrapAngle(to - from);
  return from + clamp(d, -maxStep, maxStep);
}

/** Frame-rate independent smoothing: fraction of the way there after `dt`. */
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

/** mulberry32: a small deterministic random, so a seed reproduces a whole city. */
export function createRandom(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.int = (lo, hi) => Math.floor(lo + next() * (hi - lo + 1));
  next.pick = (list) => list[Math.min(list.length - 1, Math.floor(next() * list.length))];
  next.chance = (p) => next() < p;
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}

/** Does a circle overlap an axis-aligned rectangle? */
export function circleRect(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** Push a circle out of a rectangle, returning the corrected centre and hit normal. */
export function resolveCircleRect(cx, cy, r, x, y, w, h) {
  const nx = clamp(cx, x, x + w);
  const ny = clamp(cy, y, y + h);
  let dx = cx - nx, dy = cy - ny;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return null;
  if (d2 > 1e-6) {
    const d = Math.sqrt(d2);
    const push = r - d;
    return { x: cx + (dx / d) * push, y: cy + (dy / d) * push, nx: dx / d, ny: dy / d, depth: push };
  }
  // Centre is inside the box: leave by the nearest face.
  const left = cx - x, right = x + w - cx, top = cy - y, bottom = y + h - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { x: x - r, y: cy, nx: -1, ny: 0, depth: r + left };
  if (m === right) return { x: x + w + r, y: cy, nx: 1, ny: 0, depth: r + right };
  if (m === top) return { x: cx, y: y - r, nx: 0, ny: -1, depth: r + top };
  return { x: cx, y: y + h + r, nx: 0, ny: 1, depth: r + bottom };
}

/** Does the segment a->b touch the rectangle? Used for bullets, sight lines and kerbs. */
export function segmentRect(ax, ay, bx, by, x, y, w, h) {
  if (Math.max(ax, bx) < x || Math.min(ax, bx) > x + w || Math.max(ay, by) < y || Math.min(ay, by) > y + h) return false;
  if (ax >= x && ax <= x + w && ay >= y && ay <= y + h) return true;
  const dx = bx - ax, dy = by - ay;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - x, x + w - ax, ay - y, y + h - ay];
  for (let i = 0; i < 4; i += 1) {
    if (Math.abs(p[i]) < 1e-9) { if (q[i] < 0) return false; continue; }
    const r = q[i] / p[i];
    if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return true;
}

/** Closest point on segment ab to p, as a scalar 0..1. */
export function segmentT(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay;
  const len = dx * dx + dy * dy;
  if (len < 1e-9) return 0;
  return clamp(((px - ax) * dx + (py - ay) * dy) / len, 0, 1);
}

/** Overlap test for two oriented boxes treated as circles with a radius (cheap and stable). */
export const overlaps = (a, b) => dist2(a.x, a.y, b.x, b.y) < (a.r + b.r) * (a.r + b.r);

/** Format money the way a HUD does: $1,240,000. */
export function money(n) {
  const v = Math.max(0, Math.round(n));
  return '$' + v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A fixed-length ring buffer, used by the tyre-smoke and radio note queues. */
export function createRing(size) {
  const items = new Array(size).fill(null);
  let head = 0;
  return {
    push(v) { items[head] = v; head = (head + 1) % size; },
    forEach(fn) { for (let i = 0; i < size; i += 1) { const v = items[i]; if (v) fn(v, i); } },
    get length() { return size; },
  };
}
