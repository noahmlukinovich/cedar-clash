// All the jokes live here so they're easy to tweak / extend.
// Noah & friends: add your own inside jokes to these arrays!

export const LOADING_TIPS: string[] = [
  'Pro tip: the Library is quieter than the Bible Prof Tower.',
  'Pro tip: Freshmen get lost. This is not a bug. This is orientation.',
  'Pro tip: Cedar Sprayer + Bible Prof Tower = frozen clumps of raiders getting prayed at. Hard.',
  'Pro tip: Athletes go for defenses first. Like a linebacker, but for parking-ticket golf carts.',
  'Pro tip: Engineering Majors deal 10x damage to walls. They have been waiting their whole lives for this.',
  'Pro tip: Nursing Students heal your troops. They will also remind you to hydrate.',
  'Pro tip: Attend Chapel daily for Chapel Credits. Skipping is noticed. Skipping is ALWAYS noticed.',
  'Pro tip: Cedar Lake blocks troop pathing. Do not ask how deep it is. Nobody knows.',
  'Pro tip: Ohio wind is not a weather event. It is a lifestyle.',
  'Pro tip: In Ohio, it can be sunny, snowing, and tornado-warning in the same raid.',
  'Pro tip: Walls are made of red brick. Of course they are.',
  'Pro tip: Your Facilities Crew is doing their best. They are also mowing. Again.',
  'Pro tip: Ring by Spring season boosts troops who pair up. Coincidence? Ask your RA.',
  'Pro tip: If the training queue stalls, your troops are waiting in line at Chuck\'s.',
  'Pro tip: Campus Safety will ticket idle troops. Keep them raiding.',
  'Pro tip: Coffee production doubles during Finals Week. So does crying in the library.',
  'Pro tip: Rinnova stores Coffee. Also stores 40% of all group-project procrastination.',
  'Pro tip: The President\'s Convocation buff stacks with All-Nighter. Do not tell the Dean.',
  'Pro tip: The Bible Prof\'s Pop Quiz stuns everything nearby. Like a real pop quiz.',
  'Pro tip: the Bible Prof\'s crossbow fires the Hebrew alphabet in order. Every fifth letter hits twice as hard.',
  'Loading... (the Wi-Fi in the dorms is also loading)',
  'Loading... finding a parking spot (this may take a while)',
  'Loading... counting the bricks (we lost count)',
];

export const RIVAL_NAMES: string[] = [
  'Rival State U',
  'Big Ten Wannabe College',
  'Online Degree Mill',
  'Generic Directional State',
  'Party School Polytechnic',
  'Commuter Campus Tech',
  'Ivy-ish Institute of Vibes',
  'Football Factory A&M',
  'Clickbait University Online',
  'Overpriced Liberal Arts Academy',
  'Hypothetical Tech',
  'Six-Year Plan State',
  'Unaccredited Barn College',
  'The College of Parking Lots',
];

export const RIVAL_TAGLINES: string[] = [
  'Mascot: a vaguely aggressive bird.',
  'Known for: a football stadium bigger than the library.',
  'Enrollment: 12 humans and 40,000 bots.',
  'Motto: "We have a lazy river."',
  'Their chapel is a parking garage.',
  'Their dining hall has a sushi bar. Unforgivable.',
  'Rated #1 by a website they own.',
  'Classes are optional. So is the roof.',
];

export interface League {
  name: string;
  min: number;
  color: string;
}

export const LEAGUES: League[] = [
  { name: 'Prospective Student', min: 0, color: '#9aa5b1' },
  { name: 'Campus Visit Day', min: 100, color: '#b88a5a' },
  { name: 'Orientation Survivor', min: 250, color: '#c0c7d0' },
  { name: 'Sophomore Slump', min: 450, color: '#e3b341' },
  { name: 'Declared Major', min: 700, color: '#5ec2e8' },
  { name: "Dean's List", min: 1000, color: '#7d5fff' },
  { name: 'Summa Cum Laude', min: 1400, color: '#ff6b6b' },
  { name: 'Board of Trustees', min: 1900, color: '#ffd23f' },
];

export function leagueFor(trophies: number): League {
  let l = LEAGUES[0];
  for (const x of LEAGUES) if (trophies >= x.min) l = x;
  return l;
}

export const WIN_LINES: string[] = [
  'Their admissions office has requested a transcript of this beatdown.',
  'Your troops are celebrating with a Rinnova run. Responsibly.',
  'The rival campus has called an emergency faculty meeting.',
  'Highlights will be shown at Chapel. (They will not.)',
  'Somewhere, a rival mascot is crying into its foam finger.',
];

