// Wandering-cultivator names for players who haven't chosen their own.

const EPITHETS = [
  'Azure', 'Crimson', 'Silent', 'Iron', 'Jade', 'Frost', 'Ember', 'Hidden', 'Wandering', 'Thunder',
  'Willow', 'Ashen', 'Golden', 'Moonlit', 'Storm', 'Drifting', 'Nameless', 'Obsidian', 'Pale', 'Swift',
];
const BEASTS = [
  'Crane', 'Tiger', 'Viper', 'Dragon', 'Phoenix', 'Fox', 'Wolf', 'Lotus', 'Blade', 'Monk',
  'Tortoise', 'Hawk', 'Leopard', 'Serpent', 'Sage', 'Qilin', 'Mantis', 'Sparrow', 'Ox', 'Pine',
];

const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];

/** A fresh name like "Azure Crane", never one of `avoid`. */
export function randomName(...avoid: string[]): string {
  for (;;) {
    const name = `${pick(EPITHETS)} ${pick(BEASTS)}`;
    if (!avoid.includes(name)) return name;
  }
}
