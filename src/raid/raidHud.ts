// The DOM overlay for a raid: rival info, timer, stars, replay controls and the deploy cards.
import { HEROES, TROOPS } from '../config/troops';
import { SPELLS } from '../config/spells';
import { sfx } from '../core/audio';
import { ICONS, icon } from '../ui/icons';
import { spellThumb, unitThumb } from '../ui/thumbs';
import { el, esc, fmt } from '../ui/ui';
import { DIFFICULTY_LABELS, LAYOUT_INFO } from '../config/humor';
import { OBJECTIVES } from '../game/daily';
import { challengeOf } from './outcome';
import { REPLAY_SPEEDS, type RaidScene } from './raidScene';

export class RaidHud {
  root = el('div', 'hud');
  els: Record<string, HTMLElement> = {};
  private starsShown = 0;

  constructor(private sc: RaidScene) {}

  /** "DMC 3 · Gated Community · Even Match", then the tagline, the defender's trophies, or the replay label. */
  private tagLine(): string {
    const { base, setup, replay } = this.sc;
    if (replay) return `DMC ${base.dmc} · 🎬 Replay of ${esc(replay.attacker)}'s raid`;
    if (setup.defender) return `DMC ${base.dmc} · 🏆 ${setup.defender.trophies} · ${setup.defender.revenge ? '⚔️ Revenge!' : 'a real campus!'}`;
    const parts = [`DMC ${base.dmc}`];
    if (base.archetype && setup.kind !== 'daily') parts.push(LAYOUT_INFO[base.archetype].name);
    if (base.difficulty !== undefined) parts.push(DIFFICULTY_LABELS[base.difficulty]);
    return `${parts.join(' · ')}<br>${esc(base.tagline)}`;
  }

  /** What is at stake: the trophies for a ranked raid, or the objective for a Daily Challenge. */
  private stakesLine(): string {
    const sc = this.sc;
    const c = challengeOf(sc.setup);
    if (c) {
      const done = !sc.replay && sc.game.state.daily.day === c.day && sc.game.state.daily.done;
      const reward = sc.replay ? '' : `<span class="rw">${done ? 'Already cleared today (practice run)' : `Reward: +${c.reward} ${icon('chapel', 16)}`}</span>`;
      return `<div class="objective"><b>🎯 ${OBJECTIVES[c.objectiveId].desc}</b><span class="prog"></span>${reward}</div>`;
    }
    if (sc.replay || sc.kind === 'elephant' || sc.kind === 'campaign') return '';
    const w = sc.base.trophiesWin;
    return `<div class="stakes">${icon('trophy', 18)} Win: +${Math.round(w / 2)} to +${w} · Lose: −${sc.base.trophiesLose}</div>`;
  }

  build(): void {
    const h = this.root;
    h.innerHTML = '';
    const top = el('div', 'raid-top stroke');
    top.innerHTML = `<div class="enemy">${esc(this.sc.base.name)}</div><div class="tag">${this.tagLine()}</div>${this.stakesLine()}<div class="loot"><span>Available:</span><span class="lt">${icon('tuition', 22)} <b></b></span><span class="lc">${icon('coffee', 22)} <b></b></span></div><div class="loot"><span>Looted:</span><span class="gt">${icon('tuition', 22)} <b>0</b></span><span class="gc">${icon('coffee', 22)} <b>0</b></span></div>`;
    h.appendChild(top);
    const timer = el('div', 'raid-timer stroke', `<div class="lbl">Scouting…</div><div class="t">3:00</div>`);
    h.appendChild(timer);
    const stars = el('div', 'raid-stars stroke', `<div class="stars">${icon('starEmpty', 34).repeat(3)}</div><div class="pct">0%</div><div style="font-size:12px">destruction</div>`);
    h.appendChild(stars);
    const end = el('button', 'btn red raid-end', this.sc.replay ? 'Exit Replay' : 'End Raid');
    end.onclick = () => {
      sfx('click');
      if (this.sc.replay) {
        this.sc.game.endRaid();
        return;
      }
      if (this.sc.ended) return;
      this.sc.engine.apply({ t: 0, k: 'end' });
      this.sc.finish();
    };
    h.appendChild(end);
    if (this.sc.replay) h.appendChild(this.buildReplayBar());
    else {
      const hint = el('div', 'hint stroke raid-hint', 'Pick a card, then click (or hold) on open grass outside the white zone to deploy.');
      h.appendChild(hint);
      setTimeout(() => hint.remove(), 6000);
    }
    const bar = el('div', 'deploy-bar');
    h.appendChild(bar);
    this.els = {
      prog: top.querySelector('.prog') as HTMLElement,
      timer,
      timerT: timer.querySelector('.t') as HTMLElement,
      timerL: timer.querySelector('.lbl') as HTMLElement,
      stars: stars.querySelector('.stars') as HTMLElement,
      pct: stars.querySelector('.pct') as HTMLElement,
      lt: top.querySelector('.lt b') as HTMLElement,
      lc: top.querySelector('.lc b') as HTMLElement,
      gt: top.querySelector('.gt b') as HTMLElement,
      gc: top.querySelector('.gc b') as HTMLElement,
      bar,
      end,
    };
    this.renderCards();
  }

