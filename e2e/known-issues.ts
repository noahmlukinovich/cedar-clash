/**
 * Mobile layout problems that exist today, per "device/screen". The layout
 * tests expect exactly these: a new problem fails the test, and so does a
 * fixed one until its line is deleted here. Later mobile phases shrink this.
 */
export const KNOWN: Record<string, string[]> = {
  "iphone-se/welcome": [
    "hidden-action: button.btn.big \"Let's go, Jackets!\"",
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "overlap: div.builders.stroke \"2/2Facilities Crew5\" / div.profile \"0Prospective Student\"",
    "overlap: div.res-stack \"1,500/ 4,5001,500/ 4,50025/ 10\" / div.builders.stroke \"2/2Facilities Crew5\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "iphone-se/village": [
    "covered: button.btn.square.gold \"Shop\" under button.btn.round.gold",
    "offscreen: button.btn.round",
    "offscreen: button.btn.round.blue \"🗺️\"",
    "offscreen: button.btn.round.gray",
    "offscreen: button.btn.round.purple",
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "overlap: div.builders.stroke \"2/2Facilities Crew5\" / div.profile \"0Prospective Student\"",
    "overlap: div.res-stack \"1,500/ 4,5001,500/ 4,50025/ 10\" / div.builders.stroke \"2/2Facilities Crew5\"",
  ],
  "iphone-se/shop": [
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "overlap: div.builders.stroke \"2/2Facilities Crew5\" / div.profile \"0Prospective Student\"",
    "overlap: div.res-stack \"1,500/ 4,5001,500/ 4,50025/ 10\" / div.builders.stroke \"2/2Facilities Crew5\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
    "small: button.tab \"Army\" 87x39",
    "small: button.tab \"Decor\" 90x39",
    "small: button.tab \"Defenses\" 118x39",
    "small: button.tab.active \"Resources\" 127x39",
  ],
  "iphone-se/army": [
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "overlap: div.builders.stroke \"2/2Facilities Crew5\" / div.profile \"0Prospective Student\"",
    "overlap: div.res-stack \"1,500/ 4,5001,500/ 4,50025/ 10\" / div.builders.stroke \"2/2Facilities Crew5\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "iphone-se/attack": [
    "hidden-action: button.btn.big.gray \"🔍 Find a Rival 50\"",
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "overlap: div.builders.stroke \"2/2Facilities Crew5\" / div.profile \"0Prospective Student\"",
    "overlap: div.res-stack \"1,500/ 4,5001,500/ 4,50025/ 10\" / div.builders.stroke \"2/2Facilities Crew5\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "iphone-se/raid": [
    "overlap: div.hint.stroke.raid-hint \"Pick a card, then click (or ho\" / div.deploy-bar \"×20Freshman\"",
    "overlap: div.raid-top.stroke \"Rival State UDMC 2 · Mascot: a\" / div.raid-stars.stroke \"0%destruction\"",
    "overlap: div.raid-top.stroke \"Rival State UDMC 2 · Mascot: a\" / div.raid-timer.stroke \"Scouting… (deploy to start)0:2\"",
    "small: button.btn.red.raid-end \"End Raid\" 116x43",
  ],
  "iphone-13/welcome": [
    "hidden-action: button.btn.big \"Let's go, Jackets!\"",
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "iphone-13/village": [
    "covered: button.btn.square.gold \"Shop\" under div.side-right \"🗺️\"",
    "offscreen: button.btn.round",
    "offscreen: button.btn.round.blue \"🗺️\"",
    "offscreen: button.btn.round.gray",
    "offscreen: button.btn.round.purple",
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
  ],
  "iphone-13/shop": [
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
    "small: button.tab \"Army\" 87x39",
    "small: button.tab \"Decor\" 90x39",
    "small: button.tab \"Defenses\" 118x39",
    "small: button.tab.active \"Resources\" 127x39",
  ],
  "iphone-13/army": [
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "iphone-13/attack": [
    "hidden-action: button.btn.big.gray \"🔍 Find a Rival 50\"",
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "iphone-13/raid": [
    "overlap: div.hint.stroke.raid-hint \"Pick a card, then click (or ho\" / div.deploy-bar \"×20Freshman\"",
    "overlap: div.raid-top.stroke \"Rival State UDMC 2 · Mascot: a\" / div.raid-timer.stroke \"Scouting… (deploy to start)0:2\"",
    "small: button.btn.red.raid-end \"End Raid\" 116x43",
  ],
  "pixel-7/welcome": [
    "hidden-action: button.btn.big \"Let's go, Jackets!\"",
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "pixel-7/village": [
    "covered: button.btn.square.gold \"Shop\" under div.side-right \"🗺️\"",
    "offscreen: button.btn.round",
    "offscreen: button.btn.round.blue \"🗺️\"",
    "offscreen: button.btn.round.gray",
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
  ],
  "pixel-7/shop": [
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
    "small: button.tab \"Army\" 87x39",
    "small: button.tab \"Decor\" 90x39",
    "small: button.tab \"Defenses\" 118x39",
    "small: button.tab.active \"Resources\" 127x39",
  ],
  "pixel-7/army": [
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "pixel-7/attack": [
    "hidden-action: button.btn.big.gray \"🔍 Find a Rival 50\"",
    "overlap: div.bottom-right \"ArmyShop\" / div.side-right \"🗺️\"",
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "pixel-7/raid": [
    "overlap: div.hint.stroke.raid-hint \"Pick a card, then click (or ho\" / div.deploy-bar \"×20Freshman\"",
    "overlap: div.raid-top.stroke \"Rival State UDMC 2 · Mascot: a\" / div.raid-timer.stroke \"Scouting… (deploy to start)0:2\"",
    "small: button.btn.red.raid-end \"End Raid\" 116x43",
  ],
  "ipad/welcome": [
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "ipad/shop": [
    "small: button.btn.red.modal-close \"✖\" 42x42",
    "small: button.tab \"Army\" 87x39",
    "small: button.tab \"Decor\" 90x39",
    "small: button.tab \"Defenses\" 118x39",
    "small: button.tab.active \"Resources\" 127x39",
  ],
  "ipad/army": [
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "ipad/attack": [
    "small: button.btn.red.modal-close \"✖\" 42x42",
  ],
  "ipad/raid": [
    "overlap: div.hint.stroke.raid-hint \"Pick a card, then click (or ho\" / div.deploy-bar \"×20Freshman\"",
    "overlap: div.raid-top.stroke \"Rival State UDMC 2 · Mascot: a\" / div.raid-timer.stroke \"Scouting… (deploy to start)0:2\"",
    "small: button.btn.red.raid-end \"End Raid\" 116x43",
  ],
};
