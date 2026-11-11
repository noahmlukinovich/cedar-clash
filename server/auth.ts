// Passwords (scrypt), session tokens, and simple in-memory rate limiting.
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';

const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(pw: string, salt: Buffer, len: number, opts: typeof PARAMS): Promise<Buffer> {
  return new Promise((res, rej) => scryptCb(pw, salt, len, opts, (err, key) => (err ? rej(err) : res(key))));
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 32, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(pw, Buffer.from(salt, 'base64'), want.length, { N: +n, r: +r, p: +p, maxmem: PARAMS.maxmem });
  return got.length === want.length && timingSafeEqual(got, want);
}

/** A well-formed hash to check against when the user doesn't exist, so timing doesn't reveal valid names. */
export const DUMMY_HASH = ['scrypt', 16384, 8, 1, Buffer.alloc(16).toString('base64'), Buffer.alloc(32).toString('base64')].join('$');

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Sessions are stored hashed, so a leaked database doesn't hand out logins. */
export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newInviteCode(): string {
  // readable: XXXX-XXXX-XXXX from an unambiguous alphabet (32 symbols, so no modulo bias)
  const alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) {
    if (i && i % 4 === 0) s += '-';
    s += alpha[b[i] % alpha.length];
  }
  return s;
}

/** Fixed-window counter: at most `max` hits per `windowMs` for a key. */
export class RateLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(
    private max: number,
    private windowMs: number,
  ) {}
  /** Counts a hit. Returns false if the key is now over its limit. */
  hit(key: string, now = Date.now()): boolean {
    let e = this.hits.get(key);
    if (!e || e.reset <= now) {
      e = { n: 0, reset: now + this.windowMs };
      this.hits.set(key, e);
    }
    e.n++;
    if (this.hits.size > 50000) this.sweep(now);
    return e.n <= this.max;
  }
  blocked(key: string, now = Date.now()): boolean {
    const e = this.hits.get(key);
    return !!e && e.reset > now && e.n >= this.max;
  }
  clear(key: string): void {
    this.hits.delete(key);
  }
  sweep(now = Date.now()): void {
    for (const [k, e] of this.hits) if (e.reset <= now) this.hits.delete(k);
  }
}
