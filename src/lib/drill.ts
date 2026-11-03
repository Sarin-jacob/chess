// Judging a move someone tries in a position with a known better answer: the review's
// "find it yourself" and the Heart Demon trials both ask the Elder the same question.
import { Chess, type Move } from 'chess.js';
import { grade, isMateScore, mateIn } from './analysis';
import { analyse, scoreText } from './engine';

export type Judgement = { kind: 'right' | 'close' | 'wrong'; text: string; reply: { from: string; to: string; promotion?: string } | null; score: number };

const sanOf = (fen: string, from: string, to: string, promotion?: string) => {
  try { return new Chess(fen).move({ from, to, promotion }).san; } catch { return null; }
};

/**
 * Was `m` (just played from `fen`) as good as the Elder's `best`, scored `bestScore` for the mover?
 * Mates count as found when the mate is still forced; otherwise "as good" means graded best or
 * excellent against the best score.
 */
export async function judge(fen: string, m: Move, best: { from: string; to: string; san: string }, bestScore: number, channel: string): Promise<Judgement> {
  const after = new Chess(m.after);
  if ((m.from === best.from && m.to === best.to) || after.isCheckmate())
    return { kind: 'right', text: `${m.san}! ${after.isCheckmate() ? 'Mate.' : 'The Elder’s own path.'}`, reply: null, score: bestScore };
  const res = await analyse(m.after, { depth: 12, ms: 600, mate: 3 }, channel);
  const score = -res.score;
  const reply = res.from ? { from: res.from, to: res.to, promotion: res.promotion } : null;
  const replySan = reply ? sanOf(m.after, reply.from, reply.to, reply.promotion) : null;
  if (isMateScore(bestScore) && bestScore > 0) {
    const still = isMateScore(score) && score > 0;
    return still
      ? { kind: 'right', text: `${m.san} keeps the mate going (mate in ${mateIn(score)}).`, reply, score }
      : { kind: 'wrong', text: `Not ${m.san}: ${replySan ? `after ${replySan} ` : ''}the mate is gone (${scoreText(score)}).`, reply, score };
  }
  const g = grade(bestScore, score, false, false);
  if (g.verdict === 'best' || g.verdict === 'excellent') return { kind: 'right', text: `${m.san} works too: ${scoreText(score)}, as strong as ${best.san}.`, reply, score };
  if (g.verdict === 'good') return { kind: 'close', text: `${m.san} is sound (${scoreText(score)}), but ${best.san} was stronger (${scoreText(bestScore)}).`, reply, score };
  return { kind: 'wrong', text: `Not ${m.san}: ${replySan ? `after ${replySan} ` : ''}it stands at ${scoreText(score)}.`, reply, score };
}
