// The moving things in Solmar Bay: the player (on foot or behind the wheel),
// pedestrians on the sidewalks, traffic on the roads, and how a driven car
// handles. Police live in police.js; this file is the street, not the law.

import { CAR, LANE, PALETTE, PED, PLAYER, ROADS_X, ROADS_Y, ROAD_W, TRAFFIC_COUNT, WORLD } from './config.js';
import { angleDiff, approach, clamp, dist, randInt, randPick, randRange } from './random.js';
import { collideCircle, hitsBuilding, nearestRoadPoint, onRoad } from './city.js';

const HALF_ROAD = ROAD_W / 2;

/** A fresh player at (x, y), on foot, healthy, un-wanted trouble yet. */
export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, health: PLAYER.health,
    inCar: null, punchCooldown: 0, stagger: 0, invulnerable: 0,
    speed: 0, moving: false,
  };
}

/** One pedestrian: walks the sidewalks, flees from trouble. */
export function spawnPed(rng, city, nearX, nearY) {
  const axis = rng() < 0.5 ? 'v' : 'h';
  const dir = rng() < 0.5 ? 1 : -1;
  const side = rng() < 0.5 ? 1 : -1;
  let x;
  let y;
  if (axis === 'v') {
    const road = randPick(rng, ROADS_X);
    x = road + side * (HALF_ROAD + 14);
    y = nearY + randRange(rng, -450, 450);
  } else {
    const road = randPick(rng, ROADS_Y);
    x = nearX + randRange(rng, -450, 450);
    y = road + side * (HALF_ROAD + 14);
  }
  x = clamp(x, 20, WORLD.width - 20);
  y = clamp(y, 20, WORLD.height - 20);
  return {
    x, y, angle: axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    axis, dir, speed: PED.speed + randRange(rng, -PED.speedJitter, PED.speedJitter),
    color: randPick(rng, PALETTE.pedShirt), health: 100,
    knockX: 0, knockY: 0, flee: 0, walkPhase: randRange(rng, 0, Math.PI * 2),
  };
}

/** One traffic car on a road, driving its lane. */
export function createTrafficCar(rng, city, nearX, nearY, police = false) {
  const p = nearestRoadPoint(
    nearX + randRange(rng, -700, 700),
    nearY + randRange(rng, -700, 700),
  );
  const axis = rng() < 0.5 ? 'v' : 'h';
  const dir = rng() < 0.5 ? 1 : -1;
  const lane = axis === 'v'
    ? { x: p.x + dir * LANE, y: p.y }
    : { x: p.x, y: p.y + dir * LANE };
  return {
    x: lane.x, y: lane.y,
    angle: axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI),
    axis, dir, road: axis === 'v' ? p.x : p.y,
    speed: CAR.trafficSpeed + randRange(rng, -CAR.trafficSpeedJitter, CAR.trafficSpeedJitter),
    color: police ? PALETTE.policeCar : randPick(rng, PALETTE.car),
    kind: police ? 'police' : 'traffic',
    health: CAR.health, driver: true, turnLock: 0, stuck: 0,
  };
}

/**
 * Walk the pedestrians one step: along the sidewalk, turning at crossings,
 * fleeing when the player or a car gets violent nearby.
 */
export function updatePeds(peds, dt, city, rng, player, dangerX, dangerY, dangerR) {
  for (const ped of peds) {
    if (ped.health <= 0) continue;
    ped.walkPhase += dt * 6;
    // Knockback from a punch decays and carries the ped.
    if (ped.knockX !== 0 || ped.knockY !== 0) {
      ped.x += ped.knockX * dt;
      ped.y += ped.knockY * dt;
      ped.knockX = approach(ped.knockX, 0, 900 * dt);
      ped.knockY = approach(ped.knockY, 0, 900 * dt);
      const fixed = collideCircle(city, ped.x, ped.y, PED.radius);
      ped.x = fixed.x; ped.y = fixed.y;
      continue;
    }
    const dDanger = dist(ped.x, ped.y, dangerX, dangerY);
    if (dDanger < dangerR) ped.flee = 1.4;
    if (ped.flee > 0) {
      ped.flee -= dt;
      const a = Math.atan2(ped.y - dangerY, ped.x - dangerX);
      ped.angle = a;
      const nx = ped.x + Math.cos(a) * ped.speed * 2.1 * dt;
      const ny = ped.y + Math.sin(a) * ped.speed * 2.1 * dt;
      const fixed = collideCircle(city, nx, ny, PED.radius);
      ped.x = fixed.x; ped.y = fixed.y;
      continue;
    }
    const step = ped.speed * dt;
    let nx = ped.x + Math.cos(ped.angle) * step;
    let ny = ped.y + Math.sin(ped.angle) * step;
    // At a crossing, sometimes turn onto the other road.
    const nearCross = (ped.axis === 'v' && ROADS_Y.some((ry) => Math.abs(ny - ry) < 8))
      || (ped.axis === 'h' && ROADS_X.some((rx) => Math.abs(nx - rx) < 8));
    if (nearCross && rng() < dt * 0.9) {
      ped.axis = ped.axis === 'v' ? 'h' : 'v';
      ped.dir = rng() < 0.5 ? 1 : -1;
      const side = rng() < 0.5 ? 1 : -1;
      if (ped.axis === 'v') {
        ped.x = nearestRoadPoint(ped.x, ped.y).x + side * (HALF_ROAD + 14);
        ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        ped.y = nearestRoadPoint(ped.x, ped.y).y + side * (HALF_ROAD + 14);
        ped.angle = ped.dir > 0 ? 0 : Math.PI;
      }
      nx = ped.x; ny = ped.y;
    }
    // Keep to the sidewalk: if the step leaves the road area, bounce back.
    if (!onRoad(nx, ny) && !nearCross) {
      ped.dir *= -1;
      ped.angle += Math.PI;
    } else {
      const fixed = collideCircle(city, nx, ny, PED.radius);
      ped.x = fixed.x; ped.y = fixed.y;
    }
    ped.x = clamp(ped.x, PED.radius, WORLD.width - PED.radius);
    ped.y = clamp(ped.y, PED.radius, WORLD.height - PED.radius);
  }
}

