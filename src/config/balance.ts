// Global balancing knobs.

export const GRID = 40; // tiles per side
export const MAX_DMC = 8;

export const START_RESOURCES = { tuition: 1500, coffee: 1500, chapel: 25 };
/** DMC itself stores a bit of each resource, indexed by DMC level. */
export const DMC_STORAGE = {
  tuition: [0, 2000, 4000, 8000, 15000, 30000, 60000, 100000, 160000],
  coffee: [0, 2000, 4000, 8000, 15000, 30000, 60000, 100000, 160000],
  chapel: [0, 100, 200, 400, 800, 1500, 3000, 5000, 8000],
};

export const RAID_TIME = 180; // seconds
export const ELEPHANT_RUN_TIME = 90;
export const SCOUT_COST_PER_DMC = 50; // tuition cost of "next" (finding a match)

export const CHAPEL_DAILY_BASE = 5;
export const CHAPEL_STREAK_BONUS = 2; // per streak day, capped
export const CHAPEL_STREAK_CAP = 7;
export const THREE_STAR_CHAPEL = 10;

/** Fraction of enemy storage loot available. */
export const LOOT_FRACTION = 0.35;

/** Chapel credits per minute of remaining time when "finishing now". */
export const FINISH_NOW_PER_MIN = 1;

export const EVENT_CHECK_INTERVAL = 90; // seconds of game time between random event rolls
export const EVENT_CHANCE = 0.45;

export const DEBUG_SPEEDS = [1, 10, 60];

/** Build / research / hero-upgrade timer curve. Every timed level gets BASE× longer, and
 *  each level a further GROWTH× on top of the one before, so the next upgrade is always a big step up. */
export const UPGRADE_TIME_BASE = 3;
export const UPGRADE_TIME_GROWTH = 1.8;

/** Rounds a duration (seconds) to a tidy value: 5s steps under 2 min, whole minutes under
 *  an hour, 5-minute steps beyond that. */
function tidyTime(s: number): number {
  if (s < 120) return Math.max(5, Math.round(s / 5) * 5);
  if (s < 3600) return Math.round(s / 60) * 60;
  return Math.round(s / 300) * 300;
}

/** Applies the timer curve to a per-level time table (index 0 = Lv1). Zero stays instant. */
export function scaleTime(times: number[]): number[] {
  return times.map((t, i) => (t > 0 ? tidyTime(t * UPGRADE_TIME_BASE * UPGRADE_TIME_GROWTH ** (i - 1)) : 0));
}
