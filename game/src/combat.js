// Guns and fists. A shot is a projectile with a trail: it travels, it stops at walls, and it
// lands on a pedestrian, an officer, a car or the player. Melee is a short arc in front of the
// attacker. Every shot is heard, and noise is what brings the police.
import { WEAPONS } from './config.js';
import { clamp, dist } from './util.js';
import { damageVehicle } from './vehicles.js';
import { hitPed } from './pedestrians.js';

/** The muzzle position of an actor, so a tracer starts at the barrel and not the belt. */
function muzzle(actor) {
  const off = 16;
  return { x: actor.x + Math.cos(actor.angle) * off, y: actor.y + Math.sin(actor.angle) * off };
}

export function spawnBullet(game, x, y, angle, speed, damage, owner, life = 0.7) {
  game.bullets.push({
    x, y, px: x, py: y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    damage, owner, life,
  });
}

/** Fire the weapon in hand. Returns true when a shot or a swing actually happened. */
export function fireWeapon(game, actor, isPlayer) {
  const key = actor.weapon || 'pistol';
  const w = WEAPONS[key] || WEAPONS.pistol;
  if (isPlayer && actor.cooldown > 0) return false;

  if (w.melee) {
    const reach = w.range;
    const ax = actor.x + Math.cos(actor.angle) * reach * 0.6;
    const ay = actor.y + Math.sin(actor.angle) * reach * 0.6;
    game.effects.ring(ax, ay, 'rgba(255,240,210,');
    game.audio.play('swing');
    for (const list of [game.peds, game.cops]) {
      for (const target of list) {
        if (target.dead) continue;
        if (dist(target.x, target.y, ax, ay) < reach * 0.75 + target.r) {
          hitPed(game, target, w.damage, Math.cos(actor.angle), Math.sin(actor.angle), isPlayer);
          game.effects.text(target.x, target.y - 20, 'HIT', '#ffd27a', 11);
          if (isPlayer) actor.meleeCooldown = w.cooldown;
          return true;
        }
      }
    }
    if (isPlayer) actor.meleeCooldown = w.cooldown;
    return true;
  }

  if (isPlayer) {
    if ((actor.ammo[key] ?? 0) <= 0) {
      game.audio.play('empty');
      game.notify('Out of ammo', '#e08a7a');
      actor.cooldown = 0.45;
      return false;
    }
    actor.ammo[key] -= 1;
    actor.cooldown = w.cooldown;
  }

  const m = muzzle(actor);
  const spread = w.spread;
  for (let k = 0; k < (w.pellets || 1); k += 1) {
    const a = actor.angle + (Math.random() - 0.5) * spread * 2;
    spawnBullet(game, m.x, m.y, a, w.speed, w.damage, isPlayer ? 'player' : (actor.owner || 'cop'), w.life);
  }
  game.effects.sparks(m.x, m.y, actor.angle, 4, 'rgba(255,226,150,');
  game.effects.ring(m.x, m.y, 'rgba(255,236,180,');
  game.audio.play('shot', key);
  game.effects.addShake(isPlayer ? 2.2 : 1);
  if (isPlayer) {
    game.stats.shotsFired += 1;
    if (game.witnessCrime) game.witnessCrime('gunfire', actor.x, actor.y);
    // Firing from a car is loud, and it counts.
    if (actor.inCar) game.effects.addShake(3);
  }
  return true;
}

/** Every bullet moves, then looks for flesh, then for a wall. */
export function stepBullets(game, dt) {
  const bullets = game.bullets;
  for (let i = bullets.length - 1; i >= 0; i -= 1) {
    const b = bullets[i];
    b.px = b.x; b.py = b.y;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { bullets.splice(i, 1); continue; }

    let hit = false;
    const check = (list) => {
      for (const t of list) {
        if (t.dead) continue;
        const r = t.r || 10;
        if (dist(b.x, b.y, t.x, t.y) < r + 3) {
          if (t === game.player) {
            if (b.owner === 'player') continue;
            game.damagePlayer(b.damage, 'bullet');
            game.effects.blood(t.x, t.y, Math.atan2(b.vy, b.vx), 5);
          } else {
            hitPed(game, t, b.damage, b.vx, b.vy, b.owner === 'player');
            if (b.owner === 'player') {
              game.stats.hits += 1;
              if (t.cop) game.witnessCrime('copShot', t.x, t.y);
            }
          }
          hit = true;
          return;
        }
      }
    };
    check([game.player]);
    if (!hit && (b.owner !== 'player' || !game.player.inCar)) check(game.cops);
    if (!hit) check(game.peds);
    if (hit) { bullets.splice(i, 1); continue; }

    for (const v of game.vehicles) {
      if (v.dead) continue;
      if (Math.abs(v.x - b.x) > 40 || Math.abs(v.y - b.y) > 40) continue;
      if (dist(b.x, b.y, v.x, v.y) < 24) {
        damageVehicle(v, b.damage * 0.55, game.effects);
        game.effects.sparks(b.x, b.y, Math.atan2(b.vy, b.vx), 4);
        if (b.owner === 'player') game.stats.hits += 1;
        if (v.type === 'police') game.witnessCrime('copShot', v.x, v.y);
        hit = true;
        break;
      }
    }
    if (hit) { bullets.splice(i, 1); continue; }

    if (game.world.blocked(b.x, b.y)) {
      game.effects.sparks(b.x, b.y, Math.atan2(-b.vy, -b.vx), 5);
      bullets.splice(i, 1);
    }
  }
}

/** Tracers: a bright line from where the bullet was to where it is, this frame. */
export function drawBullets(ctx, game) {
  ctx.lineWidth = 2;
  for (const b of game.bullets) {
    ctx.strokeStyle = b.owner === 'player' ? 'rgba(255,238,180,0.95)' : 'rgba(255,170,140,0.95)';
    ctx.beginPath();
    ctx.moveTo(b.px, b.py);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

/** Melee or shoot, whichever the player has equipped, on the frame the trigger is pulled. */
export function playerAttack(game, input) {
  const p = game.player;
  if (p.dead) return;
  const w = WEAPONS[p.weapon] || WEAPONS.fists;
  if (w.melee) {
    if (p.meleeCooldown <= 0) fireWeapon(game, p, true);
    return;
  }
  if (input.fire()) fireWeapon(game, p, true);
}

/** Damage done to a car by a fist or a bat: a dent, not a hole. */
export function dentVehicle(game, v, amount, angle) {
  damageVehicle(v, amount, game.effects);
  game.effects.sparks(v.x, v.y, angle, 3);
  game.effects.addShake(clamp(amount * 0.2, 0.5, 4));
}
