// Money and what it buys: cash bundles left around the city, health kits, armour plates and
// ammo crates, and the running total the HUD counts up. Missions pay into the same purse.
import { createRandom, dist } from './util.js';

const rng = createRandom(60613);

export function createEconomy(game) {
  const pickups = [];
  const eco = {
    money: 0,
    shown: 0,
    pickups,
    lifetime: 0,

    add(n) {
      eco.money = Math.max(0, eco.money + n);
      if (n > 0) eco.lifetime += n;
    },
    spend(n) {
      if (eco.money < n) return false;
      eco.money -= n;
      return true;
    },
    addPickup(kind, x, y, value = 0) {
      pickups.push({ kind, x, y, value, r: 13, t: rng.range(0, 6.28), taken: false });
    },

    /** Cash, health and ammo laid out where a player will find them by exploring. */
    scatter(world) {
      const shops = [];
      for (const b of world.blocks) if (b.kind === 'plaza' || b.kind === 'lot') shops.push(b);
      for (let k = 0; k < 22; k += 1) {
        const b = shops[k % shops.length];
        eco.addPickup('cash', b.x + 40 + rng.range(0, 200), b.y + 40 + rng.range(0, 200), rng.int(60, 220));
      }
      // Health at the clinics: one on each side of town.
      const clinics = [[3, 2], [5, 5], [1, 5], [6, 1]];
      for (const [i, j] of clinics) {
        const b = world.block(i, j);
        eco.addPickup('health', b.x + 300, b.y + 12, 45);
        eco.addPickup('ammo', b.x + 262, b.y + 12, 36);
      }
      // Armour in the two alleys behind the clubs.
      const armour = [[6, 6], [4, 4]];
      for (const [i, j] of armour) {
        const b = world.block(i, j);
        eco.addPickup('armor', b.x + 12, b.y + 288, 50);
      }
      // A wad on the pier, because a pier always has one.
      eco.addPickup('cash', world.places.pier.x, world.places.pier.y - 40, 400);
    },

    /** Anything dropped by a body, within reach, or left by a wreck. */
    drop(x, y, amount) {
      eco.addPickup('cash', x, y, amount);
    },

    step(dt) {
      eco.shown += (eco.money - eco.shown) * Math.min(1, dt * 8);
      if (Math.abs(eco.money - eco.shown) < 0.6) eco.shown = eco.money;
      const p = game.player;
      for (const it of pickups) {
        if (it.taken) continue;
        it.t += dt;
        if (p.dead || p.inCar) continue;
        if (!(dist(p.x, p.y, it.x, it.y) < 22)) continue;
        it.taken = true;
        if (it.kind === 'cash') {
          eco.add(it.value);
          game.effects.cash(it.x, it.y, 8);
          game.effects.text(it.x, it.y - 14, `+$${it.value}`, '#9fd8a8', 12);
          game.audio.play('cash');
          game.notify(`+$${it.value}`, '#9fd8a8');
        } else if (it.kind === 'health') {
          p.health = Math.min(100, p.health + it.value);
          game.effects.ring(it.x, it.y, 'rgba(140,230,160,');
          game.effects.text(it.x, it.y - 14, '+HEALTH', '#9fd8a8', 11);
          game.audio.play('pickup');
        } else if (it.kind === 'armor') {
          p.armor = Math.min(100, p.armor + it.value);
          game.effects.ring(it.x, it.y, 'rgba(140,190,240,');
          game.effects.text(it.x, it.y - 14, '+ARMOR', '#9fc8f0', 11);
          game.audio.play('pickup');
        } else if (it.kind === 'ammo') {
          p.ammo.pistol = (p.ammo.pistol || 0) + 24;
          p.ammo.smg = (p.ammo.smg || 0) + 60;
          p.ammo.shotgun = (p.ammo.shotgun || 0) + 12;
          game.effects.text(it.x, it.y - 14, '+AMMO', '#f2d98a', 11);
          game.audio.play('pickup');
        }
        game.stats.pickups += 1;
      }
      // Pickups do not respawn, but the world keeps a few new ones appearing near the player
      // so a long session never runs dry.
      if (pickups.filter((i) => !i.taken).length < 10) {
        const b = game.world.block(rng.int(0, 7), rng.int(0, 7));
        eco.addPickup('cash', b.x + rng.range(30, 270), b.y + rng.range(30, 270), rng.int(40, 160));
      }
    },
  };
  return eco;
}

/** What a pickup looks like: a small icon standing on the pavement, bobbing. */
export function drawPickup(ctx, it, time) {
  if (it.taken) return;
  const bob = Math.sin(time * 2.2 + it.t) * 2;
  const y = it.y + bob;
  ctx.fillStyle = 'rgba(36,24,46,0.25)';
  ctx.beginPath();
  ctx.ellipse(it.x + 3, it.y + 5, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  if (it.kind === 'cash') {
    ctx.fillStyle = '#3f7f4c';
    ctx.fillRect(it.x - 7, y - 5, 14, 10);
    ctx.fillStyle = '#8fd8a0';
    ctx.fillRect(it.x - 5, y - 3, 10, 6);
    ctx.fillStyle = '#2f5f3c';
    ctx.fillRect(it.x - 1, y - 3, 2, 6);
  } else if (it.kind === 'health') {
    ctx.fillStyle = '#f2f0e6';
    ctx.fillRect(it.x - 7, y - 7, 14, 14);
    ctx.fillStyle = '#d0453e';
    ctx.fillRect(it.x - 2, y - 5, 4, 10);
    ctx.fillRect(it.x - 5, y - 2, 10, 4);
  } else if (it.kind === 'armor') {
    ctx.fillStyle = '#5a86c0';
    ctx.beginPath();
    ctx.moveTo(it.x, y - 8);
    ctx.lineTo(it.x + 7, y - 4);
    ctx.lineTo(it.x + 5, y + 6);
    ctx.lineTo(it.x, y + 8);
    ctx.lineTo(it.x - 5, y + 6);
    ctx.lineTo(it.x - 7, y - 4);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#8a7a52';
    ctx.fillRect(it.x - 7, y - 6, 14, 12);
    ctx.fillStyle = '#f2d98a';
    ctx.fillRect(it.x - 4, y - 3, 3, 6);
    ctx.fillRect(it.x, y - 3, 3, 6);
  }
}
