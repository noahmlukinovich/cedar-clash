// "What's new" notes, newest first. To announce an update, add an entry at the top with the
// next `v`. Players see the popup once, the first time they load a build with a higher `v`
// than they have seen; the full list stays available in Settings.
export interface ChangeEntry {
  v: number;
  date: string;
  title: string;
  items: string[];
}

export const CHANGELOG: ChangeEntry[] = [
  {
    v: 15,
    date: 'Nov 16, 2026',
    title: 'Revenge',
    items: [
      'Someone raided you? Hit ⚔️ Revenge on the "you were raided" popup or in the Raid Log to attack their campus right back.',
      'Revenge is free (no scouting cost) and works once per raid on you. Calling it off before deploying anything doesn\'t use it up.',
      "You can't take revenge through a shield, or while someone else is already raiding them.",
    ],
  },
  {
    v: 14,
    date: 'Nov 16, 2026',
    title: 'Raid replays',
    items: [
      'Watch any raid again. After a raid, press Watch replay on the results screen.',
      'Online, the new Raid Log button (🎬) lists your recent raids and the raids on your campus, each with a Watch button. The "you were raided" popup has one too, so you can see exactly how they got in.',
      'Replays can be paused (Space) and played at 1×, 2× or 4× speed.',
    ],
  },
  {
    v: 13,
    date: 'Nov 16, 2026',
    title: 'Name plates',
    items: [
      'Point at a building, or select it, to see its name and level on a plate above it. Works on your campus and when visiting others.',
      'Prefer a clean view? Turn name plates off in Settings.',
    ],
  },
  {
    v: 12,
    date: 'Nov 16, 2026',
    title: 'The Stinger Statue',
    items: [
      'New defense at DMC 4: the Stinger Statue, the chrome yellow jacket from outside the student center, now armed.',
      'It locks a blue beam onto the nearest raider and hits harder the longer it stays on one target. Great against Athletes and heroes; swarms keep resetting it.',
      'A Snow Day or a stun breaks the lock and resets the beam. Rival campuses at DMC 4 and up have them too.',
    ],
  },
  {
    v: 11,
    date: 'Nov 15, 2026',
    title: 'The rest of campus, rebuilt',
    items: [
      'Academic buildings are now flat-roofed brick blocks with glass walls. Each keeps its own colour on the roofline band and door canopy, and every building wears a navy name plaque.',
      'The ENS Building is mostly glass, the Library gains a clock, Callan a glass entrance, Rinnova a brick shop front with twin silos, and the Brew Lab a ribbed glass dome.',
      'RA Towers get a blue roof over the lookout, the Cedar Sprayer becomes a tiered fountain, The Hive lights up, and the Coffee Cart grows into a small plaza with umbrella tables.',
    ],
  },
  {
    v: 10,
    date: 'Nov 15, 2026',
    title: 'Base layouts',
    items: [
      'Save up to three campus layouts and switch between them any time with the new map button.',
      'The layout editor lets you rearrange freely: drag buildings around, or send them to the tray and place them again.',
      'Your current campus is saved as Layout 1, and moving buildings on campus keeps the active layout up to date.',
    ],
  },
  {
    v: 9,
    date: 'Nov 13, 2026',
    title: 'Campus buildings, rebuilt',
    items: [
      'The DMC has its real shape: a wide columned entrance under the Dixon Ministry Center name, a cluster of brick blocks behind it, and the brick tower with its slate cap, mast and ball.',
      'Residence Halls, the Admissions Office and the Registrar\'s Office have new designs: gabled bays, columned fronts, framed and lit windows.',
      'Every building gets paved lots, hedges and trees, cream stone trim and banner lamp posts as it levels up.',
    ],
  },
  {
    v: 8,
    date: 'Nov 13, 2026',
    title: 'Easier-to-read text',
    items: [
      'Cleaner outlines on headline text, and none at all on small text or text that sits on a panel.',
      'The League Ladder, Leaderboard, toasts, event chips and raid cards are much easier to read.',
      'Resource bars now show the amount and the maximum together, like 6,200 / 17.5K.',
    ],
  },
  {
    v: 7,
    date: 'Nov 12, 2026',
    title: 'Faster training and a reserve army',
    items: [
      'Every troop now trains in half the time.',
      'You can train a second army ahead of time. Once the Residence Halls are full, trained troops wait in the queue marked Ready.',
      'After a raid, the reserve moves into the halls straight away, and the rest of the queue keeps training.',
    ],
  },
  {
    v: 6,
    date: 'Nov 12, 2026',
    title: 'The Bible Prof gets a crossbow',
    items: [
      'The Prof is now The Bible Prof, and the red pen is gone: he fires Hebrew letters from a crossbow, aleph to tav, then starts over.',
      'Every fifth shot is a big gold letter that deals double damage.',
    ],
  },
  {
    v: 5,
    date: 'Nov 12, 2026',
    title: 'A new look for every level',
    items: [
      'Buildings now look different at each level: wood at Lv1, brick at Lv2, stone trim and awnings at Lv3, a cupola and gold trim at Lv4, banners and a gold finial at Lv5 and up.',
      'Walls change shape as well as colour, from wooden posts to gold battlements.',
      'Troops and heroes pick up new gear as you research them. Freshmen eventually graduate.',
      'In raids, small gold pips under a troop show its level.',
    ],
  },
  {
    v: 4,
    date: 'Nov 12, 2026',
    title: 'Five new troops',
    items: [
      'Business Major (School of Business, DMC 2): fast, goes straight for storages and collectors, and earns 10% bonus loot from anything it finishes off.',
      'Music Major (Bolthouse Center for Music, DMC 3): attacks from 3 tiles away, even over a wall. Every fourth hit is the chorus, for double damage.',
      'Cross Country Runner (Callan Lv2): runs over walls and across Cedar Lake, and hits harder the longer the run-up.',
      'RA (Residence Hall Lv3): slow and very tough. Towers and carts shoot the RA first, and a room check sets off hidden Yellow Jacket Nests early.',
      'GO Team (DMC Lv4): a Global Outreach van that unloads five team members at its first target.',
      'Two new buildings in the Shop to go with them. Research all five in the Library.',
    ],
  },
  {
    v: 3,
    date: 'Nov 12, 2026',
    title: 'Tougher troops, smoother training',
    items: [
      'All five troops (Freshman, Athlete, Engineering Major, Theology Major, Nursing Student) have 10% more hitpoints at every level. Chuck\'s has started serving protein.',
      'Army screen: hold a troop to keep recruiting, the queue groups troops with a count and shows the total time left, and a card tells you when the halls are full.',
      'Fixed: clicks on the Army screen could be dropped, and cancelling a troop now always refunds exactly what you paid.',
      "This What's New popup. You can reread it any time from Settings.",
    ],
  },
  {
    v: 2,
    date: 'Nov 12, 2026',
    title: 'Campus visits',
    items: [
      'Online: press Visit on the Leaderboard, or next to whoever just raided you, to look around their campus. Look, don\'t touch.',
      'Yellow Jacket Nests stay hidden from visitors. No free scouting.',
    ],
  },
  {
    v: 1,
    date: 'Nov 12, 2026',
    title: 'Upgrades list',
    items: [
      'Click the Facilities Crew counter to see every upgrade you can do, in one list, and start them from there.',
      'The red badge on the counter shows how many upgrades are ready right now.',
    ],
  },
];

export const LATEST_CHANGE = CHANGELOG.reduce((m, e) => Math.max(m, e.v), 0);
