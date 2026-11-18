// All the sound, generated: no files. Gunshots and explosions are shaped noise, the engine is
// two detuned oscillators following the wheels, the siren alternates two tones, and the radio is
// a scheduled four-chord loop in A minor played on a plucked synth over a bass and a shaker.
const MASTER = 0.42;
const MUSIC = 0.16;

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let noise = null;
  let engine = null;
  let siren = null;
  let music = null;
  let muted = false;
  let started = false;

  function makeNoise(context) {
    const len = Math.floor(context.sampleRate * 2);
    const buf = context.createBuffer(1, len, context.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = white * 0.6 + last * 2.4;
    }
    return buf;
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MASTER;
    master.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = MUSIC;
    musicGain.connect(master);
    noise = makeNoise(ctx);
    return ctx;
  }

  /** One shaped noise burst: the backbone of every shot, crash and explosion. */
  function burst({ dur = 0.2, type = 'bandpass', freq = 900, q = 1, gain = 0.5, decay = 0.9, sweep = 0 }) {
    if (!ensure()) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    if (sweep) filter.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur * decay + 0.02);
    src.connect(filter).connect(g).connect(master);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  function tone({ freq = 440, dur = 0.15, type = 'square', gain = 0.2, slide = 1, delay = 0 }) {
    if (!ensure()) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide !== 1) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  const api = {
    get muted() { return muted; },
    resume() {
      ensure();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      started = true;
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : MASTER;
      return muted;
    },

    play(name, variant) {
      if (!ensure() || muted) return;
      switch (name) {
        case 'shot':
          if (variant === 'shotgun') { burst({ dur: 0.34, freq: 700, gain: 0.7, decay: 1.1, sweep: 0.35 }); tone({ freq: 90, dur: 0.18, type: 'sine', gain: 0.3, slide: 0.5 }); }
          else if (variant === 'smg') burst({ dur: 0.1, freq: 1700, gain: 0.33, q: 0.8, sweep: 0.6 });
          else { burst({ dur: 0.15, freq: 1200, gain: 0.44, q: 1.2, sweep: 0.45 }); tone({ freq: 150, dur: 0.1, type: 'triangle', gain: 0.16, slide: 0.4 }); }
          break;
        case 'explosion':
          burst({ dur: 0.9, type: 'lowpass', freq: 820, gain: 0.95, decay: 1.1, sweep: 0.12 });
          tone({ freq: 110, dur: 0.7, type: 'sine', gain: 0.5, slide: 0.25 });
          break;
        case 'hit':
          burst({ dur: 0.08, freq: 2400, gain: 0.2, q: 2 });
          break;
        case 'hurt':
          tone({ freq: 220, dur: 0.2, type: 'sawtooth', gain: 0.16, slide: 0.5 });
          burst({ dur: 0.15, type: 'lowpass', freq: 500, gain: 0.3 });
          break;
        case 'swing':
          burst({ dur: 0.14, type: 'bandpass', freq: 600, q: 0.7, gain: 0.2, sweep: 2.4 });
          break;
        case 'cash':
          tone({ freq: midi(84), dur: 0.09, type: 'square', gain: 0.13 });
          tone({ freq: midi(88), dur: 0.12, type: 'square', gain: 0.12, delay: 0.07 });
          break;
        case 'pickup':
          tone({ freq: midi(79), dur: 0.1, type: 'triangle', gain: 0.16 });
          tone({ freq: midi(84), dur: 0.14, type: 'triangle', gain: 0.14, delay: 0.06 });
          break;
        case 'door':
          burst({ dur: 0.07, type: 'lowpass', freq: 350, gain: 0.22 });
          break;
        case 'click':
          tone({ freq: 1200, dur: 0.04, type: 'square', gain: 0.07 });
          break;
        case 'empty':
          tone({ freq: 900, dur: 0.05, type: 'square', gain: 0.06 });
          break;
        case 'wanted':
          tone({ freq: 760, dur: 0.16, type: 'sawtooth', gain: 0.14 });
          tone({ freq: 560, dur: 0.22, type: 'sawtooth', gain: 0.14, delay: 0.14 });
          break;
        case 'sirenblip':
          tone({ freq: 980, dur: 0.09, type: 'square', gain: 0.05 });
          break;
        case 'checkpoint':
          tone({ freq: midi(83), dur: 0.12, type: 'triangle', gain: 0.14 });
          tone({ freq: midi(90), dur: 0.2, type: 'triangle', gain: 0.12, delay: 0.1 });
          break;
        case 'mission':
          tone({ freq: midi(69), dur: 0.18, type: 'square', gain: 0.1 });
          tone({ freq: midi(76), dur: 0.3, type: 'square', gain: 0.1, delay: 0.14 });
          break;
        case 'complete':
          [72, 76, 79, 84].forEach((n, k) => tone({ freq: midi(n), dur: 0.3, type: 'triangle', gain: 0.14, delay: k * 0.11 }));
          break;
        case 'fail':
          [67, 63, 58].forEach((n, k) => tone({ freq: midi(n), dur: 0.34, type: 'sawtooth', gain: 0.1, delay: k * 0.15 }));
          break;
        case 'clean':
          tone({ freq: midi(74), dur: 0.4, type: 'sine', gain: 0.1, slide: 1.4 });
          break;
        default:
          break;
      }
    },

    /** The engine: pitch from wheel speed, a growl that opens with the throttle. */
    engineOn(on) {
      if (!ensure()) return;
      if (on && !engine) {
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
        const g = ctx.createGain();
        const f = ctx.createBiquadFilter();
        o1.type = 'sawtooth'; o2.type = 'square';
        o1.frequency.value = 60; o2.frequency.value = 61;
        f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 3;
        g.gain.value = 0;
        o1.connect(f); o2.connect(f); f.connect(g).connect(master);
        o1.start(); o2.start();
        engine = { o1, o2, g, f };
      } else if (!on && engine) {
        engine.g.gain.value = 0;
      }
    },
    engineState(speed, throttle) {
      if (!engine || !ctx) return;
      const s = Math.abs(speed);
      const base = 46 + Math.min(240, s * 0.55);
      const t = ctx.currentTime;
      engine.o1.frequency.setTargetAtTime(base, t, 0.08);
      engine.o2.frequency.setTargetAtTime(base * 1.51, t, 0.08);
      engine.f.frequency.setTargetAtTime(400 + Math.min(1800, s * 3.4) + throttle * 500, t, 0.1);
      engine.g.gain.setTargetAtTime(muted ? 0 : 0.1 + Math.min(0.1, s / 3000), t, 0.08);
    },

    /** Two-tone siren whose volume follows the nearest cruiser. */
    sirenState(level) {
      if (!ensure()) return;
      if (level > 0.01 && !siren) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = 760;
        g.gain.value = 0;
        o.connect(g).connect(master);
        o.start();
        siren = { o, g, phase: 0 };
      }
      if (!siren) return;
      const t = ctx.currentTime;
      siren.g.gain.setTargetAtTime(muted ? 0 : Math.min(0.07, level * 0.06), t, 0.15);
      siren.phase = (siren.phase + 0.5) % 1;
      siren.o.frequency.setTargetAtTime(siren.phase < 0.5 ? 720 : 940, t, 0.02);
    },
    sirenOff() {
      if (siren) siren.g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    },

    /** The radio: A minor, four bars, plucked lead over bass and shaker. */
    startMusic() {
      if (!ensure()) return;
      if (music) return;
      music = { next: ctx.currentTime + 0.2, bar: 0, step: 0 };
    },
    stopMusic() { music = null; },
    updateMusic() {
      if (!ctx || !music || muted) return;
      const bpm = 92;
      const spb = 60 / bpm / 2; // eighth notes
      const chords = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
      while (music.next < ctx.currentTime + 0.4) {
        const t0 = music.next;
        const chord = chords[Math.floor(music.step / 8) % 4];
        // Bass on the beat.
        if (music.step % 4 === 0) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.setValueAtTime(midi(chord[0] - 12), t0);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + spb * 1.6);
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass'; f.frequency.value = 420;
          o.connect(f).connect(g).connect(musicGain);
          o.start(t0); o.stop(t0 + spb * 1.8);
        }
        // Pad on the first beat of the bar.
        if (music.step % 8 === 0) {
          for (const n of chord) {
            const o = ctx.createOscillator();
            const g = ctx.createGain();
            o.type = 'triangle';
            o.frequency.value = midi(n + 12);
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.linearRampToValueAtTime(0.045, t0 + 0.12);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + spb * 7);
            o.connect(g).connect(musicGain);
            o.start(t0); o.stop(t0 + spb * 7.4);
          }
        }
        // Plucked lead, a stepwise line over the chord.
        if (music.step % 2 === 1 && Math.random() < 0.75) {
          const n = chord[Math.floor(Math.random() * 3)] + 12 + (Math.random() < 0.3 ? 12 : 0);
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'square';
          o.frequency.value = midi(n);
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.01);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + spb * 0.9);
          o.connect(g).connect(musicGain);
          o.start(t0); o.stop(t0 + spb);
        }
        // Shaker.
        if (music.step % 2 === 0) {
          const src = ctx.createBufferSource();
          src.buffer = noise;
          const f = ctx.createBiquadFilter();
          f.type = 'highpass'; f.frequency.value = 5200;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.03, t0);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
          src.connect(f).connect(g).connect(musicGain);
          src.start(t0); src.stop(t0 + 0.06);
        }
        music.step += 1;
        music.next += spb;
      }
    },
    get running() { return started; },
  };
  return api;
}
