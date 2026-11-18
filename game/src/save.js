// The save file: a small JSON record in localStorage holding the purse, the body, the job
// board and where the player left the city. Writing is guarded, because a private window
// refuses storage and the game must still play.
import { SAVE_KEY } from './config.js';

export function createSave(game) {
  const save = {
    available: true,
    lastWrite: 0,

    read() {
      try {
        const raw = window.localStorage.getItem(SAVE_KEY);
        if (!raw) return null;
        const data = JSON.parse(raw);
        if (!data || data.v !== 1) return null;
        return data;
      } catch {
        save.available = false;
        return null;
      }
    },

    has() { return !!save.read(); },

    /** Write the current state. Returns true when it stuck. */
    checkpoint(quiet = false) {
      const p = game.player;
      const data = {
        v: 1,
        at: Date.now(),
        money: Math.round(game.economy.money),
        health: Math.round(p.health),
        armor: Math.round(p.armor),
        x: Math.round(p.x),
        y: Math.round(p.y),
        angle: p.angle,
        weapon: p.weapon,
        ammo: { pistol: p.ammo.pistol | 0, smg: p.ammo.smg | 0, shotgun: p.ammo.shotgun | 0 },
        completed: [...game.missions.completed],
        wanted: game.wanted.stars,
        playtime: Math.round(game.time),
        stats: { ...game.stats },
        seed: game.world.seed,
      };
      try {
        window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
        save.lastWrite = performance.now();
        if (!quiet) game.notify('Game saved', '#9fd8a8');
        return true;
      } catch {
        save.available = false;
        if (!quiet) game.notify('Save failed: storage is off', '#e08a7a');
        return false;
      }
    },

    /** Put the player back where the save left them. Returns false when there is no save. */
    restore() {
      const data = save.read();
      if (!data) return false;
      const p = game.player;
      game.economy.money = data.money || 0;
      game.economy.shown = data.money || 0;
      p.health = data.health || 100;
      p.armor = data.armor || 0;
      p.x = data.x || 260;
      p.y = data.y || 260;
      p.angle = data.angle || 0;
      p.weapon = data.weapon && data.ammo ? data.weapon : 'pistol';
      p.ammo.pistol = data.ammo?.pistol ?? 48;
      p.ammo.smg = data.ammo?.smg ?? 0;
      p.ammo.shotgun = data.ammo?.shotgun ?? 0;
      p.inCar = null;
      p.dead = false;
      game.missions.completed = new Set(data.completed || []);
      game.time = data.playtime || 0;
      Object.assign(game.stats, data.stats || {});
      game.wanted.heat = 0;
      game.wanted.stars = 0;
      return true;
    },

    clear() {
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* nothing to do */ }
    },
  };
  return save;
}
