// Particle system. World particles use iso world px; z is height above ground.

export type PKind = 'puff' | 'spark' | 'text' | 'ring' | 'shard' | 'glow' | 'bee' | 'confetti' | 'drop' | 'leaf' | 'snow' | 'heart';

export interface Particle {
  kind: PKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  grow: number;
  rot: number;
  vr: number;
  text?: string;
  ox?: number; // bee orbit center
  oy?: number;
}

export interface Flyer {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
  dur: number;
  delay: number;
  color: string;
  icon: string;
  arc: number;
  onArrive?: () => void;
}

export class Particles {
  list: Particle[] = [];
  flyers: Flyer[] = [];

  add(p: Partial<Particle> & { x: number; y: number }): Particle {
    const q: Particle = {
      kind: 'puff',
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      max: 1,
      size: 6,
      color: '#fff',
      gravity: 0,
      grow: 0,
      rot: Math.random() * 6.28,
      vr: 0,
      ...p,
    };
    this.list.push(q);
    return q;
  }

  burst(x: number, y: number, z: number, n: number, opts: Partial<Particle> & { speed?: number; spread?: number }): void {
    const sp = opts.speed ?? 60;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = sp * (0.4 + Math.random() * 0.8);
      this.add({
        ...opts,
        x: x + (Math.random() - 0.5) * (opts.spread ?? 0),
        y: y + (Math.random() - 0.5) * (opts.spread ?? 0) * 0.5,
        z,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s * 0.5,
        vz: (opts.vz ?? 0) + Math.random() * sp * 0.6,
        max: (opts.max ?? 0.8) * (0.7 + Math.random() * 0.6),
        size: (opts.size ?? 6) * (0.6 + Math.random() * 0.8),
        vr: (Math.random() - 0.5) * 10,
      });
    }
  }

  text(x: number, y: number, z: number, text: string, color: string, size = 16): void {
    this.add({ kind: 'text', x, y, z, vz: 45, max: 1.1, text, color, size });
  }

  poof(x: number, y: number, scale = 1): void {
    this.burst(x, y, 6, Math.round(10 * scale), { kind: 'puff', color: '#e8e8e8', size: 9 * scale, speed: 50 * scale, max: 0.6, grow: 14 });
  }

  explosion(x: number, y: number, scale = 1): void {
    this.burst(x, y, 10, Math.round(14 * scale), { kind: 'puff', color: '#8a7f75', size: 14 * scale, speed: 80 * scale, max: 0.9, grow: 18 });
    this.burst(x, y, 10, Math.round(14 * scale), { kind: 'spark', color: '#ffb347', size: 4, speed: 160 * scale, max: 0.5, gravity: 300, vz: 120 });
    this.burst(x, y, 10, Math.round(10 * scale), { kind: 'shard', color: '#b5432f', size: 6, speed: 120 * scale, max: 1, gravity: 500, vz: 200 });
    this.add({ kind: 'ring', x, y, z: 0, max: 0.4, size: 10, grow: 160 * scale, color: 'rgba(255,220,150,0.8)' });
  }

  fly(f: Omit<Flyer, 't'>): void {
    this.flyers.push({ ...f, t: 0 });
  }

  update(dt: number): void {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life += dt;
      if (p.life >= p.max) {
        L[i] = L[L.length - 1];
        L.pop();
        continue;
      }
      if (p.kind === 'bee' && p.ox !== undefined && p.oy !== undefined) {
        p.rot += dt * (4 + p.vr);
        const r = p.size * 3;
        p.x = p.ox + Math.cos(p.rot) * r * (1 + 0.3 * Math.sin(p.life * 7));
        p.y = p.oy + Math.sin(p.rot * 1.3) * r * 0.5;
        p.z = 14 + Math.sin(p.rot * 2) * 6;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vz -= p.gravity * dt;
      if (p.z < 0 && p.gravity > 0) {
        p.z = 0;
        p.vz *= -0.35;
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
      if (p.kind === 'puff' || p.kind === 'glow') {
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.vz *= 0.92;
      }
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
    }
    const F = this.flyers;
    for (let i = F.length - 1; i >= 0; i--) {
      const f = F[i];
      if (f.delay > 0) {
        f.delay -= dt;
        continue;
      }
      f.t += dt;
      if (f.t >= f.dur) {
        f.onArrive?.();
        F.splice(i, 1);
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.list) {
      const t = p.life / p.max;
      const a = 1 - t;
      const y = p.y - p.z;
      ctx.globalAlpha = Math.max(0, Math.min(1, a * 1.3));
      switch (p.kind) {
        case 'puff':
        case 'glow':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, y, Math.max(0.5, p.size), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'spark':
        case 'drop':
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, y - p.size / 2, p.size, p.size);
          break;
        case 'snow':
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'shard':
        case 'confetti':
        case 'leaf':
          ctx.save();
          ctx.translate(p.x, y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'ring':
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 4 * a + 1;
          ctx.beginPath();
          ctx.ellipse(p.x, y, p.size, p.size * 0.5, 0, 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'heart':
          ctx.fillStyle = p.color;
          ctx.font = `${p.size}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('♥', p.x, y);
          break;
        case 'bee':
          ctx.fillStyle = '#ffcc00';
          ctx.strokeStyle = '#1a1a1a';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(p.x, y, 3, 2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          ctx.fillRect(p.x - 1, y - 4, 2, 2);
          break;
        case 'text': {
          const s = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : 1.2 - Math.min(0.2, (t - 0.15));
          ctx.font = `900 ${Math.round(p.size * s)}px "Trebuchet MS", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 4;
          ctx.strokeStyle = '#1b1b2a';
          ctx.strokeText(p.text ?? '', p.x, y);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text ?? '', p.x, y);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Screen-space flyers (draw with identity transform scaled by dpr). */
  drawFlyers(ctx: CanvasRenderingContext2D): void {
    for (const f of this.flyers) {
      if (f.delay > 0) continue;
      const t = f.t / f.dur;
      const e = t * t * (3 - 2 * t);
      const x = f.x + (f.tx - f.x) * e;
      const y = f.y + (f.ty - f.y) * e - Math.sin(t * Math.PI) * f.arc;
      const s = 1 + Math.sin(t * Math.PI) * 0.4;
      ctx.font = `${Math.round(20 * s)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(f.icon, x, y);
    }
  }
}
