// Solmar Bay's map: a road grid, the blocks between the roads, the buildings
// and parks inside them, and the beach along the south edge. Everything is
// built once from the seed, so the city never changes between visits.

import { PALETTE, PLACES, ROADS_X, ROADS_Y, ROAD_W, WORLD } from './config.js';
import { randPick, randRange } from './random.js';

/** Half a road's width, used to test whether a point is on asphalt. */
const HALF_ROAD = ROAD_W / 2;

/** The beach strip along the south edge of the world. */
export const BEACH_Y = 2420;

/**
 * Build the city from `rng`: buildings (axis-aligned boxes with a colour and a
 * height for their roof shade), parks (trees) and parking lots, one per block.
 * Blocks are the rectangles between neighbouring roads.
 */
export function buildCity(rng) {
  const buildings = [];
  const parks = [];
  const lots = [];
  const xs = [-HALF_ROAD, ...ROADS_X, WORLD.width + HALF_ROAD];
  const ys = [-HALF_ROAD, ...ROADS_Y, WORLD.height + HALF_ROAD];
  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      const x0 = xs[bx] + HALF_ROAD + 14;
      const y0 = ys[by] + HALF_ROAD + 14;
      const x1 = xs[bx + 1] - HALF_ROAD - 14;
      const y1 = ys[by + 1] - HALF_ROAD - 14;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      if (y0 > BEACH_Y - 40) continue; // the beach stays open
      const roll = rng();
      if (roll < 0.16) {
        // A park: a few trees, no buildings.
        const trees = [];
        const count = 3 + Math.floor(rng() * 4);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: randRange(rng, x0 + 20, x1 - 20), y: randRange(rng, y0 + 20, y1 - 20), r: randRange(rng, 12, 20) });
        }
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, trees });
        continue;
      }
      if (roll < 0.26) {
        lots.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        continue;
      }
      // One or two buildings in the block, placed on a jittered split.
      const split = rng() < 0.5;
      if (split) {
        const mid = (x0 + x1) / 2 + randRange(rng, -30, 30);
        buildings.push(makeBuilding(rng, x0 + 8, y0 + 8, mid - 8 - x0, y1 - y0 - 16));
        buildings.push(makeBuilding(rng, mid + 8, y0 + 8, x1 - 8 - mid, y1 - y0 - 16));
      } else {
        buildings.push(makeBuilding(rng, x0 + 8, y0 + 8, x1 - x0 - 16, y1 - y0 - 16));
      }
    }
  }
  return { buildings, parks, lots };
}

function makeBuilding(rng, x, y, w, h) {
  return {
    x, y, w: Math.max(60, w), h: Math.max(60, h),
    color: randPick(rng, PALETTE.building),
    shade: 0.82 + rng() * 0.18,
    windows: 2 + Math.floor(rng() * 3),
  };
}

/** True when the point is on a road (asphalt), false when it is inside a block. */
export function onRoad(x, y) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) <= HALF_ROAD) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) <= HALF_ROAD) return true;
  return false;
}

/** True when the point is on the beach sand. */
export function onBeach(x, y) {
  return y >= BEACH_Y;
}

/**
 * The nearest point on any road centre line to (x, y): traffic and peds use
 * it to get back onto the grid after a turn.
 */
export function nearestRoadPoint(x, y) {
  let bestX = x;
  let bestY = y;
  let bestD = Infinity;
  for (const rx of ROADS_X) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; bestX = rx; bestY = y; }
  }
  for (const ry of ROADS_Y) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; bestX = x; bestY = ry; }
  }
  return { x: bestX, y: bestY };
}

/**
 * Push a circle (x, y, radius) out of every building it overlaps, and out of
 * the world edge. Returns the corrected position. Roads and beach are open.
 */
export function collideCircle(city, x, y, r) {
  let nx = x;
  let ny = y;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - cx;
    const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      nx = cx + (dx / d) * r;
      ny = cy + (dy / d) * r;
    } else {
      // Dead centre of a building: shove out along the smallest overlap.
      const left = nx - b.x + r;
      const right = b.x + b.w - nx + r;
      const top = ny - b.y + r;
      const bottom = b.y + b.h - ny + r;
      const m = Math.min(left, right, top, bottom);
      if (m === left) nx = b.x - r;
      else if (m === right) nx = b.x + b.w + r;
      else if (m === top) ny = b.y - r;
      else ny = b.y + b.h + r;
    }
  }
  nx = Math.max(r, Math.min(WORLD.width - r, nx));
  ny = Math.max(r, Math.min(WORLD.height - r, ny));
  return { x: nx, y: ny };
}

/** True when the circle overlaps any building (used for spawning). */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    if ((x - cx) * (x - cx) + (y - cy) * (y - cy) < r * r) return true;
  }
  return false;
}

/** A free spot on the road nearest to a named place (for spawning cars). */
export function roadNear(place, dx, dy) {
  const p = nearestRoadPoint(place.x + dx, place.y + dy);
  return { x: p.x, y: p.y };
}

/** District name for a point, for the HUD's "you are here" line. */
export function districtAt(x, y) {
  if (y >= BEACH_Y) return 'Sunset Beach';
  if (x >= 2700) return y <= 700 ? 'Rival Turf' : 'The Docks';
  if (x <= 700 && y <= 700) return 'Old Town';
  if (x >= 1300 && x <= 2100 && y >= 900 && y <= 1700) return 'Downtown';
  if (y >= 2100) return 'Marina';
  return 'Solmar Bay';
}

/** All the named places, for the minimap. */
export function namedPlaces() {
  return Object.values(PLACES);
}
