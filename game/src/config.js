// Numbers the whole game agrees on: the city grid, the palette, weapon tables, the wanted
// scale and the player's numbers. Everything else imports from here so one edit retunes the
// game rather than eight files disagreeing.

/** One simulation step, in seconds. The loop runs the world in these, never in frame time. */
export const STEP = 1 / 60;

// --- City geometry (world units are pixels at zoom 1) -------------------------------
export const BLOCK = 300;          // a city block, sidewalk included
export const ROAD = 116;           // a road, kerb to kerb: two lanes each way
export const PITCH = BLOCK + ROAD; // block pitch, centre line to centre line
export const GRID_X = 8;           // blocks east-west
export const GRID_Y = 8;           // blocks north-south
export const CITY_W = GRID_X * PITCH + ROAD;
export const CITY_H = GRID_Y * PITCH + ROAD;
export const BEACH = 190;          // sand strip east of the last road
export const SEA = 1400;           // sea beyond the sand
export const WORLD_W = CITY_W + BEACH + SEA;
export const WORLD_H = CITY_H;
export const SIDEWALK = 17;

/** Centre line of road column i, and of road row j. */
export const roadX = (i) => ROAD / 2 + i * PITCH;
export const roadY = (j) => ROAD / 2 + j * PITCH;

// --- Palette: a sun-bleached coastal city at golden hour ---------------------------
export const C = {
  asphalt: '#4b4650',
  asphaltDark: '#433f49',
  lane: '#d9cfae',
  kerb: '#b9ac93',
  sidewalk: '#d3c8b0',
  sidewalkAlt: '#c9bda4',
  sand: '#e7d3a1',
  sandDark: '#d4bd8a',
  sea: '#2b8fa0',
  seaDeep: '#146173',
  seaFoam: '#a9dcd8',
  grass: '#6e9a52',
  grassDark: '#5d8746',
  path: '#ccbf9e',
  shadow: 'rgba(38,26,48,0.26)',
  warm: 'rgba(255,168,92,0.07)',
  outline: 'rgba(28,20,32,0.55)',
  roof: ['#e6dac2', '#d9c3a4', '#c8845f', '#e0a79f', '#a9cbae', '#8fb1c4', '#d8b06a', '#c8c2d0'],
  wall: ['#c2b294', '#b09a78', '#a9674a', '#c08379', '#8aa88f', '#71919f', '#b8914f', '#a49fb0'],
  roofDark: ['#cdc1a9', '#c0aa8b', '#ad6f4e', '#c78f88', '#93b298', '#7a9aab', '#c09a59', '#b0aab8'],
  glass: ['#7fa8bd', '#88b2c6', '#6d99b0'],
  cars: ['#e8e2d2', '#d9534f', '#3fa7a0', '#e8b64c', '#6a7fc4', '#c9c9d2', '#8e5fb0', '#69a35e', '#e0834a', '#2f3b48'],
  skin: ['#8a5a3b', '#b1794f', '#d9a06d', '#6b432c', '#c98f61'],
  shirt: ['#e8e2d2', '#3fa7a0', '#d9534f', '#e8b64c', '#6a7fc4', '#c9c9d2', '#8e5fb0', '#f0f0e8'],
};

// --- The player -------------------------------------------------------------------
export const PLAYER = {
  radius: 9,
  walk: 112,
  run: 196,
  accel: 900,
  friction: 8.5,
  maxHealth: 100,
  respawnInvuln: 2.2,
};

// --- Weapons: melee and two guns, each with its own feel -------------------------
export const WEAPONS = {
  fists: { name: 'Fists', melee: true, range: 30, damage: 22, cooldown: 0.34, spread: 0, ammo: Infinity },
  pistol: { name: 'Pistol', melee: false, damage: 26, cooldown: 0.22, spread: 0.035, speed: 1500, life: 0.7, ammo: 60, pellets: 1 },
  smg: { name: 'SMG', melee: false, damage: 15, cooldown: 0.085, spread: 0.075, speed: 1400, life: 0.6, ammo: 180, pellets: 1 },
  shotgun: { name: 'Shotgun', melee: false, damage: 13, cooldown: 0.72, spread: 0.16, speed: 1150, life: 0.35, ammo: 24, pellets: 6 },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

// --- Vehicles: mass, top speed, how hard they turn, how much they bruise ----------
export const CAR_TYPES = {
  sedan: { len: 50, wid: 25, mass: 1.0, top: 330, accel: 210, turn: 2.5, grip: 0.86, hp: 100, value: 900 },
  coupe: { len: 47, wid: 24, mass: 0.9, top: 390, accel: 265, turn: 2.8, grip: 0.88, hp: 90, value: 1800 },
  sport: { len: 52, wid: 25, mass: 0.95, top: 480, accel: 320, turn: 2.6, grip: 0.9, hp: 85, value: 4600 },
  van: { len: 62, wid: 29, mass: 1.6, top: 260, accel: 150, turn: 1.9, grip: 0.8, hp: 150, value: 1200 },
  taxi: { len: 51, wid: 26, mass: 1.0, top: 335, accel: 215, turn: 2.5, grip: 0.86, hp: 100, value: 950 },
  police: { len: 52, wid: 26, mass: 1.15, top: 420, accel: 300, turn: 2.7, grip: 0.9, hp: 130, value: 0 },
  muscle: { len: 54, wid: 26, mass: 1.2, top: 440, accel: 300, turn: 2.4, grip: 0.82, hp: 120, value: 3200 },
};
/** The car mission one asks for by name. */
export const HERO_CAR = 'sport';

// --- Wanted -----------------------------------------------------------------------
export const WANTED = { maxStars: 5, decayDelay: 4.5, decayRate: 0.115, copCap: [0, 1, 2, 3, 4, 5] };
export const AUDIO_KEY = 'velamar.settings.v1';
export const SAVE_KEY = 'velamar.save.v1';
