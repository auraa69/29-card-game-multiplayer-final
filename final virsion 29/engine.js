var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// engine.ts
var engine_exports = {};
__export(engine_exports, {
  DEFAULT_CONFIG: () => DEFAULT_CONFIG,
  Game: () => Game,
  RANKS_HIGH_TO_LOW: () => RANKS_HIGH_TO_LOW,
  SUITS: () => SUITS,
  cardPoints: () => cardPoints,
  nextSeat: () => nextSeat,
  sameCard: () => sameCard,
  strength: () => strength,
  teamOf: () => teamOf
});
module.exports = __toCommonJS(engine_exports);
var SUITS = ["S", "H", "D", "C"];
var RANKS_HIGH_TO_LOW = ["J", "9", "A", "10", "K", "Q", "8", "7"];
var POINTS = { J: 3, "9": 2, A: 1, "10": 1, K: 0, Q: 0, "8": 0, "7": 0 };
var strength = (r) => 7 - RANKS_HIGH_TO_LOW.indexOf(r);
var cardPoints = (c) => POINTS[c.rank];
var teamOf = (s) => s % 2;
var nextSeat = (s) => (s + 1) % 4;
var sameCard = (a, b) => a.suit === b.suit && a.rank === b.rank;
var DEFAULT_CONFIG = { minBid: 16, maxBid: 28, marriageAdjust: 4, marriageNeedsTrick: true };
var Game = class {
  constructor(cfg = DEFAULT_CONFIG, rng = Math.random, dealer = 0) {
    this.cfg = cfg;
    this.rng = rng;
    this.startRound(dealer);
  }
  cfg;
  rng;
  s;
  // ---------- setup ----------
  startRound(dealer, notice = "") {
    const deck = [];
    for (const suit of SUITS) for (const rank of RANKS_HIGH_TO_LOW) deck.push({ suit, rank });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const hands = [0, 1, 2, 3].map((i) => deck.slice(i * 4, i * 4 + 4));
    this.s = {
      phase: "bidding",
      dealer,
      turn: nextSeat(dealer),
      hands,
      stock: deck.slice(16),
      highBid: this.cfg.minBid - 1,
      highBidder: null,
      passed: [false, false, false, false],
      bidder: null,
      bid: 0,
      trumpSuit: null,
      seventhCard: null,
      trumpRevealed: false,
      revealAsked: false,
      revealedBy: null,
      trick: [],
      ledSuit: null,
      tricksWon: [0, 0],
      points: [0, 0],
      tricksPlayed: 0,
      marriage: null,
      result: null,
      notice
    };
  }
  // ---------- queries ----------
  playable(seat) {
    const s = this.s, hand = s.hands[seat];
    if (!s.trick.length) return hand;
    const follow = hand.filter((c) => c.suit === s.ledSuit);
    if (follow.length) return follow;
    if (s.revealAsked) {
      const t = hand.filter((c) => c.suit === s.trumpSuit);
      if (t.length) return t;
    }
    return hand;
  }
  canAskReveal(seat) {
    const s = this.s;
    return s.phase === "playing" && seat === s.turn && s.trick.length > 0 && !s.trumpRevealed && !s.hands[seat].some((c) => c.suit === s.ledSuit);
  }
  canDeclareMarriage(seat, card) {
    const s = this.s;
    if (s.phase !== "playing" || !s.trumpRevealed || s.marriage !== null) return false;
    if (card.suit !== s.trumpSuit || card.rank !== "K" && card.rank !== "Q") return false;
    const other = card.rank === "K" ? "Q" : "K";
    if (!s.hands[seat].some((c) => c.suit === s.trumpSuit && c.rank === other)) return false;
    return !this.cfg.marriageNeedsTrick || s.tricksWon[teamOf(seat)] > 0;
  }
  legalActions() {
    const s = this.s, seat = s.turn, out = [];
    if (s.phase === "bidding") {
      out.push({ type: "pass" });
      for (let a = s.highBid + 1; a <= this.cfg.maxBid; a++) out.push({ type: "bid", amount: a });
    } else if (s.phase === "trump-select") {
      for (const suit of SUITS) out.push({ type: "setTrump", suit });
      out.push({ type: "setTrump", seventh: true });
    } else if (s.phase === "playing") {
      if (this.canAskReveal(seat)) out.push({ type: "reveal" });
      for (const card of this.playable(seat)) {
        out.push({ type: "play", card });
        if (this.canDeclareMarriage(seat, card)) out.push({ type: "play", card, declareMarriage: true });
      }
    }
    return out;
  }
  // What a given seat is allowed to see (send this over the network, never the raw state).
  view(seat) {
    const s = this.s;
    return {
      phase: s.phase,
      turn: s.turn,
      dealer: s.dealer,
      you: seat,
      hand: s.hands[seat],
      handSizes: s.hands.map((h) => h.length),
      highBid: s.highBid,
      highBidder: s.highBidder,
      passed: s.passed,
      bidder: s.bidder,
      bid: s.bid,
      trumpRevealed: s.trumpRevealed,
      revealedBy: s.revealedBy,
      trumpSuit: s.trumpRevealed || seat === s.bidder ? s.trumpSuit : null,
      notice: s.notice,
      seventhCard: seat === s.bidder || s.trumpRevealed ? s.seventhCard : null,
      trick: s.trick,
      ledSuit: s.ledSuit,
      tricksWon: s.tricksWon,
      marriage: s.marriage,
      points: s.phase === "finished" ? s.points : null,
      result: s.result,
      legal: seat === s.turn ? this.legalActions() : []
    };
  }
  // ---------- actions ----------
  act(seat, a) {
    const s = this.s;
    if (s.phase === "finished") throw new Error("Round is over");
    if (seat !== s.turn) throw new Error("Not your turn");
    switch (a.type) {
      case "bid": {
        if (s.phase !== "bidding") throw new Error("Not bidding phase");
        if (!Number.isInteger(a.amount) || a.amount <= s.highBid || a.amount > this.cfg.maxBid)
          throw new Error("Illegal bid");
        s.highBid = a.amount;
        s.highBidder = seat;
        return this.advanceBidding();
      }
      case "pass": {
        if (s.phase !== "bidding") throw new Error("Not bidding phase");
        s.passed[seat] = true;
        return this.advanceBidding();
      }
      case "setTrump": {
        if (s.phase !== "trump-select") throw new Error("Not trump selection");
        if (!a.seventh) {
          if (!a.suit || !SUITS.includes(a.suit)) throw new Error("Bad suit");
          s.trumpSuit = a.suit;
        }
        for (let k = 1; k <= 4; k++) {
          const p = (s.dealer + k) % 4;
          s.hands[p].push(...s.stock.splice(0, 4));
        }
        if (a.seventh) {
          s.seventhCard = s.hands[s.bidder][6];
          s.trumpSuit = s.seventhCard.suit;
        }
        const why = this.badDeal();
        if (why) {
          this.startRound(s.dealer, why);
          return;
        }
        s.phase = "playing";
        s.turn = nextSeat(s.bidder);
        return;
      }
      case "reveal": {
        if (!this.canAskReveal(seat)) throw new Error("Cannot ask for trump now");
        s.trumpRevealed = true;
        s.revealAsked = true;
        s.revealedBy = seat;
        return;
      }
      case "play": {
        if (s.phase !== "playing") throw new Error("Not playing phase");
        const hand = s.hands[seat];
        const i = hand.findIndex((c) => sameCard(c, a.card));
        if (i < 0) throw new Error("Card not in hand");
        if (!this.playable(seat).some((c) => sameCard(c, a.card))) throw new Error("Must follow suit");
        if (a.declareMarriage) {
          if (!this.canDeclareMarriage(seat, a.card)) throw new Error("Cannot declare marriage");
          s.marriage = teamOf(seat);
        }
        hand.splice(i, 1);
        if (!s.trick.length) s.ledSuit = a.card.suit;
        s.trick.push({ seat, card: a.card });
        s.revealAsked = false;
        if (s.trick.length === 4) this.finishTrick();
        else s.turn = nextSeat(seat);
        return;
      }
    }
  }
  // ---------- internals ----------
  // After all 8 cards are dealt: returns a reason if the deal must be thrown in.
  badDeal() {
    const s = this.s, bt = teamOf(s.bidder);
    if (s.hands.some((h) => h.every((c) => cardPoints(c) === 0))) return "A player has no point cards, so the cards are reshuffled";
    if (s.hands.some((h) => h.filter((c) => c.rank === "J").length === 4)) return "A player has all four Jacks, so the cards are reshuffled";
    const oppHasTrump = s.hands.some((h, i) => teamOf(i) !== bt && h.some((c) => c.suit === s.trumpSuit));
    return oppHasTrump ? "" : "The opponents have no trump card, so the cards are reshuffled";
  }
  advanceBidding() {
    const s = this.s;
    const active = [0, 1, 2, 3].filter((i) => !s.passed[i]);
    if (s.highBidder !== null && (active.length === 1 || s.highBid === this.cfg.maxBid)) {
      s.bidder = s.highBidder;
      s.bid = s.highBid;
      s.phase = "trump-select";
      s.turn = s.bidder;
    } else if (s.highBidder === null && active.length <= 1) {
      this.startRound(s.dealer, "Three players passed, so the cards are reshuffled");
    } else {
      let t = nextSeat(s.turn);
      while (s.passed[t]) t = nextSeat(t);
      s.turn = t;
    }
  }
  trickWinner() {
    const s = this.s;
    const trumps = s.trumpRevealed ? s.trick.filter((p) => p.card.suit === s.trumpSuit) : [];
    const pool = trumps.length ? trumps : s.trick.filter((p) => p.card.suit === s.ledSuit);
    return pool.reduce((a, b) => strength(b.card.rank) > strength(a.card.rank) ? b : a).seat;
  }
  finishTrick() {
    const s = this.s;
    const winner = this.trickWinner(), team = teamOf(winner);
    s.points[team] += s.trick.reduce((n, p) => n + cardPoints(p.card), 0);
    s.tricksWon[team]++;
    s.tricksPlayed++;
    s.trick = [];
    s.ledSuit = null;
    s.turn = winner;
    if (s.tricksPlayed === 8) this.finishRound();
  }
  finishRound() {
    const s = this.s;
    const bt = teamOf(s.bidder);
    let target = s.bid;
    if (s.marriage === bt) target = Math.max(this.cfg.minBid, target - this.cfg.marriageAdjust);
    else if (s.marriage !== null) target = Math.min(this.cfg.maxBid, target + this.cfg.marriageAdjust);
    const won = s.points[bt] >= target;
    const delta = [0, 0];
    delta[bt] = won ? 1 : -1;
    s.result = { bidTeam: bt, bid: s.bid, target, points: s.points, bidderWon: won, delta, marriage: s.marriage };
    s.phase = "finished";
  }
};
