// The game's rules and state, with no drawing and no browser in it: the
// player, the street, the law, the story and the money. step() advances one
// fixed step and returns what happened as bit flags, so the caller can react
// (sounds, screens, saves) without the world knowing about them.

import { CAR, MONEY_START, PED, PLACES, PLAYER, TRAFFIC_COUNT, WANTED, WORLD } from './config.js';
import { buildCity, collideCircle, districtAt } from './city.js';
import { createPlayer, createTrafficCar, drivePlayerCar, spawnPed, stealableCars, updatePeds, updateTraffic } from './entities.js';
import { addWanted, updatePolice } from './police.js';
import { punch, ramDamage } from './combat.js';
import { MISSIONS, missionObjective, startMission } from './missions.js';
import { clamp, dist, randRange } from './random.js';

export const EVENT_CRIME = 1;
export const EVENT_CASH = 2;
export const EVENT_MISSION = 4;
export const EVENT_CAR_DEAD = 8;
export const EVENT_HURT = 16;
export const EVENT_BUSTED = 32;
export const EVENT_MISSION_DONE = 64;
export const EVENT_FAILED = 128;

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    city, random,
    player: createPlayer(PLACES.garage.x, PLACES.garage.y - 80),
    cars: [], peds: [],
    policeCars: [], footCops: [], rivals: [],
    pickups: [],
    money: MONEY_START,
    wanted: 0, sinceCrime: 99, sinceSeen: 99, decayTimer: 0,
    missionIndex: -1, mission: null, missionLines: [], missionLineAt: 0, missionLineTimer: 0,
    missionTarget: null, missionTimer: 0, packageHeld: false, packageTimer: 0,
    vanStolen: false, van: null,
    storyDone: false, bustedCount: 0,
    elapsed: 0, clockMinutes: 9 * 60,
    district: 'Downtown',
  };

  function reset() {
    state.player = createPlayer(PLACES.garage.x, PLACES.garage.y - 80);
    state.cars = [];
    state.peds = [];
    state.policeCars = [];
    state.footCops = [];
    state.rivals = [];
    state.pickups = [];
    state.money = MONEY_START;
    state.wanted = 0; state.sinceCrime = 99; state.sinceSeen = 99; state.decayTimer = 0;
    state.missionIndex = -1; state.mission = null; state.missionLines = [];
    state.missionTarget = null; state.missionTimer = 0;
    state.packageHeld = false; state.packageTimer = 0;
    state.vanStolen = false; state.van = null;
    state.storyDone = false; state.bustedCount = 0;
    state.elapsed = 0; state.clockMinutes = 9 * 60;
    for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
      state.cars.push(createTrafficCar(random, city, state.player.x, state.player.y));
    }
    for (let i = 0; i < PED.count; i += 1) {
      state.peds.push(spawnPed(random, city, state.player.x, state.player.y));
    }
    startMission(state, 0);
  }

  function dropCash(x, y, amount) {
    state.pickups.push({ x, y, amount, ttl: 25 });
  }

  function tryPunch() {
    const p = state.player;
    if (p.punchCooldown > 0 || p.inCar) return 0;
    p.punchCooldown = PLAYER.punchCooldown;
    const targets = [];
    for (const ped of state.peds) if (ped.health > 0) targets.push({ ...ped, kind: 'ped', ref: ped });
    for (const cop of state.footCops) if (cop.health > 0) targets.push({ ...cop, kind: 'cop', ref: cop });
    for (const rival of state.rivals) if (rival.health > 0) targets.push({ ...rival, kind: 'rival', ref: rival });
    const hit = punch(p.x, p.y, p.angle, targets);
    if (!hit) return 0;
    const ref = hit.ref;
    ref.health = hit.health;
    ref.x = hit.x; ref.y = hit.y;
    ref.knockX = hit.knockX; ref.knockY = hit.knockY;
    if (hit.kind === 'ped') {
      addWanted(state, WANTED.punchPed);
      if (ref.health <= 0) dropCash(ref.x, ref.y, 20 + Math.floor(random() * 40));
      return EVENT_CRIME;
    }
    if (hit.kind === 'cop') {
      addWanted(state, WANTED.punchCop);
      return EVENT_CRIME;
    }
    return 0; // rivals are a fair fight — no heat for it
  }

  function tryInteract() {
    const p = state.player;
    if (p.inCar) {
      // Step out beside the car; it stays parked as the player's car.
      const car = p.inCar;
      p.inCar = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
      const fixed = collideCircle(city, p.x, p.y, PLAYER.radius);
      p.x = fixed.x; p.y = fixed.y;
      p.angle = car.angle;
      return 0;
    }
    // The player's own parked car first — no crime to take it back.
    for (const car of state.cars) {
      if (car.kind === 'player' && car.health > 0 && dist(car.x, car.y, p.x, p.y) < PLAYER.enterRange) {
        p.inCar = car;
        p.x = car.x; p.y = car.y;
        return 0;
      }
    }
    const near = stealableCars(state.cars, p);
    if (near.length === 0) return 0;
    const car = near[0];
    car.kind = 'player';
    car.driver = false;
    car.speed = 0;
    p.inCar = car;
    p.x = car.x; p.y = car.y;
    addWanted(state, WANTED.stealCar);
    return EVENT_CRIME;
  }

  function stepPlayer(dt, move, actions) {
    const p = state.player;
    p.punchCooldown = Math.max(0, p.punchCooldown - dt);
    p.invulnerable = Math.max(0, p.invulnerable - dt);
    p.stagger = Math.max(0, p.stagger - dt);
    let events = 0;
    if (actions.punch) events |= tryPunch();
    if (actions.interact) events |= tryInteract();
    if (p.stagger > 0) return events;
    if (p.inCar) {
      const car = p.inCar;
      const crunched = drivePlayerCar(car, dt, move, city);
      if (crunched) {
        car.health -= 8;
        events |= EVENT_HURT;
        if (car.health <= 0) events |= EVENT_CAR_DEAD;
      }
      p.x = car.x; p.y = car.y; p.angle = car.angle;
      p.speed = Math.abs(car.speed);
      // Running over pedestrians is a crime, and it pays in dropped cash.
      for (const ped of state.peds) {
        if (ped.health <= 0) continue;
        if (dist(ped.x, ped.y, car.x, car.y) < 30 && Math.abs(car.speed) > 140) {
          ped.health = 0;
          ped.knockX = Math.cos(car.angle) * 420;
          ped.knockY = Math.sin(car.angle) * 420;
          addWanted(state, WANTED.runOverPed);
          dropCash(ped.x, ped.y, 15 + Math.floor(random() * 35));
          events |= EVENT_CRIME;
        }
      }
      return events;
    }
    const speed = move.x !== 0 || move.y !== 0 ? (move.run ? PLAYER.run : PLAYER.walk) : 0;
    p.moving = speed > 0;
    p.speed = speed;
    if (speed > 0) p.angle = Math.atan2(move.y, move.x);
    const nx = p.x + move.x * speed * dt;
    const ny = p.y + move.y * speed * dt;
    const fixed = collideCircle(city, nx, ny, PLAYER.radius);
    p.x = fixed.x; p.y = fixed.y;
    // Walking into a car shoves the player out of it.
    for (const car of state.cars) {
      if (car.health <= 0) continue;
      const d = dist(p.x, p.y, car.x, car.y);
      if (d < 30 && d > 0.01) {
        const push = 30 - d;
        p.x += ((p.x - car.x) / d) * push;
        p.y += ((p.y - car.y) / d) * push;
        const f2 = collideCircle(city, p.x, p.y, PLAYER.radius);
        p.x = f2.x; p.y = f2.y;
      }
    }
    // Pick up cash on the ground.
    for (const pick of state.pickups) {
      if (pick.ttl > 0 && dist(p.x, p.y, pick.x, pick.y) < 30) {
        state.money += pick.amount;
        pick.ttl = 0;
        events |= EVENT_CASH;
      }
    }
    return events;
  }

  function stepRivals(dt) {
    const p = state.player;
    for (const r of state.rivals) {
      if (r.health <= 0) continue;
      r.touchCooldown -= dt;
      r.walkPhase += dt * 8;
      if (r.knockX !== 0 || r.knockY !== 0) {
        r.x += r.knockX * dt;
        r.y += r.knockY * dt;
        r.knockX = approach(r.knockX, 0, 900 * dt);
        r.knockY = approach(r.knockY, 0, 900 * dt);
        const fixed = collideCircle(city, r.x, r.y, 12);
        r.x = fixed.x; r.y = fixed.y;
        continue;
      }
      const d = dist(r.x, r.y, p.x, p.y);
      if (d < 420 && !p.inCar) {
        const a = Math.atan2(p.y - r.y, p.x - r.x);
        r.angle = a;
        const nx = r.x + Math.cos(a) * r.speed * dt;
        const ny = r.y + Math.sin(a) * r.speed * dt;
        const fixed = collideCircle(city, nx, ny, 12);
        r.x = fixed.x; r.y = fixed.y;
        if (d < 30 && r.touchCooldown <= 0 && p.invulnerable <= 0) {
          r.touchCooldown = 0.8;
          p.health -= 8;
          p.invulnerable = 0.5;
          p.stagger = 0.35;
        }
      }
    }
  }

  /** Approach helper kept local so this file stands alone. */
  function approach(v, target, step) {
    if (v < target) return Math.min(target, v + step);
    if (v > target) return Math.max(target, v - step);
    return v;
  }

  /**
   * One fixed step. `move` is {x, y, run} from input; `actions` is
   * {punch, interact}. Returns EVENT_* flags for the caller.
   */
  function step(dt, move, actions) {
    let events = 0;
    state.elapsed += dt;
    state.clockMinutes += dt / 1.5;

    events |= stepPlayer(dt, move, actions);

    // The street keeps moving: peds flee the player's violence, traffic flows.
    const dangerR = state.player.inCar ? 130 : 80;
    updatePeds(state.peds, dt, city, random, state.player, state.player.x, state.player.y, dangerR);
    updateTraffic(state.cars, dt, city, random, state.player);
    // Top the street back up: fresh cars and fresh faces near the player.
    state.cars = state.cars.filter((c) => c.health > 0 || c.kind === 'player');
    state.peds = state.peds.filter((ped) => ped.health > 0);
    while (state.cars.filter((c) => c.kind === 'traffic').length < TRAFFIC_COUNT) {
      state.cars.push(createTrafficCar(random, city, state.player.x, state.player.y));
    }
    while (state.peds.length < PED.count) {
      state.peds.push(spawnPed(random, city, state.player.x, state.player.y));
    }
    for (const pick of state.pickups) pick.ttl -= dt;
    state.pickups = state.pickups.filter((pick) => pick.ttl > 0);

    // The van for the last job waits at the Marina until the player takes it.
    if (state.mission && state.mission.id === 'score' && !state.van) {
      const van = createTrafficCar(random, city, PLACES.marina.x, PLACES.marina.y);
      van.x = PLACES.marina.x;
      van.y = PLACES.marina.y;
      van.color = '#e8e8e8';
      van.speed = 0;
      state.van = van;
      state.cars.push(van);
    }

    events |= updatePolice(state, dt, city, random);
    stepRivals(dt);

    // Slow recovery when the law is not after the player.
    if (state.wanted === 0 && state.player.health > 0 && state.player.health < PLAYER.health) {
      state.player.health = Math.min(PLAYER.health, state.player.health + 2.5 * dt);
    }

    // Mission dialogue lines roll, one every few seconds.
    if (state.missionLines.length > 0 && state.missionLineAt < state.missionLines.length) {
      state.missionLineTimer += dt;
      if (state.missionLineTimer > 4) {
        state.missionLineTimer = 0;
        state.missionLineAt += 1;
      }
    }

    // The story: check the current mission, pay out, start the next one.
    if (state.mission && !state.storyDone) {
      const result = state.mission.update(state, dt);
      if (result === 'done') {
        state.money += state.mission.reward;
        events |= EVENT_MISSION_DONE;
        const next = state.missionIndex + 1;
        if (next >= MISSIONS.length) {
          state.storyDone = true;
          state.mission = null;
          state.missionTarget = null;
        } else {
          startMission(state, next);
        }
      } else if (result === 'failed') {
        events |= EVENT_FAILED;
        startMission(state, state.missionIndex);
      }
    }

    state.district = districtAt(state.player.x, state.player.y);
    if (state.player.health <= 0 && !state.player.inCar) events |= EVENT_BUSTED;
    return events;
  }

  /** After a bust: the hospital, a fine, a clean slate. */
  function busted() {
    const p = state.player;
    state.bustedCount += 1;
    state.money = Math.max(0, state.money - 150);
    p.health = PLAYER.health;
    p.inCar = null;
    p.x = PLACES.hospital.x;
    p.y = PLACES.hospital.y + 80;
    p.angle = -Math.PI / 2;
    p.invulnerable = 2;
    state.wanted = 0;
    state.sinceCrime = 99;
    state.sinceSeen = 99;
    state.policeCars = [];
    state.footCops = [];
    state.cars = state.cars.filter((c) => c.kind === 'traffic');
  }

  /** After the car is wrecked: the player climbs out, shaken but alive. */
  function carWrecked() {
    const p = state.player;
    const car = p.inCar;
    if (!car) return;
    p.inCar = null;
    p.health = Math.max(30, p.health);
    p.x = car.x + 50;
    p.y = car.y + 50;
    const fixed = collideCircle(city, p.x, p.y, PLAYER.radius);
    p.x = fixed.x; p.y = fixed.y;
    state.cars = state.cars.filter((c) => c !== car);
  }

  reset();
  return {
    state, reset, step, busted, carWrecked,
    objective: () => missionObjective(state),
    clock: () => {
      const total = Math.floor(state.clockMinutes) % (24 * 60);
      const h = Math.floor(total / 60);
      const m = total % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },
  };
}

// Keep the ram helper reachable for the caller (a hard hit shakes the screen).
export { ramDamage };
