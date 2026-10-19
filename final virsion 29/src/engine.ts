// 29 card game engine: pure rules, no UI, no networking.
// Used by the offline mode (browser + bots) and the multiplayer server (authoritative).

export type Suit = 'S' | 'H' | 'D' | 'C';
export type Rank = 'J' | '9' | 'A' | '10' | 'K' | 'Q' | '8' | '7';
export type Seat = 0 | 1 | 2 | 3; // teams: seats 0&2 vs 1&3
export type Team = 0 | 1;
export interface Card { suit: Suit; rank: Rank }

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const RANKS_HIGH_TO_LOW: Rank[] = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];
const POINTS: Record<Rank, number> = { J: 3, '9': 2, A: 1, '10': 1, K: 0, Q: 0, '8': 0, '7': 0 };

export const strength = (r: Rank) => 7 - RANKS_HIGH_TO_LOW.indexOf(r);
export const cardPoints = (c: Card) => POINTS[c.rank];
export const teamOf = (s: Seat): Team => (s % 2) as Team;
export const nextSeat = (s: Seat): Seat => ((s + 1) % 4) as Seat;
export const sameCard = (a: Card, b: Card) => a.suit === b.suit && a.rank === b.rank;

export interface Config {
  minBid: number;            // 16
  maxBid: number;            // 28
  marriageAdjust: number;    // bidder's marriage: target -4, opponents' marriage: target +4
  marriageNeedsTrick: boolean; // declaring team must already have won a trick
}
export const DEFAULT_CONFIG: Config = { minBid: 16, maxBid: 28, marriageAdjust: 4, marriageNeedsTrick: true };

export type Phase = 'bidding' | 'trump-select' | 'single' | 'double' | 'redouble' | 'playing' | 'finished';

export type Action =
  | { type: 'bid'; amount: number }
  | { type: 'pass' }
  | { type: 'setTrump'; suit?: Suit; seventh?: boolean }               // bidder names the trump suit (secret until revealed)
  | { type: 'single'; on: boolean } | { type: 'double'; on: boolean } | { type: 'redouble'; on: boolean }
  | { type: 'reveal' }                              // void in led suit: ask to see trump
  | { type: 'play'; card: Card; declareMarriage?: boolean };

export interface RoundResult {
  bidTeam: Team; bid: number; target: number;
  points: [number, number]; bidderWon: boolean;
  delta: [number, number]; // game-point change per team (bidding team +1 / -1)
  marriage: Team | null;
  single: boolean; stake: number; amount: number; // amount = game points won/lost by the bidding team
}

interface State {
  phase: Phase; dealer: Seat; turn: Seat;
  hands: Card[][]; stock: Card[];
  highBid: number; highBidder: Seat | null; passed: boolean[];
  bidder: Seat | null; bid: number;
  trumpSuit: Suit | null; seventhCard: Card | null;
  trumpRevealed: boolean; revealAsked: boolean; revealedBy: Seat | null;
  trick: { seat: Seat; card: Card }[]; ledSuit: Suit | null;
  tricksWon: [number, number]; points: [number, number]; tricksPlayed: number;
  marriage: Team | null; result: RoundResult | null; notice: string;
  single: boolean; stake: number; sitOut: Seat | null; queue: Seat[];
}

export class Game {
  s!: State;

  constructor(private cfg: Config = DEFAULT_CONFIG, private rng: () => number = Math.random, dealer: Seat = 0) {
    this.startRound(dealer);
  }

