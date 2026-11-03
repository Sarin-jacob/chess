// Named openings, matched by position so move-order transpositions still find their name.
// Each line is the moves that define it; every position along a line counts as book.
import { Chess, type Move } from 'chess.js';

const LINES: [string, string][] = [
  ['King’s Pawn Opening', 'e4'],
  ['Queen’s Pawn Opening', 'd4'],
  ['English Opening', 'c4'],
  ['Réti Opening', 'Nf3'],
  ['King’s Fianchetto Opening', 'g3'],
  ['Nimzo-Larsen Attack', 'b3'],
  ['Bird’s Opening', 'f4'],
  ['Polish Opening', 'b4'],
  ['Grob’s Attack', 'g4'],
  ['Van Geet Opening', 'Nc3'],
  ['Barnes Opening', 'f3'],

  ['King’s Pawn Game', 'e4 e5'],
  ['King’s Knight Opening', 'e4 e5 Nf3'],
  ['King’s Knight Opening: Normal Variation', 'e4 e5 Nf3 Nc6'],
  ['Ruy López', 'e4 e5 Nf3 Nc6 Bb5'],
  ['Ruy López: Morphy Defence', 'e4 e5 Nf3 Nc6 Bb5 a6'],
  ['Ruy López: Exchange Variation', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'],
  ['Ruy López: Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7'],
  ['Ruy López: Open', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4'],
  ['Ruy López: Berlin Defence', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
  ['Italian Game', 'e4 e5 Nf3 Nc6 Bc4'],
  ['Italian Game: Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['Italian Game: Classical Variation', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3'],
  ['Italian Game: Giuoco Pianissimo', 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3'],
  ['Italian Game: Evans Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4'],
  ['Italian Game: Two Knights Defence', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['Two Knights Defence: Knight Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5'],
  ['Two Knights Defence: Fried Liver Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
  ['Italian Game: Hungarian Defence', 'e4 e5 Nf3 Nc6 Bc4 Be7'],
  ['Italian Game: Blackburne Shilling Gambit', 'e4 e5 Nf3 Nc6 Bc4 Nd4'],
  ['Scotch Game', 'e4 e5 Nf3 Nc6 d4'],
  ['Scotch Gambit', 'e4 e5 Nf3 Nc6 d4 exd4 Bc4'],
  ['Three Knights Opening', 'e4 e5 Nf3 Nc6 Nc3'],
  ['Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
  ['Ponziani Opening', 'e4 e5 Nf3 Nc6 c3'],
  ['Petrov’s Defence', 'e4 e5 Nf3 Nf6'],
  ['Philidor Defence', 'e4 e5 Nf3 d6'],
  ['Latvian Gambit', 'e4 e5 Nf3 f5'],
  ['Elephant Gambit', 'e4 e5 Nf3 d5'],
  ['King’s Gambit', 'e4 e5 f4'],
  ['King’s Gambit Accepted', 'e4 e5 f4 exf4'],
  ['King’s Gambit Declined: Classical', 'e4 e5 f4 Bc5'],
  ['Vienna Game', 'e4 e5 Nc3'],
  ['Bishop’s Opening', 'e4 e5 Bc4'],
  ['Centre Game', 'e4 e5 d4'],
  ['Danish Gambit', 'e4 e5 d4 exd4 c3'],
  ['Wayward Queen Attack', 'e4 e5 Qh5'],
  ['Bongcloud Attack', 'e4 e5 Ke2'],

  ['Sicilian Defence', 'e4 c5'],
  ['Sicilian Defence: Alapin Variation', 'e4 c5 c3'],
  ['Sicilian Defence: Closed', 'e4 c5 Nc3'],
  ['Sicilian Defence: Grand Prix Attack', 'e4 c5 Nc3 Nc6 f4'],
  ['Sicilian Defence: McDonnell Attack', 'e4 c5 f4'],
  ['Sicilian Defence: Smith-Morra Gambit', 'e4 c5 d4 cxd4 c3'],
  ['Sicilian Defence: Moscow Variation', 'e4 c5 Nf3 d6 Bb5+'],
  ['Sicilian Defence: Rossolimo Variation', 'e4 c5 Nf3 Nc6 Bb5'],
  ['Sicilian Defence: Hyperaccelerated Dragon', 'e4 c5 Nf3 g6'],
  ['Sicilian Defence: Accelerated Dragon', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6'],
  ['Sicilian Defence: Sveshnikov Variation', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5'],
  ['Sicilian Defence: Najdorf Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
  ['Sicilian Defence: Dragon Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
  ['Sicilian Defence: Classical Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6'],
  ['Sicilian Defence: Scheveningen Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6'],
  ['Sicilian Defence: French Variation', 'e4 c5 Nf3 e6'],
  ['Sicilian Defence: Kan Variation', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6'],
  ['Sicilian Defence: Taimanov Variation', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6'],

  ['French Defence', 'e4 e6'],
  ['French Defence: Advance Variation', 'e4 e6 d4 d5 e5'],
  ['French Defence: Exchange Variation', 'e4 e6 d4 d5 exd5'],
  ['French Defence: Tarrasch Variation', 'e4 e6 d4 d5 Nd2'],
  ['French Defence: Winawer Variation', 'e4 e6 d4 d5 Nc3 Bb4'],
  ['French Defence: Classical Variation', 'e4 e6 d4 d5 Nc3 Nf6'],
  ['Caro-Kann Defence', 'e4 c6'],
  ['Caro-Kann Defence: Advance Variation', 'e4 c6 d4 d5 e5'],
  ['Caro-Kann Defence: Exchange Variation', 'e4 c6 d4 d5 exd5 cxd5'],
  ['Caro-Kann Defence: Panov Attack', 'e4 c6 d4 d5 exd5 cxd5 c4'],
  ['Caro-Kann Defence: Classical Variation', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
  ['Scandinavian Defence', 'e4 d5'],
  ['Scandinavian Defence: Modern Variation', 'e4 d5 exd5 Nf6'],
  ['Alekhine’s Defence', 'e4 Nf6'],
  ['Pirc Defence', 'e4 d6 d4 Nf6 Nc3 g6'],
  ['Modern Defence', 'e4 g6'],
  ['Nimzowitsch Defence', 'e4 Nc6'],
  ['Owen’s Defence', 'e4 b6'],
  ['St. George Defence', 'e4 a6'],

  ['Queen’s Pawn Game', 'd4 d5'],
  ['Queen’s Gambit', 'd4 d5 c4'],
  ['Queen’s Gambit Accepted', 'd4 d5 c4 dxc4'],
  ['Queen’s Gambit Declined', 'd4 d5 c4 e6'],
  ['Slav Defence', 'd4 d5 c4 c6'],
  ['Semi-Slav Defence', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6'],
  ['Albin Countergambit', 'd4 d5 c4 e5'],
  ['Chigorin Defence', 'd4 d5 c4 Nc6'],
  ['London System', 'd4 d5 Bf4'],
  ['London System', 'd4 d5 Nf3 Nf6 Bf4'],
  ['London System', 'd4 Nf6 Bf4'],
  ['Colle System', 'd4 d5 Nf3 Nf6 e3'],
  ['Blackmar-Diemer Gambit', 'd4 d5 e4'],
  ['Indian Defence', 'd4 Nf6'],
  ['Nimzo-Indian Defence', 'd4 Nf6 c4 e6 Nc3 Bb4'],
  ['Queen’s Indian Defence', 'd4 Nf6 c4 e6 Nf3 b6'],
  ['Catalan Opening', 'd4 Nf6 c4 e6 g3'],
  ['King’s Indian Defence', 'd4 Nf6 c4 g6 Nc3 Bg7'],
  ['Grünfeld Defence', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['Modern Benoni', 'd4 Nf6 c4 c5 d5 e6'],
  ['Benko Gambit', 'd4 Nf6 c4 c5 d5 b5'],
  ['Budapest Gambit', 'd4 Nf6 c4 e5'],
  ['Trompowsky Attack', 'd4 Nf6 Bg5'],
  ['Dutch Defence', 'd4 f5'],
  ['Englund Gambit', 'd4 e5'],

  ['English Opening: King’s English', 'c4 e5'],
  ['English Opening: Symmetrical Variation', 'c4 c5'],
  ['English Opening: Anglo-Indian Defence', 'c4 Nf6'],
];

/** Position key: pieces and side to move. */
const key = (fen: string) => fen.split(' ').slice(0, 2).join(' ');

let book: Map<string, string | null> | null = null;

/** Every position along a named line; the name where the line ends there, else null. */
function positions() {
  if (book) return book;
  book = new Map();
  for (const [name, moves] of LINES) {
    const c = new Chess();
    const sans = moves.split(' ');
    sans.forEach((san, i) => {
      c.move(san);
      const k = key(c.fen());
      if (i === sans.length - 1) book!.set(k, name);
      else if (!book!.has(k)) book!.set(k, null);
    });
  }
  return book;
}

/** How many opening moves were straight from the book, and the deepest name reached. */
export function openingOf(history: Move[]): { plies: number; name: string | null } {
  const b = positions();
  let plies = 0;
  let name: string | null = null;
  for (const m of history) {
    const k = key(m.after);
    if (!b.has(k)) break;
    plies++;
    name = b.get(k) ?? name;
  }
  return { plies, name };
}
