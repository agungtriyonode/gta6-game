// Solmar Bay — every tuning number, colour and name in one place.
// The game is a top-down open-world crime game in a sun-soaked coastal city
// of its own: no Rockstar names, maps, characters or art anywhere.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display rate. */
export const STEP = 1 / 60;

/** World size in world pixels; the camera follows the player inside it. */
export const WORLD = { width: 3400, height: 2600 };

/** Road grid: vertical roads at these x, horizontal at these y, all ROAD_W wide. */
export const ROADS_X = [300, 700, 1100, 1500, 1900, 2300, 2700, 3100];
export const ROADS_Y = [300, 700, 1100, 1500, 1900, 2300];
export const ROAD_W = 110;
export const LANE = 28; // distance from a road centre line to a driving lane

export const PLAYER = {
  radius: 14,
  walk: 235,
  run: 335,
  health: 100,
  punchRange: 34,
  punchDamage: 34,
  punchCooldown: 0.38,
  enterRange: 64,
};

export const CAR = {
  width: 48,
  height: 24,
  maxSpeed: 560,
  accel: 420,
  brake: 700,
  reverseMax: 180,
  turn: 2.6,
  health: 100,
  trafficSpeed: 150,
  trafficSpeedJitter: 55,
};

export const PED = {
  radius: 11,
  speed: 55,
  speedJitter: 25,
  count: 42,
};

export const TRAFFIC_COUNT = 18;

export const POLICE = {
  carSpeed: 470,
  footSpeed: 245,
  touchDamage: 9,
  touchCooldown: 0.7,
  bustRange: 26,
  spawnDistance: 700,
  maxCars: 4,
  maxFoot: 6,
};

export const WANTED = {
  stealCar: 1,
  punchPed: 1,
  runOverPed: 2,
  punchCop: 2,
  max: 5,
  decayDelay: 14, // seconds with no crime and no police nearby before a star drops
  decayEvery: 9, // seconds per further star
  hideRadius: 520, // no police within this radius counts as "out of sight"
};

/** Money the player starts with, and what each mission pays. */
export const MONEY_START = 120;

/** Named places the story and the minimap point at. */
export const PLACES = {
  garage: { name: "Mara's Garage", x: 1500, y: 1100 },
  docks: { name: 'The Docks', x: 3100, y: 1500 },
  pier: { name: 'Sunset Pier', x: 1100, y: 2360 },
  hideout: { name: 'The Hideout', x: 300, y: 300 },
  rivalTurf: { name: 'Rival Turf', x: 2700, y: 300 },
  hospital: { name: 'Solmar General', x: 1900, y: 700 },
  marina: { name: 'Marina', x: 2300, y: 2360 },
  plaza: { name: 'Plaza del Sol', x: 1500, y: 1500 },
};

export const PALETTE = {
  water: '#1f8fb4',
  waterDeep: '#177294',
  sand: '#e8d29a',
  grass: '#7fae62',
  grassDark: '#6b9c52',
  road: '#3c3f47',
  roadEdge: '#2e3138',
  lane: '#e8e3c8',
  sidewalk: '#b9b3a4',
  block: '#a89f8d',
  building: ['#e07856', '#e8a34c', '#7fb3a8', '#c96f8e', '#8fa8d8', '#d8c25a', '#9a7fc9', '#6fae7e'],
  roof: '#00000022',
  player: '#ff7a1a',
  playerDark: '#c85a10',
  pedShirt: ['#e8e8e8', '#5a8fd8', '#d85a5a', '#5ad88a', '#e8c85a', '#b45ad8', '#5ad8d2'],
  car: ['#d84a4a', '#4a7fd8', '#e8d84a', '#7ad84a', '#c9c9c9', '#4ad8c9', '#d88a4a', '#8a5ad8'],
  policeCar: '#e8e8e8',
  policeDark: '#1c2f4a',
  cop: '#1c2f4a',
  star: '#ffd23e',
  hudBg: '#10141bcc',
  hudText: '#f2f0e8',
  hudMuted: '#a8a294',
  cash: '#7ee081',
  danger: '#ff5a4a',
  marker: '#ffd23e',
  minimapBg: '#10141bd9',
  title: '#ffd23e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** localStorage keys: one save slot for the story, one for the best haul. */
export const SAVE_KEY = 'solmar-bay.save.v1';
export const BEST_KEY = 'solmar-bay.best.v1';
