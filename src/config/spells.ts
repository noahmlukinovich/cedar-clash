import type { SpellDef, SpellType } from './types';

export const SPELLS: Record<SpellType, SpellDef> = {
  allnighter: {
    type: 'allnighter',
    name: 'All-Nighter',
    desc: 'Troops in the area get +60% damage and +40% speed while inside it.',
    flavor: 'Four energy drinks, one Rinnova cold brew, zero regrets (until 9am).',
    res: 'coffee',
    cost: 1500,
    brewTime: 30,
    housing: 1,
    sscLevel: 1,
    radius: 3.5,
    duration: 9,
    color: '#ff4fa3',
  },
  snowday: {
    type: 'snowday',
    name: 'Snow Day',
    desc: 'Freezes defenses (and fans) in the area for 5 seconds.',
    flavor: 'The email everyone refreshes their inbox for at 5:45am. It never comes. Except now.',
    res: 'coffee',
    cost: 2000,
    brewTime: 40,
    housing: 1,
    sscLevel: 2,
    radius: 3,
    duration: 5,
    color: '#8fd8ff',
  },
  announcement: {
    type: 'announcement',
    name: 'Chapel Announcement',
    desc: 'Troops inside the zone ignore traps while it lasts. Everyone is too busy listening.',
    flavor: '"Before we begin, a few quick announcements…" (forty-five minutes later)',
    res: 'chapel',
    cost: 8,
    brewTime: 40,
    housing: 1,
    sscLevel: 3,
    radius: 4.5,
    duration: 10,
    color: '#ffd84a',
  },
};

export const SPELL_CAPACITY = [0, 2, 3, 4]; // by SSC level
export const SPELL_ORDER: SpellType[] = ['allnighter', 'snowday', 'announcement'];
