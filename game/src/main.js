// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between title, help, play, paused, busted and story-complete screens, and
// saves the story to localStorage so a visit can continue where it stopped.
//
// ?seed=N fixes the city and the traffic. ?shot=city|drive|chase|mission
// (with &seed=N) stages that scene instead of running the loop, paints it
// twice and sets window.__shotReady for a screenshot.

import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CAR_DEAD, EVENT_CASH, EVENT_HURT, EVENT_MISSION_DONE } from './world.js';
import { ACTION_CONFIRM, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_HELP, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { startMission } from './missions.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;
/** Autosave every 15 seconds of play. */
const AUTOSAVE_EVERY = 15;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save.money !== 'number' || typeof save.missionIndex !== 'number') return null;
    return save;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    const p = world.state.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: world.state.money,
      missionIndex: world.state.missionIndex,
      x: p.x, y: p.y, health: p.health,
      storyDone: world.state.storyDone,
    }));
  } catch {
    // Storage can be off (private windows): the story then lasts one visit.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Best haul then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, world.clock(), 0, world.objective());
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let save = readSave();
  let newGame = false;
  let accumulator = 0;
  let last = performance.now();
  let autosaveTimer = 0;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && screen === SCREEN_TITLE) newGame = true;
    if (event.code === 'KeyH' && screen === SCREEN_TITLE) screen = SCREEN_HELP;
  });

  function announce(message) {
    status.textContent = message;
  }

  function applySave(s) {
    const st = world.state;
    st.money = s.money;
    st.storyDone = !!s.storyDone;
    const p = st.player;
    p.x = s.x; p.y = s.y;
    p.health = Math.max(1, s.health || 100);
    p.inCar = null;
    if (st.storyDone) {
      st.mission = null;
      st.missionIndex = 5;
      st.missionTarget = null;
    } else {
      startMission(st, Math.max(0, Math.min(4, s.missionIndex)));
    }
  }

  function startGame() {
    if (!newGame && save) applySave(save);
    else {
      world.reset();
      newGame = false;
    }
    save = null;
    accumulator = 0;
    autosaveTimer = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing. Follow the yellow ring to your next job.');
  }

  function handleEvents(events) {
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_HURT) audio.hit();
    if (events & EVENT_CAR_DEAD) {
      audio.crash();
      world.carWrecked();
      announce('Your car is wrecked.');
    }
    if (events & EVENT_MISSION_DONE) {
      audio.mission();
      if (world.state.money > best) {
        best = world.state.money;
        writeBest(best);
      }
      writeSave();
      if (world.state.storyDone) {
        screen = SCREEN_STORY;
        announce('Story complete. Solmar Bay is yours.');
      } else {
        announce(`Job done. Next: ${world.state.mission ? world.state.mission.title : 'free roam'}.`);
      }
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      world.busted();
      writeSave();
      screen = SCREEN_BUSTED;
      announce('Busted. The police took $150 and your car.');
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_HELP) startGame();
      else if (screen === SCREEN_BUSTED || screen === SCREEN_STORY) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        writeSave();
        announce('Paused. Progress saved.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
    return actions;
  }

  function step(actions) {
    const move = input.move();
    const stepActions = {
      punch: !!(actions & ACTION_PUNCH),
      interact: !!(actions & ACTION_INTERACT),
    };
    const events = world.step(STEP, { x: move.x, y: move.y, run: input.running() }, stepActions);
    handleEvents(events);
    autosaveTimer += STEP;
    if (autosaveTimer >= AUTOSAVE_EVERY) {
      autosaveTimer = 0;
      writeSave();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const actions = handleActions();
    if (screen === SCREEN_TITLE) {
      // The title screen's backdrop: the city idles behind the panel.
      while (accumulator >= STEP) {
        world.step(STEP, { x: 0, y: 0, run: false }, { punch: false, interact: false });
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(actions);
        accumulator -= STEP;
      }
      if (screen !== SCREEN_PLAY) accumulator = 0;
    } else {
      accumulator = 0;
    }
    // Engine hum and siren follow the driving and the wanted level.
    const p = world.state.player;
    audio.engine(p.inCar ? Math.min(1, Math.abs(p.inCar.speed) / 560) : 0);
    audio.siren(STEP, world.state.wanted);
    renderer.draw(world.state, screen, world.clock(), best, world.objective());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      writeSave();
      announce('Paused. Progress saved.');
    }
  });

  announce(save
    ? 'Solmar Bay. Press Enter to continue your story, or N for a new one. H for help.'
    : 'Solmar Bay. Press Enter to start. H for help.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
