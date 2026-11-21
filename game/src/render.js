// Drawing only: the world's state and the current screen in, pixels out.
// A camera follows the player across the city; the HUD, the wanted stars and
// the minimap sit on top; title, pause, busted and story screens are panels.

import { BEACH_Y } from './city.js';
import { FONT, PALETTE, PLACES, ROADS_X, ROADS_Y, ROAD_W, VIEW, WORLD } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_STORY = 'story';
export const SCREEN_HELP = 'help';

const MINIMAP = { x: VIEW.width - 210, y: 16, w: 194, h: 148 };
const STAR = '★';

/** The camera: centred on the player, clamped to the world. */
function cameraFor(player) {
  return {
    x: Math.max(0, Math.min(WORLD.width - VIEW.width, player.x - VIEW.width / 2)),
    y: Math.max(0, Math.min(WORLD.height - VIEW.height, player.y - VIEW.height / 2)),
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    const key = `${size}`;
    if (!fonts.has(key)) fonts.set(key, `bold ${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function textPlain(value, x, y, size, color, align, baseline) {
    const key = `p${size}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function drawCity(state, cam) {
    const { city } = state;
    // Ocean beyond the city, sand on the south beach.
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(cam.x - 40, cam.y - 40, VIEW.width + 80, VIEW.height + 80);
    context.fillStyle = PALETTE.water;
    context.fillRect(cam.x - 40, cam.y - 40, VIEW.width + 80, VIEW.height + 80);
    // Land.
    context.fillStyle = PALETTE.block;
    context.fillRect(0, 0, WORLD.width, BEACH_Y);
    context.fillStyle = PALETTE.sand;
    context.fillRect(0, BEACH_Y, WORLD.width, WORLD.height - BEACH_Y);
    // Parks.
    for (const park of city.parks) {
      context.fillStyle = PALETTE.grass;
      context.fillRect(park.x, park.y, park.w, park.h);
      for (const tree of park.trees) {
        context.fillStyle = PALETTE.grassDark;
        context.beginPath();
        context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = PALETTE.grass;
        context.beginPath();
        context.arc(tree.x - 3, tree.y - 3, tree.r * 0.7, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Parking lots.
    for (const lot of city.lots) {
      context.fillStyle = PALETTE.roadEdge;
      context.fillRect(lot.x, lot.y, lot.w, lot.h);
    }
    // Sidewalks: a pale border around every block is drawn as the road's edge.
    // Roads.
    context.fillStyle = PALETTE.road;
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    for (const ry of ROADS_Y) context.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
    // Lane dashes.
    context.fillStyle = PALETTE.lane;
    for (const rx of ROADS_X) {
      for (let y = 0; y < WORLD.height; y += 64) {
        if (Math.floor(y / 400) % 2 === 0) context.fillRect(rx - 2, y, 4, 30);
      }
    }
    for (const ry of ROADS_Y) {
      for (let x = 0; x < WORLD.width; x += 64) {
        if (Math.floor(x / 400) % 2 === 0) context.fillRect(x, ry - 2, 30, 4);
      }
    }
    // Buildings with roof shade and windows.
    for (const b of city.buildings) {
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = PALETTE.roof;
      context.fillRect(b.x, b.y, b.w, 10);
      context.fillRect(b.x, b.y, 10, b.h);
      context.fillStyle = '#ffffff55';
      const cols = Math.max(1, Math.floor(b.w / 46));
      const rows = Math.max(1, Math.floor(b.h / 46));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          context.fillRect(b.x + 16 + c * 46, b.y + 18 + r * 46, 14, 18);
        }
      }
    }
    // Mission target marker: a pulsing ring on the ground.
    const target = state.missionTarget;
    if (target) {
      const pulse = 1 + 0.12 * Math.sin(state.elapsed * 5);
      context.strokeStyle = PALETTE.marker;
      context.lineWidth = 4;
      context.beginPath();
      context.arc(target.x, target.y, 34 * pulse, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(target.x, target.y, 6, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = '#00000030';
    context.fillRect(-26, -13, 52, 27);
    // Body.
    context.fillStyle = car.kind === 'police' ? PALETTE.policeCar : car.color;
    context.beginPath();
    context.roundRect(-24, -12, 48, 24, 7);
    context.fill();
    if (car.kind === 'police') {
      context.fillStyle = PALETTE.policeDark;
      context.fillRect(-8, -12, 16, 24);
    }
    // Windows.
    context.fillStyle = '#20262e';
    context.beginPath();
    context.roundRect(-8, -9, 14, 18, 3);
    context.fill();
    // Headlights.
    context.fillStyle = '#fff8c8';
    context.fillRect(22, -9, 3, 5);
    context.fillRect(22, 4, 3, 5);
    // Police light bar, flashing.
    if (car.kind === 'police') {
      const on = Math.floor(time * 4) % 2 === 0;
      context.fillStyle = on ? '#ff3b30' : '#2f7bff';
      context.fillRect(-4, -12, 8, 4);
      context.fillStyle = on ? '#2f7bff' : '#ff3b30';
      context.fillRect(-4, 8, 8, 4);
    }
    // Wreck smoke.
    if (car.health < 45 && car.health > 0 && Math.floor(time * 6) % 2 === 0) {
      context.fillStyle = '#88888888';
      context.beginPath();
      context.arc(-14, 0, 9, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawPerson(x, y, angle, color, walkPhase, isCop, ring) {
    const bob = Math.sin(walkPhase) * 2;
    context.save();
    context.translate(x, y);
    // Shadow.
    context.fillStyle = '#00000030';
    context.beginPath();
    context.ellipse(0, 4, 12, 6, 0, 0, Math.PI * 2);
    context.fill();
    // Body.
    context.fillStyle = color;
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.fill();
    // A coloured ring marks a hostile (a Viper) so he reads at a glance.
    if (ring) {
      context.strokeStyle = ring;
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, 15, 0, Math.PI * 2);
      context.stroke();
    }
    // Head.
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(Math.cos(angle) * 3, Math.sin(angle) * 3, 6, 0, Math.PI * 2);
    context.fill();
    // Facing tick.
    context.strokeStyle = '#00000066';
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(Math.cos(angle) * 10, Math.sin(angle) * 10);
    context.lineTo(Math.cos(angle) * 16, Math.sin(angle) * 16);
    context.stroke();
    if (isCop) {
      context.fillStyle = PALETTE.cop;
      context.beginPath();
      context.arc(0, 0, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8e8e8';
      context.beginPath();
      context.arc(0, -2, 6, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    void bob;
  }

  function drawWorld(state, screen) {
    const cam = cameraFor(state.player);
    context.save();
    context.translate(-cam.x * view.scale, -cam.y * view.scale);
    context.scale(view.scale, view.scale);
    drawCity(state, cam);
    // Cash pickups.
    for (const pick of state.pickups) {
      if (pick.ttl <= 0) continue;
      context.fillStyle = PALETTE.cash;
      context.beginPath();
      context.arc(pick.x, pick.y, 8, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#0e2a10';
      textPlain('$', pick.x, pick.y + 4, 12, '#0e2a10', 'center');
    }
    // Traffic and police cars.
    for (const car of state.cars) {
      if (car.health <= 0) continue;
      drawCar(car, state.elapsed);
    }
    // Pedestrians.
    for (const ped of state.peds) {
      if (ped.health <= 0) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.color, ped.walkPhase, false);
    }
    // Rivals (red shirts, ringed) and foot cops.
    for (const rival of state.rivals) {
      if (rival.health <= 0) continue;
      drawPerson(rival.x, rival.y, rival.angle, '#c92a2a', rival.walkPhase, false, '#ff5a4a');
    }
    for (const cop of state.footCops) {
      if (cop.health <= 0) continue;
      drawPerson(cop.x, cop.y, cop.angle, PALETTE.cop, cop.walkPhase, true);
    }
    // The player: orange jacket, a white outline so he reads at a glance.
    const p = state.player;
    if (p.invulnerable <= 0 || Math.floor(p.invulnerable * 10) % 2 === 1) {
      context.save();
      context.translate(p.x, p.y);
      context.strokeStyle = '#ffffff';
      context.lineWidth = 3;
      context.beginPath();
      context.arc(0, 0, 15, 0, Math.PI * 2);
      context.stroke();
      context.restore();
      drawPerson(p.x, p.y, p.angle, PALETTE.player, p.moving ? state.elapsed * 10 : 0, false);
    }
    context.restore();
    return cam;
  }

  function drawMinimap(state) {
    const m = MINIMAP;
    const sx = m.w / WORLD.width;
    const sy = m.h / WORLD.height;
    context.fillStyle = PALETTE.minimapBg;
    context.beginPath();
    context.roundRect(m.x, m.y, m.w, m.h, 8);
    context.fill();
    context.save();
    context.beginPath();
    context.roundRect(m.x, m.y, m.w, m.h, 8);
    context.clip();
    context.fillStyle = '#2a2f3a';
    context.fillRect(m.x, m.y, m.w, m.h);
    // Roads.
    context.fillStyle = '#565b66';
    for (const rx of ROADS_X) context.fillRect(m.x + rx * sx - 2, m.y, 4, m.h);
    for (const ry of ROADS_Y) context.fillRect(m.x, m.y + ry * sy - 2, m.w, 4);
    // Beach.
    context.fillStyle = '#e8d29a';
    context.fillRect(m.x, m.y + BEACH_Y * sy, m.w, m.h - BEACH_Y * sy);
    // Named places.
    context.fillStyle = '#8b93a3';
    for (const place of Object.values(PLACES)) {
      context.fillRect(m.x + place.x * sx - 1, m.y + place.y * sy - 1, 2, 2);
    }
    // Mission target.
    if (state.missionTarget) {
      context.fillStyle = PALETTE.marker;
      context.beginPath();
      context.arc(m.x + state.missionTarget.x * sx, m.y + state.missionTarget.y * sy, 4, 0, Math.PI * 2);
      context.fill();
    }
    // Police (flashing blue/red), cars (white), player (orange arrow).
    const flash = Math.floor(state.elapsed * 4) % 2 === 0;
    context.fillStyle = flash ? '#ff3b30' : '#2f7bff';
    for (const car of state.policeCars) {
      context.fillRect(m.x + car.x * sx - 2, m.y + car.y * sy - 2, 4, 4);
    }
    context.fillStyle = '#ffffff';
    for (const car of state.cars) {
      if (car.kind === 'traffic' && car.health > 0) {
        context.fillRect(m.x + car.x * sx - 1, m.y + car.y * sy - 1, 2, 2);
      }
    }
    const p = state.player;
    context.save();
    context.translate(m.x + p.x * sx, m.y + p.y * sy);
    context.rotate(p.angle);
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.moveTo(6, 0);
    context.lineTo(-4, -4);
    context.lineTo(-4, 4);
    context.closePath();
    context.fill();
    context.restore();
    // Viewport box.
    const cam = cameraFor(p);
    context.strokeStyle = '#ffffff88';
    context.lineWidth = 1;
    context.strokeRect(m.x + cam.x * sx, m.y + cam.y * sy, VIEW.width * sx, VIEW.height * sy);
    context.restore();
    textPlain('SOLMAR BAY', m.x + 4, m.y + m.h - 6, 11, PALETTE.hudMuted, 'left');
  }

  function drawHud(state, clock, best) {
    const p = state.player;
    // Top-left: health, money, district + clock.
    context.fillStyle = PALETTE.hudBg;
    context.beginPath();
    context.roundRect(16, 16, 250, 92, 10);
    context.fill();
    textPlain('HEALTH', 28, 38, 13, PALETTE.hudMuted, 'left');
    context.fillStyle = '#333a45';
    context.fillRect(28, 46, 150, 12);
    context.fillStyle = p.health > 35 ? '#7ee081' : '#ff5a4a';
    context.fillRect(28, 46, Math.max(0, 150 * (p.health / 100)), 12);
    textPlain(`$${state.money.toLocaleString('en-US')}`, 28, 84, 22, PALETTE.cash, 'left');
    textPlain(`${state.district}  •  ${clock}`, 28, 100, 13, PALETTE.hudText, 'left');
    // Wanted stars, top centre.
    if (state.wanted > 0) {
      let stars = '';
      for (let i = 0; i < 5; i += 1) stars += i < state.wanted ? STAR : '☆';
      context.fillStyle = PALETTE.hudBg;
      const w = 190;
      context.beginPath();
      context.roundRect(VIEW.width / 2 - w / 2, 16, w, 44, 10);
      context.fill();
      text(stars, VIEW.width / 2, 48, 26, PALETTE.star, 'center');
    }
    // Mission objective, under the stars.
    const objective = state.mission ? state.mission.title : null;
    if (objective) {
      context.fillStyle = PALETTE.hudBg;
      context.beginPath();
      context.roundRect(VIEW.width / 2 - 260, 70, 520, 54, 10);
      context.fill();
      text(`${state.mission.title}  •  $${state.mission.reward}`, VIEW.width / 2, 92, 16, PALETTE.title, 'center');
      textPlain(state.objectiveText || '', VIEW.width / 2, 112, 14, PALETTE.hudText, 'center');
    }
    // Dialogue line from Mara, bottom centre.
    if (state.missionLine) {
      context.fillStyle = PALETTE.hudBg;
      context.beginPath();
      context.roundRect(VIEW.width / 2 - 330, VIEW.height - 64, 660, 44, 10);
      context.fill();
      textPlain(state.missionLine, VIEW.width / 2, VIEW.height - 36, 15, PALETTE.hudText, 'center');
    }
    // Controls hint, bottom left — hidden while Mara is talking.
    if (!state.missionLine) {
      textPlain('WASD move • Shift run • E enter car • Space punch • P pause • M mute', 16, VIEW.height - 16, 13, PALETTE.hudMuted, 'left');
    }
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, accent) {
    const lineH = 30;
    const height = 150 + lines.length * lineH + 60;
    const width = 640;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = '#10141bee';
    context.beginPath();
    context.roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = accent || PALETTE.title;
    context.lineWidth = 2;
    context.stroke();
    text(title, VIEW.width / 2, y + 64, 44, accent || PALETTE.title, 'center');
    for (let i = 0; i < lines.length; i += 1) {
      textPlain(lines[i], VIEW.width / 2, y + 110 + i * lineH, 18, PALETTE.hudText, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 20, PALETTE.cash, 'center');
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen. */
  function draw(state, screen, clock, best, objectiveText) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0e1420';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    // The live objective line and Mara's current dialogue line, for the HUD.
    state.objectiveText = objectiveText || '';
    state.missionLine = state.mission && state.missionLineAt < state.missionLines.length
      ? state.missionLines[state.missionLineAt] : null;
    drawWorld(state, screen);
    if (screen === SCREEN_TITLE) {
      drawPanel('SOLMAR BAY', [
        'An open-world crime game in a city of its own.',
        'Steal cars. Lose the cops. Run five jobs for Mara.',
        `Best haul: $${(best || 0).toLocaleString('en-US')}`,
      ], 'Press Enter or click to start', PALETTE.title);
      return;
    }
    drawHud(state, clock, best);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for you.', `Money $${state.money.toLocaleString('en-US')}  •  ${state.mission ? state.mission.title : 'Free roam'}`], 'Press P to resume', PALETTE.hudText);
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The Solmar Bay PD caught up with you.', 'Fine: $150. Your car is gone.'], 'Press Enter to get out of the hospital', PALETTE.danger);
    } else if (screen === SCREEN_STORY) {
      drawPanel('THE BIG SCORE — DONE', ['All five jobs finished. The city is yours, Rico.', `Final haul: $${state.money.toLocaleString('en-US')}`], 'Press Enter to keep roaming free', PALETTE.title);
    } else if (screen === SCREEN_HELP) {
      drawPanel('How to play', [
        'WASD / arrows — walk or drive.  Shift — run.',
        'E — steal a car / get out.  Space — punch.',
        'Follow the yellow ring: that is your next job.',
        'Stars mean the police are after you. Lay low to lose them.',
      ], 'Press Enter to play', PALETTE.hudText);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
