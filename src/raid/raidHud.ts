// The DOM overlay for a raid: enemy info, timer, stars, and the deploy cards.
import { DIFFICULTY_LABELS, LAYOUT_INFO } from '../config/humor';
import { SPELLS } from '../config/spells';
import { HEROES, TROOPS } from '../config/troops';
import { sfx } from '../core/audio';
import { el, fmt } from '../ui/dom';
import { ICONS, icon } from '../ui/icons';
import { spellThumb, unitThumb } from '../ui/thumbs';
import type { RaidScene } from './raidScene';

export class RaidHud {
  root = el('div', 'hud');
  private els: Record<string, HTMLElement> = {};
  private starsShown = 0;

  constructor(private sc: RaidScene) {}

  /** "DMC 3 · Gated Community · Even Match", or the rival's tagline when there is nothing to add. */
  private tagLine(): string {
    const b = this.sc.base;
    const parts = [`DMC ${b.dmc}`];
    if (b.archetype) parts.push(LAYOUT_INFO[b.archetype].name);
    if (b.difficulty !== undefined) parts.push(DIFFICULTY_LABELS[b.difficulty]);
    return `${parts.join(' · ')}<br>${b.tagline}`;
  }

  /** What is at stake: trophies for a ranked raid, the objective for a daily. */
  private stakesLine(): string {
    const sc = this.sc;
    if (sc.daily) {
      return `<div class="objective"><b>🎯 ${sc.daily.objective.desc}</b><span class="prog"></span><span class="rw">${sc.dailyDone ? 'Already cleared today (practice run)' : `Reward: +${sc.daily.reward} ${icon('chapel', 16)}`}</span></div>`;
    }
    if (sc.kind === 'elephant') return '';
    const w = sc.base.trophiesWin;
    return `<div class="stakes">${icon('trophy', 18)} Win: +${Math.round(w / 2)} to +${w} · Lose: −${sc.base.trophiesLose}</div>`;
  }

  build(): void {
    const sc = this.sc;
    const h = this.root;
    h.innerHTML = '';
    const top = el('div', 'raid-top stroke');
    top.innerHTML = `<div class="enemy">${sc.base.name}</div><div class="tag">${this.tagLine()}</div>${this.stakesLine()}<div class="loot"><span>Available:</span><span class="lt">${icon('tuition', 22)} <b></b></span><span class="lc">${icon('coffee', 22)} <b></b></span></div><div class="loot"><span>Looted:</span><span class="gt">${icon('tuition', 22)} <b>0</b></span><span class="gc">${icon('coffee', 22)} <b>0</b></span></div>`;
    h.appendChild(top);
    const timer = el('div', 'raid-timer stroke', `<div class="lbl">Scouting…</div><div class="t">3:00</div>`);
    h.appendChild(timer);
    const stars = el('div', 'raid-stars stroke', `<div class="stars">${icon('starEmpty', 34).repeat(3)}</div><div class="pct">0%</div><div style="font-size:12px">destruction</div>`);
    h.appendChild(stars);
    const end = el('button', 'btn red raid-end', 'End Raid');
    end.onclick = () => {
      sfx('click');
      sc.endEarly();
    };
    h.appendChild(end);
    const hint = el('div', 'hint stroke raid-hint', 'Pick a card, then click (or hold) on open grass outside the white zone to deploy.');
    h.appendChild(hint);
    setTimeout(() => hint.remove(), 6000);
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

  renderCards(): void {
    const sc = this.sc;
    const bar = this.els.bar;
    bar.innerHTML = '';
    sc.cards.forEach((c, i) => {
      const d = el('div', `dcard ${i === sc.sel ? 'sel' : ''}`);
      if (c.kind === 'troop') {
        d.appendChild(unitThumb(c.type, 72, 66));
        d.appendChild(el('div', 'n stroke', `x${c.count}`));
        d.appendChild(el('div', 'nm', TROOPS[c.type].name.split(' ')[0]));
        if (c.count <= 0) d.classList.add('empty');
      } else if (c.kind === 'hero') {
        d.classList.add('hero');
        d.appendChild(unitThumb(c.type, 72, 66));
        d.appendChild(el('div', 'nm', HEROES[c.type].name.replace('The ', '')));
        if (c.deployed) {
          const hp = el('div', 'hpbar', `<div style="width:${Math.max(0, (c.deployed.hp / c.deployed.maxHp) * 100)}%"></div>`);
          d.appendChild(hp);
          if (!c.deployed.abilityUsed && !c.deployed.dead) d.appendChild(el('div', 'ability stroke', HEROES[c.type].ability.name));
          else d.classList.add('empty');
        }
      } else {
        d.classList.add('spell');
        d.appendChild(spellThumb(c.type, 72, 66));
        d.appendChild(el('div', 'n stroke', `x${c.count}`));
        d.appendChild(el('div', 'nm', SPELLS[c.type].name));
        if (c.count <= 0) d.classList.add('empty');
      }
      d.title = c.kind === 'troop' ? TROOPS[c.type].desc : c.kind === 'hero' ? `${HEROES[c.type].desc}` : SPELLS[c.type].desc;
      d.onclick = () => sc.clickCard(i);
      bar.appendChild(d);
    });
    if (!sc.cards.length) bar.appendChild(el('div', 'hint stroke', 'No troops! (End the raid and train some.)'));
  }

  /** Cheap update while holding to deploy: just the counts and the selection highlight. */
  renderCardCounts(): void {
    const sc = this.sc;
    const bar = this.els.bar;
    sc.cards.forEach((c, i) => {
      const d = bar.children[i] as HTMLElement | undefined;
      if (!d) return;
      if (c.kind === 'troop' || c.kind === 'spell') {
        const n = d.querySelector('.n');
        if (n) n.textContent = `x${c.count}`;
        d.classList.toggle('empty', c.count <= 0);
      }
      d.classList.toggle('sel', i === sc.sel);
    });
  }

  update(): void {
    const sc = this.sc;
    const e = this.els;
    const t = Math.max(0, sc.started ? sc.timeLeft : sc.scoutLeft);
    e.timerT.textContent = `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    e.timerL.textContent = sc.started ? 'Raid ends in' : 'Scouting… (deploy to start)';
    e.pct.textContent = `${Math.floor(sc.sim.destruction * 100)}%`;
    e.lt.textContent = fmt(sc.sim.lootAvail.tuition - sc.sim.loot.tuition);
    e.lc.textContent = fmt(sc.sim.lootAvail.coffee - sc.sim.loot.coffee);
    e.gt.textContent = fmt(sc.sim.loot.tuition);
    e.gc.textContent = fmt(sc.sim.loot.coffee);
    if (sc.sim.stars !== this.starsShown) {
      this.starsShown = sc.sim.stars;
      e.stars.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const s = el('span', `ic ${i === sc.sim.stars - 1 ? 'pop' : ''}`, i < sc.sim.stars ? ICONS.star : ICONS.starEmpty);
        s.style.width = s.style.height = '34px';
        e.stars.appendChild(s);
      }
    }
    if (sc.daily && e.prog) {
      const r = sc.dailyResult();
      e.prog.textContent = sc.daily.objective.progress(r);
      e.prog.classList.toggle('met', sc.daily.objective.met(r));
    }
  }
}