  /** Replay controls: pause/play and playback speed. */
  buildReplayBar(): HTMLElement {
    const bar = el('div', 'replay-bar');
    const play = el('button', 'btn small blue', '❚❚ Pause');
    play.title = 'Pause or resume (Space)';
    play.onclick = () => {
      sfx('click');
      this.sc.togglePause();
    };
    bar.appendChild(play);
    this.sc.playBtn = play;
    for (const sp of REPLAY_SPEEDS) {
      const b = el('button', `btn small ${sp === this.sc.speed ? 'gold' : 'gray'}`, `${sp}×`);
      b.dataset.speed = String(sp);
      b.title = `Play at ${sp}× speed`;
      b.onclick = () => {
        sfx('click');
        this.sc.speed = sp;
        bar.querySelectorAll<HTMLElement>('[data-speed]').forEach((x) => {
          const on = x.dataset.speed === String(sp);
          x.classList.toggle('gold', on);
          x.classList.toggle('gray', !on);
        });
      };
      bar.appendChild(b);
    }
    return bar;
  }

  renderCards(): void {
    const bar = this.els.bar;
    bar.innerHTML = '';
    this.sc.cards.forEach((c, i) => {
      const d = el('div', `dcard ${i === this.sc.sel && !this.sc.replay ? 'sel' : ''}`);
      const n = this.sc.count(c);
      if (c.kind === 'troop') {
        d.appendChild(unitThumb(c.type, 72, 66, this.sc.engine.setup.troopLevels[c.type] ?? 1));
        d.appendChild(el('div', 'n', `×${n}`));
        d.appendChild(el('div', 'nm', TROOPS[c.type].short ?? TROOPS[c.type].name.split(' ')[0]));
        if (n <= 0) d.classList.add('empty');
      } else if (c.kind === 'hero') {
        d.classList.add('hero');
        d.appendChild(unitThumb(c.type, 72, 66, this.sc.engine.setup.heroLevels[c.type] ?? 1));
        d.appendChild(el('div', 'nm', HEROES[c.type].name.replace('The ', '')));
        const u = this.sc.deployed(c);
        if (u) {
          const hp = el('div', 'hpbar', `<div style="width:${Math.max(0, (u.hp / u.maxHp) * 100)}%"></div>`);
          d.appendChild(hp);
          if (!u.abilityUsed && !u.dead) d.appendChild(el('div', 'ability', HEROES[c.type].ability.name));
          else d.classList.add('empty');
        }
      } else {
        d.classList.add('spell');
        d.appendChild(spellThumb(c.type, 72, 66));
        d.appendChild(el('div', 'n', `×${n}`));
        d.appendChild(el('div', 'nm', SPELLS[c.type].name));
        if (n <= 0) d.classList.add('empty');
      }
      d.title = c.kind === 'troop' ? TROOPS[c.type].desc : c.kind === 'hero' ? `${HEROES[c.type].desc}` : SPELLS[c.type].desc;
      if (!this.sc.replay) d.onclick = () => this.sc.clickCard(i);
      bar.appendChild(d);
    });
    if (!this.sc.cards.length) bar.appendChild(el('div', 'hint stroke', 'No troops! (End the raid and train some.)'));
  }

  renderCardCounts(): void {
    const bar = this.els.bar;
    this.sc.cards.forEach((c, i) => {
      const d = bar.children[i] as HTMLElement | undefined;
      if (!d) return;
      if (c.kind === 'troop' || c.kind === 'spell') {
        const n = d.querySelector('.n');
        const k = this.sc.count(c);
        if (n) n.textContent = `×${k}`;
        d.classList.toggle('empty', k <= 0);
      }
      d.classList.toggle('sel', i === this.sc.sel && !this.sc.replay);
    });
  }

  update(): void {
    const e = this.els;
    const eng = this.sc.engine;
    const t = Math.max(0, eng.started ? eng.timeLeft : eng.scoutLeft);
    e.timerT.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    e.timerL.textContent = eng.started ? 'Raid ends in' : this.sc.replay ? 'Scouting…' : 'Scouting… (deploy to start)';
    e.pct.textContent = `${Math.floor(this.sc.sim.destruction * 100)}%`;
    e.lt.textContent = fmt(this.sc.sim.lootAvail.tuition - this.sc.sim.loot.tuition);
    e.lc.textContent = fmt(this.sc.sim.lootAvail.coffee - this.sc.sim.loot.coffee);
    e.gt.textContent = fmt(this.sc.sim.loot.tuition);
    e.gc.textContent = fmt(this.sc.sim.loot.coffee);
    if (this.sc.sim.stars !== this.starsShown) {
      this.starsShown = this.sc.sim.stars;
      e.stars.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const s = el('span', `ic ${i === this.sc.sim.stars - 1 ? 'pop' : ''}`, i < this.sc.sim.stars ? ICONS.star : ICONS.starEmpty);
        s.style.width = s.style.height = '34px';
        e.stars.appendChild(s);
      }
    }
    const c = challengeOf(this.sc.setup);
    if (c && e.prog) {
      const m = this.sc.engine.metrics();
      const o = OBJECTIVES[c.objectiveId];
      e.prog.textContent = o.progress(m);
      e.prog.classList.toggle('met', o.met(m));
    }
  }
}
