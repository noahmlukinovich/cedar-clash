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
    v: 3,
    date: 'Nov 12, 2026',
    title: 'Tougher troops',
    items: [
      'All five troops (Freshman, Athlete, Engineering Major, Theology Major, Nursing Student) have 10% more hitpoints at every level. Chuck\'s has started serving protein.',
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
