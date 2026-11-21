// Hand-to-hand combat: one punch, a short arc in front of the player, a
// cooldown, knockback on whatever it lands on. The world owns who is a cop,
// a rival or a bystander; this file only answers "what did the fist hit".

import { PLAYER } from './config.js';
import { dist } from './random.js';

/**
 * Try a punch from (x, y) facing `angle`. `targets` is a list of {x, y, r,
 * kind, health} (peds, cops, rivals). Returns the first target hit (nearest
 * in the arc) with damage applied and knockback, or null.
 */
export function punch(x, y, angle, targets) {
  let best = null;
  let bestD = Infinity;
  for (const t of targets) {
    if (t.health <= 0) continue;
    const d = dist(x, y, t.x, t.y);
    if (d > PLAYER.punchRange + t.r) continue;
    const toTarget = Math.atan2(t.y - y, t.x - x);
    let diff = toTarget - angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 1.1) continue; // outside the swing arc
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best) return null;
  best.health -= PLAYER.punchDamage;
  const push = 260;
  const a = Math.atan2(best.y - y, best.x - x);
  best.x += Math.cos(a) * 14;
  best.y += Math.sin(a) * 14;
  best.knockX = (best.knockX || 0) + Math.cos(a) * push;
  best.knockY = (best.knockY || 0) + Math.sin(a) * push;
  return best;
}

/** A car's front bumper hit: returns the damage a ram deals at `speed`. */
export function ramDamage(speed) {
  return Math.round(18 + (speed / 560) * 46);
}

/** Damage a cop's baton touch deals, and how long the player is staggered. */
export const COP_TOUCH = { damage: 9, stagger: 0.45 };
