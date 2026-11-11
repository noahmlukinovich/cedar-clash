// Tiny Web Audio synth for sound effects. No audio files needed.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;
const lastPlayed: Record<string, number> = {};

export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export function isMuted(): boolean {
  return muted;
}

export function unlockAudio(): void {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, filterFreq: number, type: BiquadFilterType = 'lowpass', delay = 0): void {
  if (!ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t);
  s.stop(t + dur + 0.05);
}

export type Sfx =
  | 'click'
  | 'pop'
  | 'coin'
  | 'coffee'
  | 'build'
  | 'complete'
  | 'place'
  | 'error'
  | 'deploy'
  | 'hit'
  | 'shoot'
  | 'cannon'
  | 'boom'
  | 'freeze'
  | 'pray'
  | 'buzz'
  | 'star'
  | 'win'
  | 'lose'
  | 'whistle'
  | 'spell'
  | 'heal'
  | 'wind'
  | 'chime'
  | 'stun';

export function sfx(name: Sfx): void {
  if (!ctx || muted) return;
  // rate limit noisy sounds
  const now = performance.now();
  const minGap = name === 'hit' || name === 'shoot' ? 45 : name === 'cannon' ? 80 : 20;
  if (lastPlayed[name] && now - lastPlayed[name] < minGap) return;
  lastPlayed[name] = now;
  switch (name) {
    case 'click':
      tone(880, 0.06, 'square', 0.08, 660);
      break;
    case 'pop':
      tone(500, 0.12, 'sine', 0.3, 1200);
      break;
    case 'coin':
      tone(988, 0.08, 'square', 0.12);
      tone(1319, 0.2, 'square', 0.12, undefined, 0.07);
      break;
    case 'coffee':
      tone(300, 0.15, 'sine', 0.25, 700);
      tone(700, 0.12, 'sine', 0.15, 1000, 0.08);
      break;
    case 'build':
      noise(0.08, 0.25, 1800, 'bandpass');
      noise(0.08, 0.25, 1500, 'bandpass', 0.15);
      break;
    case 'complete':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.2, undefined, i * 0.08));
      break;
    case 'place':
      tone(180, 0.15, 'sine', 0.4, 90);
      noise(0.1, 0.2, 600);
      break;
    case 'error':
      tone(200, 0.15, 'square', 0.12, 150);
      tone(150, 0.2, 'square', 0.12, 110, 0.12);
      break;
    case 'deploy':
      tone(400, 0.08, 'triangle', 0.15, 700);
      break;
    case 'hit':
      noise(0.05, 0.12, 2500, 'bandpass');
      break;
    case 'shoot':
      tone(1400, 0.05, 'square', 0.05, 700);
      break;
    case 'cannon':
      tone(120, 0.2, 'sine', 0.35, 50);
      noise(0.15, 0.2, 800);
      break;
    case 'boom':
      tone(90, 0.5, 'sine', 0.5, 30);
      noise(0.6, 0.4, 500);
      break;
    case 'freeze':
      tone(2000, 0.3, 'sine', 0.12, 3500);
      noise(0.4, 0.15, 6000, 'highpass');
      break;
    case 'pray':
      [523, 659, 784].forEach((f) => tone(f, 0.6, 'sine', 0.12));
      tone(1568, 0.6, 'sine', 0.06, undefined, 0.1);
      break;
    case 'buzz':
      tone(220, 0.6, 'sawtooth', 0.08, 240);
      tone(233, 0.6, 'sawtooth', 0.06, 210);
      break;
    case 'star':
      tone(1047, 0.12, 'triangle', 0.25);
      tone(1568, 0.3, 'triangle', 0.25, undefined, 0.1);
      break;
    case 'win':
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, undefined, i * 0.12));
      break;
    case 'lose':
      [392, 370, 349, 262].forEach((f, i) => tone(f, i === 3 ? 0.7 : 0.3, 'sawtooth', 0.1, i === 3 ? 200 : undefined, i * 0.3));
      break;
    case 'whistle':
      tone(2200, 0.15, 'sine', 0.2, 2600);
      tone(2200, 0.3, 'sine', 0.2, 2500, 0.18);
      break;
    case 'spell':
      tone(300, 0.5, 'sine', 0.2, 1200);
      noise(0.4, 0.1, 3000, 'bandpass');
      break;
    case 'heal':
      tone(880, 0.15, 'sine', 0.06, 1320);
      break;
    case 'wind':
      noise(1.5, 0.3, 400, 'bandpass');
      break;
    case 'chime':
      tone(1319, 0.3, 'sine', 0.15);
      tone(1760, 0.4, 'sine', 0.12, undefined, 0.1);
      break;
    case 'stun':
      tone(600, 0.1, 'square', 0.15, 1200);
      tone(1200, 0.1, 'square', 0.15, 600, 0.1);
      break;
  }
}