  // ---------- setup ----------
  startRound(dealer: Seat, notice = '') {
    const deck: Card[] = [];
    for (const suit of SUITS) for (const rank of RANKS_HIGH_TO_LOW) deck.push({ suit, rank });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // first 4 cards each (bidding is done on these), remaining 16 wait in the stock
    const hands: Card[][] = [0, 1, 2, 3].map(i => deck.slice(i * 4, i * 4 + 4));
    this.s = {
      phase: 'bidding', dealer, turn: nextSeat(dealer),
      hands, stock: deck.slice(16),
      highBid: this.cfg.minBid - 1, highBidder: null, passed: [false, false, false, false],
      bidder: null, bid: 0,
      trumpSuit: null, seventhCard: null, trumpRevealed: false, revealAsked: false, revealedBy: null,
      trick: [], ledSuit: null,
      tricksWon: [0, 0], points: [0, 0], tricksPlayed: 0,
      marriage: null, result: null, notice, single: false, stake: 1, sitOut: null, queue: [],
    };
  }

  // ---------- queries ----------
  private playable(seat: Seat): Card[] {
    const s = this.s, hand = s.hands[seat];
    if (!s.trick.length) return hand;
    const follow = hand.filter(c => c.suit === s.ledSuit);
    if (follow.length) return follow;
    if (s.revealAsked) {                       // you asked for trump -> must trump if you can
      const t = hand.filter(c => c.suit === s.trumpSuit);
      if (t.length) return t;
    }
    return hand;
  }

  canAskReveal(seat: Seat): boolean {
    const s = this.s;
    return s.phase === 'playing' && seat === s.turn && s.trick.length > 0 &&
      !s.trumpRevealed && !s.hands[seat].some(c => c.suit === s.ledSuit);
  }

  canDeclareMarriage(seat: Seat, card: Card): boolean {
    const s = this.s;
    if (s.phase !== 'playing' || !s.trumpRevealed || s.marriage !== null || s.single) return false;
    if (card.suit !== s.trumpSuit || (card.rank !== 'K' && card.rank !== 'Q')) return false;
    const other: Rank = card.rank === 'K' ? 'Q' : 'K';
    if (!s.hands[seat].some(c => c.suit === s.trumpSuit && c.rank === other)) return false;
    return !this.cfg.marriageNeedsTrick || s.tricksWon[teamOf(seat)] > 0;
  }

  legalActions(): Action[] {
    const s = this.s, seat = s.turn, out: Action[] = [];
    if (s.phase === 'bidding') {
      out.push({ type: 'pass' });
      for (let a = s.highBid + 1; a <= this.cfg.maxBid; a++) out.push({ type: 'bid', amount: a });
    } else if (s.phase === 'trump-select') {
      for (const suit of SUITS) out.push({ type: 'setTrump', suit });
      out.push({ type: 'setTrump', seventh: true }); // let the bidder's 7th card decide
    } else if (s.phase === 'single' || s.phase === 'double' || s.phase === 'redouble') {
      out.push({ type: s.phase, on: true }, { type: s.phase, on: false });
    } else if (s.phase === 'playing') {
      if (this.canAskReveal(seat)) out.push({ type: 'reveal' });
      for (const card of this.playable(seat)) {
        out.push({ type: 'play', card });
        if (this.canDeclareMarriage(seat, card)) out.push({ type: 'play', card, declareMarriage: true });
      }
    }
    return out;
  }

  // What a given seat is allowed to see (send this over the network, never the raw state).
  view(seat: Seat) {
    const s = this.s;
    return {
      phase: s.phase, turn: s.turn, dealer: s.dealer, you: seat,
      hand: s.hands[seat], handSizes: s.hands.map(h => h.length),
      highBid: s.highBid, highBidder: s.highBidder, passed: s.passed,
      bidder: s.bidder, bid: s.bid,
      trumpRevealed: s.trumpRevealed, revealedBy: s.revealedBy,
      trumpSuit: s.trumpRevealed || seat === s.bidder ? s.trumpSuit : null,
      notice: s.notice,
      seventhCard: seat === s.bidder || s.trumpRevealed ? s.seventhCard : null,
      single: s.single, stake: s.stake, sitOut: s.sitOut, trickSize: s.single ? 3 : 4,
      trick: s.trick, ledSuit: s.ledSuit,
      tricksWon: s.tricksWon, marriage: s.marriage,
      points: s.phase === 'finished' ? s.points : null,
      result: s.result,
      legal: seat === s.turn ? this.legalActions() : [],
    };
  }

