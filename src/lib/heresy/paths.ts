// The heterodox paths: four unorthodox sects and two demonic cults, each keeping an
// anarchy-chess scripture of its own.
import type { VariantId } from './rules';

export type Faction = 'unorthodox' | 'demonic';

export interface Path {
  id: VariantId;
  faction: Faction;
  name: string;
  hanzi: string;
  meaning: string;
  /** One line under the name. */
  motto: string;
  rules: string[];
  /** Shouted when the variant's signature move happens. */
  cry: string;
  /** Opponent names by level, 1..4. */
  foes: [string, string, string, string];
}

const STRAYS: Path['foes'] = ['Stray Cultivator', 'Sect Enforcer', 'Wayward Elder', 'Sect Patriarch'];
const DEMONS: Path['foes'] = ['Blood Acolyte', 'Demon General', 'Heavenly Demon Envoy', 'The Heavenly Demon'];

export const PATHS: Path[] = [
  {
    id: 'holyhell',
    faction: 'unorthodox',
    name: 'Holy Hell Sect',
    hanzi: '圣狱',
    meaning: 'Holy Prison',
    motto: 'Google en passant. Then obey it.',
    rules: [
      'Orthodox chess, with one law above all others.',
      'En passant is compulsory: when a pawn can be taken en passant, it must be. Other moves are forbidden until it is done.',
      'Pawns may still be pushed two squares, if the player dares.',
    ],
    cry: 'Holy hell!',
    foes: STRAYS,
  },
  {
    id: 'vatican',
    faction: 'unorthodox',
    name: 'Il Vaticano Conclave',
    hanzi: '双象',
    meaning: 'Twin Elephants',
    motto: 'Two bishops, two pawns, one holy rite.',
    rules: [
      'Orthodox chess, plus the rite of Il Vaticano.',
      'When two of your bishops stand on the same rank or file with exactly two enemy pawns between them, either bishop may perform it.',
      'The bishops swap places and both pawns are taken in a single move.',
    ],
    cry: 'Il Vaticano!',
    foes: STRAYS,
  },
  {
    id: 'bongcloud',
    faction: 'unorthodox',
    name: 'Bongcloud Order',
    hanzi: '云步',
    meaning: 'Cloud Step',
    motto: 'The king walks alone, and he walks first.',
    rules: [
      'Kings stride up to two squares in any straight line. The square passed over must be empty and not attacked.',
      'There is no castling. A true master shelters behind nothing.',
      'A king that reaches the enemy back rank ascends: that side wins at once. Checkmate still wins too.',
    ],
    cry: 'Bongcloud!',
    foes: STRAYS,
  },
  {
    id: 'threecheck',
    faction: 'unorthodox',
    name: 'Three Palms Sect',
    hanzi: '三掌',
    meaning: 'Three Palms',
    motto: 'Strike the king thrice and he falls.',
    rules: [
      'Orthodox chess.',
      'Every check is a palm strike. The first side to land three wins.',
      'Checkmate still wins, should it come sooner.',
    ],
    cry: 'Palm strike!',
    foes: STRAYS,
  },
  {
    id: 'atomic',
    faction: 'demonic',
    name: 'Blood Furnace Cult',
    hanzi: '血爆',
    meaning: 'Blood Burst',
    motto: 'Every capture is a sacrifice to the furnace.',
    rules: [
      'Every capture explodes. The capturing piece, the captured piece and every piece except pawns on the eight squares around are destroyed.',
      'Blow up the enemy king to win. Checkmate wins too.',
      'Kings cannot capture, and no move may blow up your own king.',
      'Touching kings cannot check each other: one blast would take both.',
    ],
    cry: 'The furnace roars!',
    foes: DEMONS,
  },
  {
    id: 'antichess',
    faction: 'demonic',
    name: 'Reversed Heart Cult',
    hanzi: '逆心',
    meaning: 'Reversed Heart',
    motto: 'Give away everything. The one left with nothing wins.',
    rules: [
      'Captures are compulsory: if you can take, you must (choose which).',
      'The king is an ordinary piece. There is no check, no mate and no castling, and pawns may promote to kings.',
      'Lose all your pieces, or be left without a legal move, and you win.',
    ],
    cry: 'Taken, as you wished.',
    foes: DEMONS,
  },
];

export const pathById = (id: string) => PATHS.find((p) => p.id === id);
