// Global balancing knobs.

export const GRID = 40; // tiles per side
export const MAX_DMC = 6;

export const START_RESOURCES = { tuition: 1500, coffee: 1500, chapel: 25 };
/** DMC itself stores a bit of each resource, indexed by DMC level. */
export const DMC_STORAGE = {
  tuition: [0, 2000, 4000, 8000, 15000, 30000, 60000],
  coffee: [0, 2000, 4000, 8000, 15000, 30000, 60000],
  chapel: [0, 100, 200, 400, 800, 1500, 3000],
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
