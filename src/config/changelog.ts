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
    v: 27,
    date: 'Nov 18, 2026',
    title: 'New spell: Syllabus Week',
    items: [
      'The Student Center Brew Lab can go to Lv4 at DMC 8. It brews Syllabus Week and holds one more spell.',
      'Syllabus Week is the first healing spell: your troops inside the zone heal 6% of their health every second for 8 seconds. Nothing is due yet, so everyone gets some rest.',
      'A Snow Day now also freezes Parking Gate Arms, so you can sneak past one without a bonk.',
    ],
  },
  {
    v: 26,
    date: 'Nov 18, 2026',
    title: 'New troop: the Senior',
    items: [
      'Biblical Studies can now go to Lv4 at DMC 7, where it trains Seniors (12 housing, Coffee).',
      'Seniors are tough and slow, with a bad case of senioritis: they barely try when the raid starts, then hit harder and move faster every second. Two minutes in they are at +80% damage and +50% speed, and the whole campus hears about it.',
      'Research them up to level 7 in the Library. They pick up a gold stole, honor cords and, at last, a diploma.',
      "Fixed: The Rock's crash damage now keeps growing at research levels 6 and 7.",
    ],
  },
  {
    v: 25,
    date: 'Nov 18, 2026',
    title: 'Parking Gate Arm',
    items: [
      'New at DMC 8: the Parking Gate Arm, four per campus. It is a wall tile that fits into your wall lines and joins up with the walls next to it.',
      'The first raider to walk up to it gets the striped arm swung down on their head (400 to 700 damage by level) and is knocked back up to 2 tiles. Heroes fly half as far; The Rock does not budge.',
      'After its one swing the arm stays up, and it is just a very sturdy wall. A Snow Day freezes it, so raiders can sneak past without a bonk.',
    ],
  },
  {
    v: 24,
    date: 'Nov 17, 2026',
    title: "Dean's Office",
    items: [
      "New DMC 8 defense: the Dean's Office. One per campus.",
      'It sends a pink summons at the nearest raider, then the paperwork jumps on to the next raider within 3 tiles, and the next: 3, 4 or 5 jumps depending on level.',
      'Each jump hits for 75% of the one before, and nobody gets summoned twice by the same slip. Swarms beware.',
    ],
  },
  {
    v: 23,
    date: 'Nov 17, 2026',
    title: 'Fire Alarm trap',
    items: [
      'New hidden trap at DMC 7: the Fire Alarm. Two at DMC 7, three at DMC 8.',
      'When a raider gets close, the alarm goes off. Every raider nearby files out a tile or so and stands around outside for 2 to 3 seconds, depending on level.',
      'Heroes only stay out half as long, RAs know the drill and head back sooner, and The Rock is too heavy to file anywhere (it still stops).',
      'A Chapel Announcement drowns it out, the same as other traps.',
    ],
  },
  {
    v: 22,
    date: 'Nov 17, 2026',
    title: 'DMC 7 and 8: Commencement',
    items: [
      'The DMC can now be upgraded to level 7 and level 8. Reaching DMC 8 earns the new "Commencement" achievement.',
      'New top levels: Admissions, Coffee Cart, Registrar, Rinnova, RA Tower, Campus Safety Cart and Brick Walls go to Lv8; Residence Halls and the Library to Lv7; The Hive, Bible Prof Tower and the Casserole Catapult to Lv6; the Stinger Statue and Cedar Sprayer to Lv5; Yellow Jacket Nests to Lv4.',
      'Build more: an extra RA Tower, Safety Cart, Residence Hall, Facilities Crew shed, storage, collector, splash defenses, nests, lakes and 50 more walls across the two new levels.',
      'Every troop can be researched to level 7 (Library 6 and 7). The Bible Prof goes to level 7 and The President to level 5.',
      'The DMC itself stores more, and rival campuses now show up at DMC 7 and 8 with bigger loot.',
      'New looks: a clock tower and Commencement banners on the DMC, navy and white-marble walls, and navy trim and gold bollards around every top-level building.',
    ],
  },
  {
    v: 21,
    date: 'Nov 17, 2026',
    title: 'Stinger Statue buff',
    items: [
      'The Stinger Statue hits a lot harder: single-mode beam damage is up about 75% at every lock-on stage, and multi-mode beams are up about 70%.',
      'It locks on faster: the beam steps up after 1s and hits full power at 3s (was 1.5s and 4s).',
      'Range is up from 7 to 8 tiles, and it is about 35% tougher.',
    ],
  },
  {
    v: 20,
    date: 'Nov 17, 2026',
    title: 'Bigger projects, longer timelines',
    items: [
      'Building upgrades, troop research and hero upgrades now take longer, and each level takes a lot longer than the one before.',
      'Early levels still finish in a few minutes. The top upgrades now run for hours, so start them before you log off: timers keep running while you are away.',
      'Upgrades already in progress finish on their original timer.',
    ],
  },
  {
    v: 19,
    date: 'Nov 17, 2026',
    title: 'New troop: The Rock',
    items: [
      'Train it at a Residence Hall Lv4. It takes 25 housing space, so plan your army around it.',
      'The toughest troop on campus, and the slowest. It walks straight past everything else to get to defenses, soaking up fire while the rest of your army works.',
      "Too heavy to shove: a Casserole Catapult still hurts it, but can't knock it back.",
      'When it finally cracks, it crashes onto every building within 1.5 tiles, and two Pebbles roll out to finish the job.',
      'Every Rock wears a different paint job. Nobody knows who repaints it at night.',
    ],
  },
  {
    v: 18,
    date: 'Nov 17, 2026',
    title: "New defense: Chuck's Casserole Catapult",
    items: [
      'Unlocks at DMC 4 (a second one at DMC 6). Find it in the Shop under Defense.',
      "It lobs a tray of Mystery Bake up to 12 tiles at the biggest bunch of raiders. Everyone under the splash takes damage and gets knocked back, which stops them in their tracks.",
      "A red shadow shows where each tray will land. Quick troops can get out of the way before it hits.",
      "Blind spot: it can't fire at anything within 4 tiles. Cover it with other defenses, or send a tank to stand right next to it.",
    ],
  },
  {
    v: 17,
    date: 'Nov 17, 2026',
    title: 'Stinger Statue: Multi mode',
    items: [
      'Select a Stinger Statue and tap 🎯 Single / 🔱 Multi to switch its targeting. Switching is free and instant.',
      'Single mode is the classic: one beam that hits harder the longer it holds.',
      'Multi mode beams 3 raiders at once (4 at Lv2, 5 at Lv3) for steady damage that never ramps. Great against swarms, weaker against tanks and heroes.',
      'Rival campuses field both kinds. Watch for the sparks circling the stinger tip.',
    ],
  },
  {
    v: 16,
    date: 'Nov 17, 2026',
    title: 'Coffee-brewed bricks',
    items: [
      'Walls can now be upgraded with Coffee as well as Tuition, at the same price. Select a wall and pick which Upgrade button to use.',
      'The Upgrades list shows both prices on the Walls row, so leftover Coffee can go straight into your defenses.',
    ],
  },
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
