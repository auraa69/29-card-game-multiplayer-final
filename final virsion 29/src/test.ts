import { Game, Action } from './engine';

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(29);
const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
let singles = 0, stakes = 0, rounds = 0, revealed = 0, marriages = 0, bidderWins = 0;

for (let g = 0; g < 5000; g++) {
  const game = new Game(undefined, rng, (g % 4) as 0 | 1 | 2 | 3);
  let guard = 0;
  while (game.s.phase !== 'finished') {
    if (++guard > 500) throw new Error('stuck');
    const legal = game.legalActions();
    let a: Action;
    if (game.s.phase === 'bidding') a = rng() < 0.55 ? { type: 'pass' } : pick(legal);
    else if (game.s.phase === 'playing' && legal.some(x => x.type === 'reveal') && rng() < 0.7) a = { type: 'reveal' };
    else a = pick(legal.filter(x => x.type !== 'reveal') as Action[]);
    game.act(game.s.turn, a);
  }
  const s = game.s;
  const r = s.result!;
  if (Math.abs(r.delta[r.bidTeam]) !== (s.single ? 4 : s.stake)) throw new Error('bad stake');
  if (s.single) { singles++; if (r.bidderWon !== (s.tricksWon[r.bidTeam] === 8)) throw new Error('single rule'); }
  else {
    if (s.points[0] + s.points[1] !== 28) throw new Error('points != 28: ' + s.points);
    if (s.hands.some(h => h.length)) throw new Error('cards left over');
    if (s.tricksPlayed !== 8) throw new Error('tricks != 8');
    if (s.stake > 1) stakes++;
  }
  rounds++; if (s.trumpRevealed) revealed++; if (s.marriage !== null) marriages++; if (s.result!.bidderWon) bidderWins++;
}
console.log({ singles, stakes, rounds, revealed, marriages, bidderWins });
console.log('OK: 5000 random rounds, points always sum to 28, no illegal states');
