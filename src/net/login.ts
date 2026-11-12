// Start screen: log in / sign up for online play, or play offline (local save).
import { el, esc } from '../ui/ui';
import { api } from './online';
import type { MeResponse } from './protocol';

export type StartChoice = { mode: 'online'; me: MeResponse } | { mode: 'offline'; serverAvailable: boolean };

const PREF = 'cedarville-clash-mode';

function prefersOffline(): boolean {
  try {
    return localStorage.getItem(PREF) === 'offline';
  } catch {
    return false;
  }
}

export function setPrefersOffline(v: boolean): void {
  try {
    if (v) localStorage.setItem(PREF, 'offline');
    else localStorage.removeItem(PREF);
  } catch {
    /* storage blocked */
  }
}

/** Is there a game server behind this page? (No on static hosting such as GitHub Pages.) */
/** `invite` is false when the server lets anyone sign up without an invite code. */
type Status = { ok: boolean; loggedIn: boolean; invite?: boolean };

async function serverStatus(): Promise<Status | null> {
  try {
    return await api<Status>('/api/health', undefined, 4000);
  } catch {
    return null;
  }
}

export async function chooseStart(): Promise<StartChoice> {
  const status = await serverStatus();
  if (!status?.ok) return { mode: 'offline', serverAvailable: false };
  if (!status.loggedIn && prefersOffline()) return { mode: 'offline', serverAvailable: true };
  if (status.loggedIn) {
    try {
      return { mode: 'online', me: await api<MeResponse>('/api/me') };
    } catch {
      /* session expired between calls */
    }
  }
  return showLogin(status.invite !== false);
}

function showLogin(needInvite: boolean): Promise<StartChoice> {
  return new Promise((resolve) => {
    const wrap = el('div', 'login');
    wrap.innerHTML = `<h1 class="stroke">CEDARVILLE<span>CLASH</span></h1>`;
    const card = el('div', 'login-card');
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    let signup = false;

    const render = (msg = ''): void => {
      card.innerHTML = '';
      const tabs = el('div', 'login-tabs');
      const tIn = el('button', `btn small ${signup ? 'gray' : 'blue'}`, 'Log in');
      const tUp = el('button', `btn small ${signup ? 'blue' : 'gray'}`, 'Sign up');
      tIn.onclick = () => {
        signup = false;
        render();
      };
      tUp.onclick = () => {
        signup = true;
        render();
      };
      tabs.append(tIn, tUp);
      card.appendChild(tabs);

      const form = el('form', 'login-form');
      form.innerHTML = `
        <label>Campus name<input name="username" autocomplete="username" required minlength="3" maxlength="20" spellcheck="false"></label>
        <label>Password<input name="password" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="${signup ? 8 : 1}" maxlength="200"></label>
        ${signup && needInvite ? '<label>Invite code<input name="invite" required maxlength="40" spellcheck="false" autocomplete="off"></label>' : ''}
        <div class="login-msg">${esc(msg)}</div>
        <button class="btn big" type="submit">${signup ? 'Create campus' : 'Log in'}</button>`;
      if (signup) form.appendChild(el('div', 'flavor', 'Campus name: 3–20 letters, numbers, spaces, or _ . \' -. Other players will see it.'));
      form.onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const body = { username: String(fd.get('username') ?? '').trim(), password: String(fd.get('password') ?? ''), invite: String(fd.get('invite') ?? '').trim() };
        const btn = form.querySelector('button[type=submit]') as HTMLButtonElement;
        btn.disabled = true;
        try {
          await api(signup ? '/api/signup' : '/api/login', body);
          const me = await api<MeResponse>('/api/me');
          setPrefersOffline(false);
          wrap.remove();
          resolve({ mode: 'online', me });
        } catch (err) {
          render((err as Error).message);
          const u = card.querySelector('input[name=username]') as HTMLInputElement | null;
          if (u) u.value = body.username;
        }
      };
      card.appendChild(form);

      const off = el('button', 'btn small gray', 'Play offline instead');
      off.title = 'Single-player, saved in this browser only. No real raids.';
      off.onclick = () => {
        setPrefersOffline(true);
        wrap.remove();
        resolve({ mode: 'offline', serverAvailable: true });
      };
      card.appendChild(off);
    };
    render();
  });
}
