// The road network as a graph of directed edges between intersections, plus the lane geometry
// every driver reads: which side of the centre line you keep, where a lane's centre is, and
// how to pick the next edge at a junction. Traffic, police and the taxi all steer by this.
import { GRID_X, GRID_Y, PITCH, ROAD, roadX, roadY } from './config.js';
import { clamp } from './util.js';

/** Lane centre offsets from the road's centre line: inner lane, outer lane. */
export const LANES = [15, 44];

export function createStreets() {
  const nodes = [];
  for (let j = 0; j < GRID_Y; j += 1) {
    for (let i = 0; i < GRID_X; i += 1) {
      nodes.push({ i, j, x: roadX(i), y: roadY(j) });
    }
  }
  const nodeAt = (i, j) => nodes[clamp(j, 0, GRID_Y - 1) * GRID_X + clamp(i, 0, GRID_X - 1)];

  const edges = [];
  for (let j = 0; j < GRID_Y; j += 1) {
    for (let i = 0; i < GRID_X - 1; i += 1) {
      const a = nodeAt(i, j), b = nodeAt(i + 1, j);
      edges.push({ axis: 'h', dir: 1, ax: a.x, ay: a.y, bx: b.x, by: b.y, from: a, to: b, len: b.x - a.x });
      edges.push({ axis: 'h', dir: -1, ax: b.x, ay: b.y, bx: a.x, by: a.y, from: b, to: a, len: b.x - a.x });
    }
  }
  for (let i = 0; i < GRID_X; i += 1) {
    for (let j = 0; j < GRID_Y - 1; j += 1) {
      const a = nodeAt(i, j), b = nodeAt(i, j + 1);
      edges.push({ axis: 'v', dir: 1, ax: a.x, ay: a.y, bx: b.x, by: b.y, from: a, to: b, len: b.y - a.y });
      edges.push({ axis: 'v', dir: -1, ax: b.x, ay: b.y, bx: a.x, by: a.y, from: b, to: a, len: b.y - a.y });
    }
  }
  for (const e of edges) {
    e.ang = Math.atan2(e.by - e.ay, e.bx - e.ax);
    // The unit vector of the lane's own heading, and the right-hand normal: the lane sits to its right.
    e.dx = (e.bx - e.ax) / e.len;
    e.dy = (e.by - e.ay) / e.len;
    e.rx = -e.dy;
    e.ry = e.dx;
    e.out = [];
  }
  for (const e of edges) {
    const key = e.to.j * GRID_X + e.to.i;
    for (const o of edges) {
      if (o.from.j * GRID_X + o.from.i === key && o !== e) e.out.push(o);
    }
  }

  /** Where a car sits on an edge, in world units: lane offset to the right of the heading. */
  function pointOn(edge, t, lane, out) {
    const o = LANES[lane] ?? LANES[0];
    out.x = edge.ax + edge.dx * t + edge.rx * o;
    out.y = edge.ay + edge.dy * t + edge.ry * o;
    return out;
  }

  /** Choose the next edge at a junction: mostly straight on, sometimes a turn, rare U-turn. */
  function nextEdge(edge, rng) {
    const outs = edge.out;
    if (!outs.length) return null;
    if (outs.length === 1) return outs[0];
    const straight = outs.find((o) => o.axis === edge.axis && o.dir === edge.dir);
    const turn = rng();
    if (straight && turn < 0.64) return straight;
    const others = outs.filter((o) => o !== straight);
    if (turn < 0.94 && others.length) return others[Math.floor(rng() * others.length)];
    return straight ?? outs[Math.floor(rng() * outs.length)];
  }

  /** Nearest edge to a point, for spawning a car that is already in a lane. */
  function nearestEdge(x, y) {
    let best = null, bestD = Infinity;
    for (const e of edges) {
      const px = e.ax + e.dx * clamp((x - e.ax) * e.dx + (y - e.ay) * e.dy, 0, e.len);
      const py = e.ay + e.dy * clamp((x - e.ax) * e.dx + (y - e.ay) * e.dy, 0, e.len);
      const d = (px - x) ** 2 + (py - y) ** 2;
      if (d < bestD) { bestD = d; best = e; }
    }
    return { edge: best, t: clamp((x - best.ax) * best.dx + (y - best.ay) * best.dy, 0, best.len) };
  }

  /** Is this point on tarmac? Used to decide where the player can be run over, and where not. */
  function onRoad(x, y) {
    const mx = ((x % PITCH) + PITCH) % PITCH;
    const my = ((y % PITCH) + PITCH) % PITCH;
    return mx < ROAD || my < ROAD;
  }

  return { nodes, edges, nodeAt, pointOn, nextEdge, nearestEdge, onRoad, lanes: LANES };
}