export const LOSE_LINES: string[] = [
  'Academic probation, but for raiding.',
  'Your troops are taking this to the Lord in prayer. And to the Coffee Cart.',
  'Not great. Not terrible. Actually, pretty terrible.',
  'The Bible Prof would like to see you during office hours.',
  'It\'s fine. Everyone fails their first Calc II exam.',
];

export const CHAPEL_SKIP_LINES: string[] = [
  'We noticed you missed Chapel yesterday. We are not mad. We are just... praying for you.',
  'Your Chapel attendance card has been flagged. Please see the Dean of Students at your earliest convenience.',
  'An RA has been dispatched to check on you. They brought a clipboard.',
];

export const CHAPEL_ATTEND_LINES: string[] = [
  'You found a seat in the balcony. Credits earned!',
  'You arrived during the announcements. Still counts!',
  'Great message today. You only checked your phone twice.',
  'You sang the bridge three more times than necessary. Credits earned!',
];

export const CHUCKS_LINE = "waiting in line at Chuck's…";

export const TICKET_LINES: string[] = [
  'Campus Safety ticketed your idle troops for loitering near the fire lane.',
  'Campus Safety ticketed a Freshman for parking a skateboard in a faculty spot.',
  'Campus Safety ticketed your army for "excessive standing around."',
  'Campus Safety found your troops idling by the lake. Ticket issued (with a smile).',
];

export const CONSTRUCTION_LINES: string[] = [
  'Campus construction has begun! A tile is fenced off. Nobody knows what is being built. Nobody ever does.',
  'New sidewalk incoming! It will be torn up again next semester.',
  'Facilities is "improving drainage." Orange fencing has appeared.',
];

export const WIND_LINES: string[] = [
  'OHIO WIND! Hold on to your lanyards!',
  'Gust warning: the walk from Lawlor to the DMC just got longer.',
  'The wind has opinions about your formation.',
];

export const EVENT_INFO: Record<string, { name: string; desc: string; icon: string }> = {
  ringbyspring: {
    name: 'Ring by Spring',
    desc: 'Troops that pair up get +20% damage and speed. Love is in the (Ohio) air.',
    icon: '💍',
  },
  finals: {
    name: 'Finals Week',
    desc: 'Coffee production x2. Troop training 50% slower (everyone is studying).',
    icon: '📚',
  },
  construction: {
    name: 'Campus Construction',
    desc: 'A tile is fenced off with orange fencing. It will be done "soon."',
    icon: '🚧',
  },
  elephantrun: {
    name: 'Elephant Run',
    desc: 'Limited-time raid mode: Freshmen only, holding hands in a giant line, +50% speed, 90 seconds. Bonus loot!',
    icon: '🐘',
  },
};

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  reward: number; // chapel credits
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'deanslist', name: "Dean's List", desc: 'Win a raid with 3 stars.', reward: 15 },
  { id: 'probation', name: 'Academic Probation', desc: 'Lose 3 raids. Character building!', reward: 5 },
  { id: 'lakebridge', name: 'Walked Across the Lake Bridge', desc: 'Place a Cedar Lake on your campus.', reward: 5 },
  { id: 'freshman15', name: 'Freshman 15', desc: 'Train 15 Freshmen.', reward: 5 },
  { id: 'chapelregular', name: 'Chapel Regular', desc: 'Reach a 3-day Chapel streak.', reward: 10 },
  { id: 'ticketed', name: 'Parking Ticket Collector', desc: 'Get ticketed by Campus Safety.', reward: 3 },
  { id: 'allnighter', name: 'Pulled an All-Nighter', desc: 'Cast the All-Nighter spell.', reward: 5 },
  { id: 'dmc3', name: 'Upperclassman', desc: 'Upgrade the DMC to level 3.', reward: 10 },
  { id: 'dmc5', name: 'Senior Status', desc: 'Upgrade the DMC to level 5.', reward: 25 },
  { id: 'popquiz', name: 'Pop Quiz!', desc: "Use the Bible Prof's Pop Quiz.", reward: 5 },
  { id: 'ringbyspring', name: 'Ring by Spring', desc: 'Win a raid during Ring by Spring.', reward: 10 },
  { id: 'windblown', name: 'Ohio Weather Survivor', desc: 'Win a raid during an Ohio wind gust.', reward: 5 },
  { id: 'elephant', name: 'Elephant Runner', desc: 'Complete an Elephant Run.', reward: 10 },
  { id: 'destroyer', name: 'Rivalry Week', desc: 'Destroy 100 enemy buildings.', reward: 20 },
  { id: 'wallbreaker', name: 'Load-Bearing Assumption', desc: 'Have Engineering Majors destroy 25 walls.', reward: 10 },
];