  // ---------- actions ----------
  act(seat: Seat, a: Action): void {
    const s = this.s;
    if (s.phase === 'finished') throw new Error('Round is over');
    if (seat !== s.turn) throw new Error('Not your turn');

    switch (a.type) {
      case 'bid': {
        if (s.phase !== 'bidding') throw new Error('Not bidding phase');
        if (!Number.isInteger(a.amount) || a.amount <= s.highBid || a.amount > this.cfg.maxBid)
          throw new Error('Illegal bid');
        s.highBid = a.amount; s.highBidder = seat;
        return this.advanceBidding();
      }
      case 'pass': {
        if (s.phase !== 'bidding') throw new Error('Not bidding phase');
        s.passed[seat] = true;
        return this.advanceBidding();
      }
      case 'setTrump': {
        if (s.phase !== 'trump-select') throw new Error('Not trump selection');
        if (!a.seventh) {
          if (!a.suit || !SUITS.includes(a.suit)) throw new Error('Bad suit');
          s.trumpSuit = a.suit;
        }
        // deal the remaining 4 cards each
        for (let k = 1; k <= 4; k++) {
          const p = ((s.dealer + k) % 4) as Seat;
          s.hands[p].push(...s.stock.splice(0, 4));
        }
        if (a.seventh) {                                   // trump = suit of the bidder's 7th card
          s.seventhCard = s.hands[s.bidder!][6]; s.trumpSuit = s.seventhCard.suit;
        }
        const why = this.badDeal();
        if (why) { this.startRound(s.dealer, why); return; }   // same dealer reshuffles
        s.phase = 'single'; s.turn = s.bidder!;            // next: bidder may go single hand
        return;
      }
      case 'single': {
        if (s.phase !== 'single') throw new Error('Not the single-hand decision');
        if (a.on) {                                       // play alone: partner sits out, no double possible
          s.single = true; s.sitOut = ((s.bidder! + 2) % 4) as Seat; s.hands[s.sitOut] = [];
          this.beginPlay();
        } else this.askDouble();
        return;
      }
      case 'double': {
        if (s.phase !== 'double') throw new Error('Not the double decision');
        if (a.on) { s.stake = 2; this.askRedouble(); } else this.nextAsk();
        return;
      }
      case 'redouble': {
        if (s.phase !== 'redouble') throw new Error('Not the redouble decision');
        if (a.on) { s.stake = 4; this.beginPlay(); } else this.nextAsk();
        return;
      }
      case 'reveal': {
        if (!this.canAskReveal(seat)) throw new Error('Cannot ask for trump now');
        s.trumpRevealed = true; s.revealAsked = true; s.revealedBy = seat;
        
        return; // same player now plays (must trump if they hold trump)
      }
      case 'play': {
        if (s.phase !== 'playing') throw new Error('Not playing phase');
        const hand = s.hands[seat];
        const i = hand.findIndex(c => sameCard(c, a.card));
        if (i < 0) throw new Error('Card not in hand');
        if (!this.playable(seat).some(c => sameCard(c, a.card))) throw new Error('Must follow suit');
        if (a.declareMarriage) {
          if (!this.canDeclareMarriage(seat, a.card)) throw new Error('Cannot declare marriage');
          s.marriage = teamOf(seat);
        }
        hand.splice(i, 1);
        if (!s.trick.length) s.ledSuit = a.card.suit;
        s.trick.push({ seat, card: a.card });
        s.revealAsked = false;
        if (s.trick.length === (s.single ? 3 : 4)) this.finishTrick(); else s.turn = this.nextPlayer(seat);
        return;
      }
    }
  }

