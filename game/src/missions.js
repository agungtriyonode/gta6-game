// The story of Solmar Bay: five jobs for Mara, the fixer who runs the
// garage in Downtown. Each mission has an intro, a live objective and a
// payday. Finishing all five ends the story — free roam goes on after.

import { PLACES } from './config.js';
import { dist } from './random.js';

/** The five jobs, in order. `start` sets the mission up in the world state. */
export const MISSIONS = [
  {
    id: 'wheels',
    title: 'First Wheels',
    reward: 150,
    intro: [
      'MARA: Fresh face. Good — I need wheels, not questions.',
      'MARA: Any car on the street will do. Take it. Then bring it here.',
    ],
    objective: 'Steal a car (E near a car) and drive to the garage',
    start(state) {
      state.missionTarget = { x: PLACES.garage.x, y: PLACES.garage.y };
    },
    update(state) {
      if (state.player.inCar && dist(state.player.x, state.player.y, PLACES.garage.x, PLACES.garage.y) < 110) return 'done';
      return null;
    },
  },
  {
    id: 'package',
    title: 'The Package',
    reward: 250,
    intro: [
      'MARA: The Docks, east side. A crate with my name on it.',
      'MARA: Walk it back here. No sirens, no heroes. Got it?',
    ],
    objective: 'Pick up the package at The Docks, then return to the garage',
    start(state) {
      state.missionTarget = { x: PLACES.docks.x, y: PLACES.docks.y };
      state.packageHeld = false;
      state.packageTimer = 0;
    },
    update(state, dt) {
      const p = state.player;
      if (!state.packageHeld) {
        if (dist(p.x, p.y, PLACES.docks.x, PLACES.docks.y) < 90) {
          state.packageTimer += dt;
          if (state.packageTimer > 1) {
            state.packageHeld = true;
            state.missionTarget = { x: PLACES.garage.x, y: PLACES.garage.y };
          }
        } else {
          state.packageTimer = 0;
        }
        return null;
      }
      if (dist(p.x, p.y, PLACES.garage.x, PLACES.garage.y) < 110) return 'done';
      return null;
    },
  },
  {
    id: 'heat',
    title: 'Lose the Heat',
    reward: 300,
    intro: [
      'MARA: The last job went loud. The whole force is looking for you.',
      'MARA: Lay low. No crimes. When the stars are gone, come see me.',
    ],
    objective: 'Lose the wanted level — stay quiet and out of sight',
    start(state) {
      state.wanted = 2;
      state.sinceCrime = 0;
      state.missionTarget = { x: PLACES.garage.x, y: PLACES.garage.y };
    },
    update(state) {
      if (state.wanted === 0) return 'done';
      return null;
    },
  },
  {
    id: 'payback',
    title: 'Payback',
    reward: 400,
    intro: [
      'MARA: The Vipers jumped one of my drivers at Rival Turf.',
      'MARA: Go settle it. Fists only — I want them walking funny, not dead.',
    ],
    objective: 'Knock out all 3 Vipers at Rival Turf',
    start(state) {
      state.missionTarget = { x: PLACES.rivalTurf.x, y: PLACES.rivalTurf.y };
      state.rivals = [
        { x: PLACES.rivalTurf.x - 40, y: PLACES.rivalTurf.y - 30, angle: 0, health: 100, knockX: 0, knockY: 0, touchCooldown: 0, walkPhase: 0, speed: 210 },
        { x: PLACES.rivalTurf.x + 50, y: PLACES.rivalTurf.y - 10, angle: 0, health: 100, knockX: 0, knockY: 0, touchCooldown: 0, walkPhase: 0, speed: 210 },
        { x: PLACES.rivalTurf.x + 10, y: PLACES.rivalTurf.y + 50, angle: 0, health: 100, knockX: 0, knockY: 0, touchCooldown: 0, walkPhase: 0, speed: 210 },
      ];
    },
    update(state) {
      const left = state.rivals.filter((r) => r.health > 0).length;
      if (left === 0) return 'done';
      return null;
    },
  },
  {
    id: 'score',
    title: 'The Big Score',
    reward: 800,
    intro: [
      'MARA: One last job. A van full of cash at the Marina.',
      'MARA: Take it to the Hideout. The law will be all over you. 90 seconds.',
    ],
    objective: 'Steal the van at the Marina and reach the Hideout in 90s',
    start(state) {
      state.missionTarget = { x: PLACES.marina.x, y: PLACES.marina.y };
      state.missionTimer = 90;
      state.vanStolen = false;
      state.van = null;
    },
    update(state, dt) {
      const p = state.player;
      if (!state.vanStolen) {
        if (p.inCar && state.van && p.inCar === state.van) {
          state.vanStolen = true;
          state.missionTarget = { x: PLACES.hideout.x, y: PLACES.hideout.y };
          state.wanted = Math.max(state.wanted, 3);
          state.sinceCrime = 0;
        }
        return null;
      }
      state.missionTimer -= dt;
      if (state.missionTimer <= 0) return 'failed';
      if (dist(p.x, p.y, PLACES.hideout.x, PLACES.hideout.y) < 110) return 'done';
      return null;
    },
  },
];

/** Start mission `index` in `state` (0-based). Returns its definition. */
export function startMission(state, index) {
  const mission = MISSIONS[index];
  state.missionIndex = index;
  state.mission = mission;
  state.missionLines = mission.intro.slice();
  state.missionLineAt = 0;
  state.missionLineTimer = 0;
  state.missionTarget = null;
  state.missionTimer = 0;
  mission.start(state);
  return mission;
}

/** Current objective text, or null when no mission is running. */
export function missionObjective(state) {
  if (!state.mission) return null;
  if (state.mission.id === 'package' && state.packageHeld) return 'Bring the package back to the garage';
  if (state.mission.id === 'payback') {
    const left = state.rivals.filter((r) => r.health > 0).length;
    return `Knock out the Vipers — ${left} left`;
  }
  if (state.mission.id === 'score' && state.vanStolen) {
    return `Reach the Hideout — ${Math.ceil(state.missionTimer)}s left`;
  }
  return state.mission.objective;
}