/**
 * Drive the traffic one step: stay in lane, turn at crossings sometimes,
 * slow for the car ahead, respawn near the player when far away.
 */
export function updateTraffic(cars, dt, city, rng, player) {
  for (const car of cars) {
    if (car.kind === 'player' || car.health <= 0) continue;
    car.turnLock -= dt;
    // Slow for the car ahead in the same lane.
    let ahead = Infinity;
    for (const other of cars) {
      if (other === car || other.health <= 0) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const across = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (along > 0 && along < ahead && across < 30) ahead = along;
    }
    const want = ahead < 70 ? 0 : car.kind === 'police' ? car.speed : CAR.trafficSpeed;
    car.speed = approach(car.speed, want, 260 * dt);
    let nx = car.x + Math.cos(car.angle) * car.speed * dt;
    let ny = car.y + Math.sin(car.angle) * car.speed * dt;
    // At a crossing, sometimes turn.
    const crossX = ROADS_X.find((rx) => Math.abs(nx - rx) < 10);
    const crossY = ROADS_Y.find((ry) => Math.abs(ny - ry) < 10);
    if (car.turnLock <= 0 && ((car.axis === 'v' && crossY !== undefined) || (car.axis === 'h' && crossX !== undefined)) && rng() < 0.45) {
      car.turnLock = 1.2;
      const turnToVertical = car.axis === 'h';
      const newDir = rng() < 0.5 ? 1 : -1;
      if (turnToVertical) {
        car.axis = 'v'; car.dir = newDir; car.road = crossX;
        nx = crossX + newDir * LANE;
        car.angle = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        car.axis = 'h'; car.dir = newDir; car.road = crossY;
        ny = crossY + newDir * LANE;
        car.angle = newDir > 0 ? 0 : Math.PI;
      }
    }
    // Off the map or stuck: respawn on a road near the player.
    if (nx < 40 || nx > WORLD.width - 40 || ny < 40 || ny > WORLD.height - 40 || dist(nx, ny, player.x, player.y) > 1500) {
      const fresh = createTrafficCar(rng, city, player.x, player.y, car.kind === 'police');
      Object.assign(car, fresh);
      continue;
    }
    // Buildings stop a car: slide along them, mark a hit for the crunch sound.
    const before = { x: nx, y: ny };
    const fixed = collideCircle(city, nx, ny, 20);
    car.hitBuilding = dist(before.x, before.y, fixed.x, fixed.y) > 2 && car.speed > 60;
    if (car.hitBuilding) car.speed *= 0.4;
    car.x = fixed.x; car.y = fixed.y;
  }
  // Cars push each other apart so they never overlap.
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.health <= 0 || b.health <= 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01 && d < 44) {
        const push = (44 - d) / 2;
        const ux = dx / d;
        const uy = dy / d;
        a.x -= ux * push; a.y -= uy * push;
        b.x += ux * push; b.y += uy * push;
        if (a.kind === 'player') a.speed *= 0.85;
        if (b.kind === 'player') b.speed *= 0.85;
      }
    }
  }
}

/**
 * Drive the player's car one step: W/S for throttle and brake/reverse, A/D
 * steer. `move` is the screen-relative vector from input (y negative = W).
 * Returns true when the car crunched a building this step.
 */
export function drivePlayerCar(car, dt, move, city) {
  const throttle = -move.y; // W = forward
  const steer = move.x;
  const forward = car.speed >= 0 ? 1 : -1;
  if (throttle > 0) car.speed = approach(car.speed, CAR.maxSpeed, CAR.accel * dt);
  else if (throttle < 0) {
    car.speed = car.speed > 30 ? approach(car.speed, 0, CAR.brake * dt) : approach(car.speed, -CAR.reverseMax, CAR.accel * 0.6 * dt);
  } else {
    car.speed = approach(car.speed, 0, 240 * dt);
  }
  car.angle += steer * CAR.turn * (0.35 + 0.65 * Math.min(1, Math.abs(car.speed) / 260)) * forward * dt;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = { x: nx, y: ny };
  const fixed = collideCircle(city, nx, ny, 20);
  const crunched = dist(before.x, before.y, fixed.x, fixed.y) > 2 && Math.abs(car.speed) > 90;
  if (crunched) car.speed *= 0.45;
  car.x = fixed.x; car.y = fixed.y;
  return crunched;
}

/** How many working traffic cars exist (for the spawner to top up). */
export function trafficCount(cars) {
  return cars.filter((c) => c.kind === 'traffic' && c.health > 0).length;
}

/** All cars the player could steal: traffic cars near the player, with a driver. */
export function stealableCars(cars, player) {
  return cars.filter((c) => c.kind === 'traffic' && c.health > 0 && c.driver
    && dist(c.x, c.y, player.x, player.y) < PLAYER.enterRange);
}

export { TRAFFIC_COUNT };
export { hitsBuilding };