  // ---------- internals ----------
  private nextPlayer(seat: Seat): Seat { let t = nextSeat(seat); if (t === this.s.sitOut) t = nextSeat(t); return t; }
  private beginPlay() { const s = this.s; s.phase = 'playing'; s.turn = nextSeat(s.bidder!); }
  private askDouble() { const s = this.s, b = s.bidder!; s.phase = 'double'; s.queue = [nextSeat(b), ((b + 3) % 4) as Seat]; s.turn = s.queue[0]; }
  private askRedouble() { const s = this.s, b = s.bidder!; s.phase = 'redouble'; s.queue = [b, ((b + 2) % 4) as Seat]; s.turn = s.queue[0]; }
  private nextAsk() { const s = this.s; s.queue.shift(); if (s.queue.length) s.turn = s.queue[0]; else this.beginPlay(); }

  // After all 8 cards are dealt: returns a reason if the deal must be thrown in.
  private badDeal(): string {
    const s = this.s, bt = teamOf(s.bidder!);
    if (s.hands.some(h => h.every(c => cardPoints(c) === 0))) return 'A player has no point cards, so the cards are reshuffled';
    if (s.hands.some(h => h.filter(c => c.rank === 'J').length === 4)) return 'A player has all four Jacks, so the cards are reshuffled';
    const oppHasTrump = s.hands.some((h, i) => teamOf(i as Seat) !== bt && h.some(c => c.suit === s.trumpSuit));
    return oppHasTrump ? '' : 'The opponents have no trump card, so the cards are reshuffled';
  }

  private advanceBidding() {
    const s = this.s;
    const active = ([0, 1, 2, 3] as Seat[]).filter(i => !s.passed[i]);
    if (s.highBidder !== null && (active.length === 1 || s.highBid === this.cfg.maxBid)) {
      s.bidder = s.highBidder; s.bid = s.highBid;
      s.phase = 'trump-select'; s.turn = s.bidder;
    } else if (s.highBidder === null && active.length <= 1) {
      this.startRound(s.dealer, 'Three players passed, so the cards are reshuffled');
    } else {
      let t = nextSeat(s.turn);
      while (s.passed[t]) t = nextSeat(t);
      s.turn = t;
    }
  }

  private trickWinner(): Seat {
    const s = this.s;
    const trumps = s.trumpRevealed ? s.trick.filter(p => p.card.suit === s.trumpSuit) : [];
    const pool = trumps.length ? trumps : s.trick.filter(p => p.card.suit === s.ledSuit);
    return pool.reduce((a, b) => (strength(b.card.rank) > strength(a.card.rank) ? b : a)).seat;
  }

  private finishTrick() {
    const s = this.s;
    const winner = this.trickWinner(), team = teamOf(winner);
    s.points[team] += s.trick.reduce((n, p) => n + cardPoints(p.card), 0);
    s.tricksWon[team]++; s.tricksPlayed++;
    s.trick = []; s.ledSuit = null; s.turn = winner;
    // single hand ends the moment the opponents win a trick
    if (s.tricksPlayed === 8 || (s.single && team !== teamOf(s.bidder!))) this.finishRound();
  }

  private finishRound() {
    const s = this.s;
    const bt = teamOf(s.bidder!);
    let target = s.bid;
    if (s.marriage === bt) target = Math.max(this.cfg.minBid, target - this.cfg.marriageAdjust);
    else if (s.marriage !== null) target = Math.min(this.cfg.maxBid, target + this.cfg.marriageAdjust);
    const won = s.single ? s.tricksWon[bt] === 8 : s.points[bt] >= target;
    const delta: [number, number] = [0, 0];
    const amount = s.single ? 4 : s.stake;
    delta[bt] = won ? amount : -amount;
    s.result = { bidTeam: bt, bid: s.bid, target, points: s.points, bidderWon: won, delta, marriage: s.marriage, single: s.single, stake: s.stake, amount };
    s.phase = 'finished';
  }
}

// A team reaching +6 (or the other team reaching -6) wins the game.
export function gameWinner(total: number[]): Team | null {
  if (total[0] >= 6 || total[1] <= -6) return 0;
  if (total[1] >= 6 || total[0] <= -6) return 1;
  return null;
}
