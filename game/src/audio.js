// All sound is synthesised with WebAudio — no audio files, no network.
// A quiet engine hum while driving, a two-tone siren when wanted, short
// blips for punches, pickups and mission beats. M toggles mute.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let sirenHigh = false;
  let muted = false;

  function ensure() {
    if (context) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      engineOsc = context.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineGain = context.createGain();
      engineGain.gain.value = 0;
      const engineFilter = context.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      sirenOsc = context.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 660;
      sirenGain = context.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      context = null;
      return false;
    }
  }

  function resume() {
    if (context && context.state === 'suspended') context.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    resume();
    const t = context.currentTime;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    /** Call on the first user gesture; browsers block audio before one. */
    unlock() {
      if (ensure()) resume();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    /** Engine hum follows speed 0..1; call every frame while driving. */
    engine(speed01) {
      if (!ensure() || muted) {
        if (engineGain) engineGain.gain.value = 0;
        return;
      }
      resume();
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = speed01 * 0.055;
    },
    /** Siren wail while wanted; call every frame with dt and wanted>0. */
    siren(dt, wanted) {
      if (!ensure() || muted || wanted === 0) {
        if (sirenGain) sirenGain.gain.value = 0;
        return;
      }
      resume();
      sirenTimer -= dt;
      if (sirenTimer <= 0) {
        sirenTimer = 0.42;
        sirenHigh = !sirenHigh;
        sirenOsc.frequency.value = sirenHigh ? 880 : 660;
      }
      sirenGain.gain.value = 0.035 + wanted * 0.006;
    },
    punch() { blip(160, 0.12, 'square', 0.22, 70); },
    hit() { blip(90, 0.18, 'sawtooth', 0.25, 50); },
    pickup() { blip(660, 0.09, 'sine', 0.2, 990); },
    cash() { blip(880, 0.1, 'sine', 0.2, 1320); setTimeout(() => blip(1320, 0.14, 'sine', 0.18, 1760), 90); },
    mission() {
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 110));
    },
    busted() {
      [392, 330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.22, 'sawtooth', 0.2), i * 160));
    },
    crash() { blip(120, 0.25, 'sawtooth', 0.3, 40); },
    sirenOff() {
      if (sirenGain) sirenGain.gain.value = 0;
    },
  };
}
