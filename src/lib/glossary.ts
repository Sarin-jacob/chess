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
