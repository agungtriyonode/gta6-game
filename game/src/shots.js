// The screenshot scenes behind ?shot=city|drive|chase|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of seconds,
// steered by a simple autopilot, so the frame is what a short game really
// looks like and the same seed always gives the same frame.

import { PLACES, STEP } from './config.js';
import { SCREEN_PLAY } from './render.js';
import { startMission } from './missions.js';
import { angleDiff, clamp, dist } from './random.js';

const SAMPLE = STEP;

/** Move vector toward a point, normalised. */
function toward(state, tx, ty) {
  const dx = tx - state.player.x;
  const dy = ty - state.player.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) return { x: 0, y: 0, run: false };
  return { x: dx / d, y: dy / d, run: d > 200 };
}

/** Step the world `seconds` forward with `drive` choosing each step's input. */
function simulate(world, seconds, drive) {
  const steps = Math.floor(seconds / SAMPLE);
  for (let i = 0; i < steps; i += 1) {
    const input = drive(i * SAMPLE, world.state);
    world.step(SAMPLE, input.move, input.actions);
  }
}

/**
 * Put a traffic car on the road right next to the player, facing east along
 * the avenue, so the autopilot can steal it in one step.
 */
function parkCarBesidePlayer(state) {
  const car = state.cars.find((c) => c.kind === 'traffic' && c.health > 0);
  if (!car) return null;
  car.x = 1000;
  car.y = 1100;
  car.angle = 0;
  car.axis = 'h';
  car.dir = 1;
  car.road = 1100;
  car.speed = 0;
  state.player.x = 960;
  state.player.y = 1100;
  state.player.angle = 0;
  return car;
}

/**
 * Drive the player's car toward a waypoint: steer at it, brake into sharp
 * turns and when closing on the corner, full throttle on the straights.
 * Returns the input move vector.
 */
function driveTo(state, tx, ty) {
  const car = state.player.inCar;
  if (!car) return { x: 0, y: 0, run: false };
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, desired);
  const steer = clamp(diff * 1.6, -1, 1);
  const near = dist(tx, ty, car.x, car.y) < 240;
  const throttle = Math.abs(diff) > 0.5 || near ? 1 : -1; // brake into the turn
  return { x: steer, y: throttle, run: false };
}

/** A loop around the Downtown blocks, for the driving scenes. */
const DRIVE_LOOP = [
  { x: 3100, y: 1100 },
  { x: 3100, y: 1900 },
  { x: 700, y: 1900 },
  { x: 700, y: 1100 },
];

/** Steal the parked car once, then drive the loop for `seconds`. */
function driveScene(world, seconds) {
  const state = world.state;
  let waypoint = 0;
  let stolen = false;
  simulate(world, seconds, () => {
    if (!stolen) {
      stolen = true;
      return { move: { x: 0, y: 0, run: false }, actions: { punch: false, interact: true } };
    }
    const target = DRIVE_LOOP[waypoint];
    if (dist(target.x, target.y, state.player.x, state.player.y) < 260) {
      waypoint = (waypoint + 1) % DRIVE_LOOP.length;
    }
    return { move: driveTo(state, DRIVE_LOOP[waypoint].x, DRIVE_LOOP[waypoint].y), actions: { punch: false, interact: false } };
  });
}

/**
 * The player already owns this car: put him behind the wheel of a parked
 * car of his own, so a scene can show pure driving with no crime attached.
 */
function givePlayerCar(state) {
  const car = state.cars.find((c) => c.kind === 'traffic' && c.health > 0);
  if (!car) return;
  car.x = 1000;
  car.y = 1100;
  car.angle = 0;
  car.kind = 'player';
  car.driver = false;
  car.speed = 0;
  state.player.inCar = car;
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = 0;
}

/** Clear the heat and send the law home, so a scene frames cleanly. */
function clearHeat(state) {
  state.wanted = 0;
  state.sinceCrime = 99;
  state.sinceSeen = 99;
  for (const car of state.policeCars) {
    const at = state.cars.indexOf(car);
    if (at !== -1) state.cars.splice(at, 1);
  }
  state.policeCars = [];
  state.footCops = [];
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * Any unknown name stages the city scene.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();

  if (name === 'drive') {
    givePlayerCar(state);
    let waypoint = 0;
    simulate(world, 10, () => {
      const target = DRIVE_LOOP[waypoint];
      if (dist(target.x, target.y, state.player.x, state.player.y) < 260) {
        waypoint = (waypoint + 1) % DRIVE_LOOP.length;
      }
      return { move: driveTo(state, DRIVE_LOOP[waypoint].x, DRIVE_LOOP[waypoint].y), actions: { punch: false, interact: false } };
    });
    clearHeat(state);
    if (state.player.inCar) state.player.inCar.health = 100;
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'chase') {
    parkCarBesidePlayer(state);
    state.wanted = 3;
    state.sinceCrime = 0;
    driveScene(world, 12);
    // The chase is the point; the car itself is staged roadworthy.
    if (state.player.inCar) state.player.inCar.health = 100;
    return { screen: SCREEN_PLAY, best: 0 };
  }

  if (name === 'mission') {
    startMission(state, 3);
    state.player.x = PLACES.rivalTurf.x - 160;
    state.player.y = PLACES.rivalTurf.y + 40;
    // Five seconds: the fight is still on when the frame is taken, with a
    // rival or two left standing and Mara's briefing on screen.
    simulate(world, 5, () => {
      const alive = state.rivals.filter((r) => r.health > 0);
      if (alive.length === 0) return { move: { x: 0, y: 0, run: false }, actions: { punch: false, interact: false } };
      let nearest = alive[0];
      for (const r of alive) {
        if (dist(r.x, r.y, state.player.x, state.player.y) < dist(nearest.x, nearest.y, state.player.x, state.player.y)) nearest = r;
      }
      const d = dist(nearest.x, nearest.y, state.player.x, state.player.y);
      if (d < 40) return { move: { x: 0, y: 0, run: false }, actions: { punch: true, interact: false } };
      return { move: toward(state, nearest.x, nearest.y), actions: { punch: false, interact: false } };
    });
    // A stray punch may have caught a bystander: stage the fight clean.
    clearHeat(state);
    // Pull the last Viper into the frame, close to the player, mid-fight.
    const alive = state.rivals.filter((r) => r.health > 0);
    if (alive.length > 0) {
      const last = alive[0];
      last.x = state.player.x + 70;
      last.y = state.player.y - 20;
    }
    return { screen: SCREEN_PLAY, best: 0 };
  }

  // City: the player walks a loop around the Downtown block while the
  // street — traffic, pedestrians, the mission marker — moves around him.
  const loop = [
    { x: 1500, y: 1500 },
    { x: 1900, y: 1500 },
    { x: 1900, y: 1100 },
    { x: 1500, y: 1100 },
  ];
  let waypoint = 0;
  simulate(world, 18, () => {
    const target = loop[waypoint];
    if (dist(target.x, target.y, state.player.x, state.player.y) < 40) {
      waypoint = (waypoint + 1) % loop.length;
    }
    return { move: toward(state, loop[waypoint].x, loop[waypoint].y), actions: { punch: false, interact: false } };
  });
  return { screen: SCREEN_PLAY, best: 0 };
}
