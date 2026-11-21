// The law in Solmar Bay: a wanted level from 0 to 5 stars, police cars and
// foot cops who spawn at the edge of sight and chase the player, and the
// busted state when they catch him. Crimes raise the heat; laying low lets
// it cool off.

import { POLICE, WANTED } from './config.js';
import { angleDiff, approach, clamp, dist, randRange } from './random.js';
import { createTrafficCar } from './entities.js';
import { collideCircle } from './city.js';

/**
 * Add heat for a crime: `stars` more wanted, and the "last crime" clock
 * restarts so the level cannot decay right away.
 */
export function addWanted(state, stars) {
  state.wanted = clamp(state.wanted + stars, 0, WANTED.max);
  state.sinceCrime = 0;
  state.sinceSeen = 0;
}

/** How many police cars / foot cops the current wanted level calls for. */
export function policeQuota(wanted) {
  return {
    cars: wanted === 0 ? 0 : Math.min(POLICE.maxCars, wanted),
    foot: wanted === 0 ? 0 : Math.min(POLICE.maxFoot, wanted + 1),
  };
}

/**
 * One step of the law: spawn what the wanted level calls for, steer the
 * police cars at the player, march the foot cops at him, and cool the wanted
 * level down when the player has been quiet and unseen. Returns event flags
 * (see world.js) for busted / car destroyed.
 */
export function updatePolice(state, dt, city, rng) {
  const { player, policeCars, footCops, cars } = state;
  let events = 0;
  state.sinceCrime += dt;
  state.sinceSeen += dt;

  // Any police close enough to see the player resets the "unseen" clock.
  const nearest = nearestPoliceDistance(state);
  if (nearest < WANTED.hideRadius) state.sinceSeen = 0;

  // Cool down: no crime for a while, unseen, and the stars drop one by one.
  if (state.wanted > 0 && state.sinceCrime > WANTED.decayDelay && state.sinceSeen > 3) {
    state.decayTimer += dt;
    if (state.decayTimer >= WANTED.decayEvery) {
      state.decayTimer = 0;
      state.wanted -= 1;
    }
  } else {
    state.decayTimer = 0;
  }

  const quota = policeQuota(state.wanted);
  // Spawn police cars at the edge of sight, on a road near the player.
  while (policeCars.length < quota.cars) {
    const car = createTrafficCar(rng, city, player.x, player.y, true);
    const a = Math.atan2(player.y - car.y, player.x - car.x);
    car.x = player.x + Math.cos(a + randRange(rng, -0.5, 0.5)) * POLICE.spawnDistance;
    car.y = player.y + Math.sin(a + randRange(rng, -0.5, 0.5)) * POLICE.spawnDistance;
    car.x = clamp(car.x, 60, 3400 - 60);
    car.y = clamp(car.y, 60, 2600 - 60);
    car.speed = POLICE.carSpeed * 0.7;
    car.siren = 0;
    policeCars.push(car);
    cars.push(car);
  }
  while (policeCars.length > quota.cars) {
    const gone = policeCars.shift();
    const at = cars.indexOf(gone);
    if (at !== -1) cars.splice(at, 1);
  }
  // Foot cops step out of a nearby police car, or jog in from the edge.
  while (footCops.length < quota.foot) {
    const anchor = policeCars.length > 0 ? policeCars[0] : null;
    const x = anchor ? anchor.x + randRange(rng, -40, 40) : player.x + randRange(rng, -600, 600);
    const y = anchor ? anchor.y + randRange(rng, -40, 40) : player.y + randRange(rng, -600, 600);
    footCops.push({
      x: clamp(x, 30, 3400 - 30), y: clamp(y, 30, 2600 - 30),
      angle: 0, speed: POLICE.footSpeed, health: 100,
      knockX: 0, knockY: 0, touchCooldown: 0, walkPhase: randRange(rng, 0, Math.PI * 2),
    });
  }
  while (footCops.length > quota.foot) footCops.pop();

  // Police cars steer at the player and try to ram him.
  for (const car of policeCars) {
    if (car.health <= 0) continue;
    car.ramCooldown = Math.max(0, (car.ramCooldown || 0) - dt);
    const target = Math.atan2(player.y - car.y, player.x - car.x);
    car.angle += clamp(angleDiff(car.angle, target), -2.4 * dt, 2.4 * dt);
    car.speed = approach(car.speed, POLICE.carSpeed, 300 * dt);
    car.siren += dt;
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const fixed = collideCircle(city, nx, ny, 20);
    car.x = fixed.x; car.y = fixed.y;
    const d = dist(car.x, car.y, player.x, player.y);
    if (d < 46 && car.ramCooldown <= 0) {
      car.ramCooldown = 1.2; // one solid ram per second, not a shredder
      if (player.inCar) {
        player.inCar.health -= 8;
        player.inCar.speed *= 0.8;
        if (player.inCar.health <= 0) events |= 8; // EVENT_CAR_DEAD
      } else if (player.invulnerable <= 0) {
        player.health -= POLICE.touchDamage;
        player.invulnerable = 0.8;
        events |= 16; // EVENT_HURT
      }
    }
  }

  // Foot cops run at the player and swing when they reach him.
  for (const cop of footCops) {
    if (cop.health <= 0) continue;
    cop.touchCooldown -= dt;
    cop.walkPhase += dt * 9;
    if (cop.knockX !== 0 || cop.knockY !== 0) {
      cop.x += cop.knockX * dt;
      cop.y += cop.knockY * dt;
      cop.knockX = approach(cop.knockX, 0, 900 * dt);
      cop.knockY = approach(cop.knockY, 0, 900 * dt);
      const fixed = collideCircle(city, cop.x, cop.y, 12);
      cop.x = fixed.x; cop.y = fixed.y;
      continue;
    }
    const a = Math.atan2(player.y - cop.y, player.x - cop.x);
    cop.angle = a;
    const nx = cop.x + Math.cos(a) * cop.speed * dt;
    const ny = cop.y + Math.sin(a) * cop.speed * dt;
    const fixed = collideCircle(city, nx, ny, 12);
    cop.x = fixed.x; cop.y = fixed.y;
    const d = dist(cop.x, cop.y, player.x, player.y);
    if (d < POLICE.bustRange && cop.touchCooldown <= 0 && !player.inCar) {
      cop.touchCooldown = POLICE.touchCooldown;
      if (player.invulnerable <= 0) {
        player.health -= POLICE.touchDamage;
        player.invulnerable = 0.6;
        player.stagger = 0.45;
        events |= 16; // EVENT_HURT
      }
    }
  }

  // Busted: no health left on foot, with the law standing over him.
  if (player.health <= 0 && !player.inCar) events |= 32; // EVENT_BUSTED
  return events;
}

/** Distance to the nearest police (car or foot), Infinity when none. */
export function nearestPoliceDistance(state) {
  let best = Infinity;
  for (const car of state.policeCars) {
    if (car.health > 0) best = Math.min(best, dist(car.x, car.y, state.player.x, state.player.y));
  }
  for (const cop of state.footCops) {
    if (cop.health > 0) best = Math.min(best, dist(cop.x, cop.y, state.player.x, state.player.y));
  }
  return best;
}
