// Chess terms the review uses, each with a short definition and a reference to read more.

export interface Term { word: string; def: string; url: string }

const WP = 'https://en.wikipedia.org/wiki/';
const CPW = 'https://www.chessprogramming.org/';

export const TERMS: Record<string, Term> = {
  accuracy: { word: 'Accuracy', def: 'How close your moves came to the engine’s best, from 0 to 100. It weighs each move by how much winning chance it gave away.', url: 'https://lichess.org/page/accuracy' },
  evaluation: { word: 'Evaluation', def: 'The engine’s judgement of a position, in pawns: +1.0 means white is about a pawn better. “M3” means a forced mate in three.', url: CPW + 'Evaluation' },
  centipawn: { word: 'Centipawn', def: 'A hundredth of a pawn, the unit engines count advantage in.', url: CPW + 'Centipawns' },
  blunder: { word: 'Blunder', def: 'A very bad move that throws away a big part of your winning chances, often losing material or allowing mate.', url: WP + 'Blunder_(chess)' },
  mistake: { word: 'Mistake', def: 'A move that clearly worsens your position, though less drastically than a blunder.', url: WP + 'Chess_annotation_symbols' },
  inaccuracy: { word: 'Inaccuracy', def: 'A move that is not the best and gives away a little, but nothing decisive.', url: WP + 'Chess_annotation_symbols' },
  hanging: { word: 'Hanging piece', def: 'A piece that can be captured for free, because nothing defends it (or it is defended too few times).', url: WP + 'Glossary_of_chess' },
  tactic: { word: 'Tactic', def: 'A short sequence of forcing moves (checks, captures, threats) that wins material or mates.', url: WP + 'Chess_tactic' },
  fork: { word: 'Fork', def: 'One piece attacking two or more enemy pieces at once, so only one can be saved.', url: WP + 'Fork_(chess)' },
  pin: { word: 'Pin', def: 'A piece that cannot move without exposing a more valuable piece (or the king) behind it.', url: WP + 'Pin_(chess)' },
  checkmate: { word: 'Checkmate', def: 'The king is in check and has no way out. The game ends at once.', url: WP + 'Checkmate' },
  material: { word: 'Material', def: 'The pieces each side has, counted in pawns: knight and bishop 3, rook 5, queen 9.', url: WP + 'Chess_piece_relative_value' },
  development: { word: 'Development', def: 'Bringing knights and bishops off the back rank early so they take part in the game.', url: WP + 'Development_(chess)' },
  tempo: { word: 'Tempo', def: 'A single move, treated as a unit of time. Moving the same piece twice in the opening “loses a tempo”.', url: WP + 'Tempo_(chess)' },
  castling: { word: 'Castling', def: 'Moving the king two squares toward a rook, which jumps over it. It tucks the king away and brings the rook out.', url: WP + 'Castling' },
  kingSafety: { word: 'King safety', def: 'How well sheltered the king is from attack, usually by castling and keeping the pawns in front of it.', url: CPW + 'King_Safety' },
  opening: { word: 'Opening', def: 'The first phase of the game, roughly the first ten to fifteen moves, spent developing pieces and fighting for the centre.', url: WP + 'Chess_opening' },
  middlegame: { word: 'Middlegame', def: 'The phase after development, where plans, attacks and tactics decide most games.', url: WP + 'Middlegame' },
  endgame: { word: 'Endgame', def: 'The phase with few pieces left, where the king becomes active and passed pawns matter most.', url: WP + 'Chess_endgame' },
  simplify: { word: 'Simplification', def: 'Trading pieces when ahead in material, so the opponent has fewer chances to fight back.', url: WP + 'Exchange_(chess)' },
  book: { word: 'Book move', def: 'A move from established opening theory, played by masters for generations.', url: WP + 'Chess_opening_book' },
  skewer: { word: 'Skewer', def: 'An attack on a valuable piece that must move, exposing a lesser piece behind it to capture. A pin in reverse.', url: WP + 'Skewer_(chess)' },
  sacrifice: { word: 'Sacrifice', def: 'Giving up material on purpose, for an attack, a mate or a better position.', url: WP + 'Sacrifice_(chess)' },
  doubleCheck: { word: 'Double check', def: 'Check from two pieces at once. No block or capture can stop both, so the king must move.', url: WP + 'Double_check' },
  discoveredCheck: { word: 'Discovered check', def: 'Moving a piece out of the way so another piece behind it gives check.', url: WP + 'Discovered_attack' },
  enPassant: { word: 'En passant', def: 'A pawn that has just moved two squares can be captured as if it had moved only one, on the very next move.', url: WP + 'En_passant' },
  underpromotion: { word: 'Underpromotion', def: 'Promoting a pawn to something other than a queen, usually a knight to give check or avoid stalemate.', url: WP + 'Promotion_(chess)#Underpromotion' },
  smotheredMate: { word: 'Smothered mate', def: 'Mate by a knight against a king hemmed in by its own pieces.', url: WP + 'Smothered_mate' },
  backRankMate: { word: 'Back-rank mate', def: 'Mate by a rook or queen along the back rank, where the king is trapped behind its own pawns.', url: WP + 'Back-rank_checkmate' },
  scholarsMate: { word: 'Scholar’s Mate', def: 'The four-move mate on f7 (or f2) by queen and bishop, the classic beginner’s trap.', url: WP + 'Scholar%27s_mate' },
  foolsMate: { word: 'Fool’s Mate', def: 'The fastest possible checkmate, after White weakens the king with f3 and g4.', url: WP + 'Fool%27s_mate' },
  arabianMate: { word: 'Arabian mate', def: 'A rook next to a cornered king, guarded by a knight that also covers the escape square. One of the oldest known mates.', url: WP + 'Checkmate_pattern#Arabian_mate' },
  anastasiasMate: { word: 'Anastasia’s mate', def: 'A rook or queen mates along the edge while a knight cuts off the king’s escape.', url: WP + 'Checkmate_pattern#Anastasia%27s_mate' },
  bodensMate: { word: 'Boden’s mate', def: 'Two bishops on crossing diagonals mate a king boxed in by its own pieces.', url: WP + 'Checkmate_pattern#Boden%27s_mate' },
  epauletteMate: { word: 'Epaulette mate', def: 'Mate by the queen against a king whose own pieces stand on both sides of it, like epaulettes.', url: WP + 'Checkmate_pattern#Epaulette_mate' },
  ladderMate: { word: 'Ladder mate', def: 'Two heavy pieces take turns checking, driving the king to the edge rank by rank, like climbing a ladder.', url: WP + 'Checkmate_pattern#Ladder_mate' },
  kissOfDeath: { word: 'Queen’s kiss', def: 'Mate by a queen right next to the king, guarded by another piece so the king cannot take her.', url: WP + 'Checkmate_pattern#Queen_mate' },
};

export const FULL_GLOSSARY = WP + 'Glossary_of_chess';

/** Split "[[term|words]]" tokens out of review text. */
export function glossaryParts(text: string) {
  const out: ({ text: string } | { term: string; shown: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[\[(\w+)(?:\|([^\]]+))?\]\]/g)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ term: m[1], shown: m[2] ?? TERMS[m[1]]?.word.toLowerCase() ?? m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}
