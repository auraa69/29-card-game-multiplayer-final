// 29 multiplayer server. The server owns the game; clients only receive their own view.
const express = require('express'), http = require('http'), { Server } = require('socket.io');
const E = require('./engine.js'), { botMove } = require('./bot.js');

const app = express();
app.use('/cards', express.static(__dirname + '/public/cards', { maxAge: '30d', immutable: true }));   // card pictures: cache hard
app.use(express.static(__dirname + '/public'));
app.use('/.well-known', express.static(__dirname + '/public/.well-known', { dotfiles: 'allow' })); // for the APK (hides the URL bar)
const srv = http.createServer(app), io = new Server(srv, { cors: { origin: '*' } });
const rooms = new Map();
const SY = { S: '♠', H: '♥', D: '♦', C: '♣' };
const cleanAv = a => (Number.isInteger(a) && a >= 0 && a < 12 ? a : 0);
const clean = n => String(n || 'Player').trim().slice(0, 14) || 'Player';
const newCode = () => { let c; do { c = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.random() * 24 | 0]).join(''); } while (rooms.has(c)); return c; };

function emitAll(r) {
  r.t = Date.now();
  const names = r.seats.map(s => s ? s.name + (!s.bot && !s.sid ? ' (offline)' : '') : '-');
  r.seats.forEach((s, i) => {
    if (!s || !s.sid) return;
    io.to(s.sid).emit('room', {
      code: r.code, you: i, host: r.host, started: !!r.game,
      seats: r.seats.map(x => x && { name: x.name, bot: !!x.bot, on: !!(x.bot || x.sid), av: x.av | 0 }),
    });
    if (r.game) io.to(s.sid).emit('state', { view: r.game.view(i), names, total: r.total, lastTrick: r.last, ev: r.ev, act: r.act, avs: r.seats.map(x => (x && x.av) | 0), winner: E.gameWinner(r.total) });
  });
}

function desc(r, seat, a) {
  const n = r.seats[seat].name;
  if (a.type === 'bid') return `${n} bid ${a.amount}`;
  if (a.type === 'pass') return `${n} passed`;
  if (a.type === 'match') return `${n} matched ${r.game.s.highBid}`;
  if (a.type === 'setTrump') return `${n} set the hidden trump`;
  if (a.type === 'single') return a.on ? `${n} goes SINGLE HAND, partner sits out` : `${n} plays with a partner`;
  if (a.type === 'double') return a.on ? `${n} calls DOUBLE!` : `${n} passes on double`;
  if (a.type === 'redouble') return a.on ? `${n} calls REDOUBLE!` : `${n} declines to redouble`;
  if (a.type === 'reveal' && r.game.s.joker) return `${n} asked for trump: JOKER, no trump`;
  if (a.type === 'reveal') return `${n} asked for trump: ${SY[r.game.s.trumpSuit]}${r.game.s.seventhCard ? ' (7th card ' + r.game.s.seventhCard.rank + SY[r.game.s.seventhCard.suit] + ')' : ''}`;
  return `${n} played ${a.card.rank}${SY[a.card.suit]}${a.declareMarriage ? ' — marriage!' : ''}`;
}

function apply(r, seat, a) {
  const g = r.game, before = g.s;
  const done = a.type === 'play' && before.trick.length === (before.single ? 2 : 3) ? [...before.trick, { seat, card: a.card }] : null;
  g.act(seat, a);                                   // throws if illegal
  r.act = { id: ++r.actId, type: a.type, amount: a.amount, on: a.on, declareMarriage: a.declareMarriage };
  r.ev = g.s !== before ? (g.s.notice || 'New deal') : desc(r, seat, a);
  if (done) r.last = { id: ++r.lastId, cards: done, winner: g.s.turn };
  if (g.s.phase === 'finished' && r.scored !== g.s.result) {
    r.scored = g.s.result; r.total[0] += g.s.result.delta[0]; r.total[1] += g.s.result.delta[1];
  }
  r.wait = Date.now() + (done ? 2800 : g.s !== before ? 2600 : 0);
  emitAll(r); pump(r);
}

function pump(r) {                                   // let bots move
  const g = r.game;
  if (!g || r.timer || g.s.phase === 'finished') return;
  const st = r.seats[g.s.turn];
  if (!st || !st.bot) return;
  r.timer = setTimeout(() => {
    r.timer = null;
    const seat = g.s.turn;
    if (r.game !== g || g.s.phase === 'finished' || !r.seats[seat] || !r.seats[seat].bot) return;
    try { apply(r, seat, botMove(g.view(seat))); } catch (e) { console.error(e); }
  }, Math.max(900, (r.wait || 0) - Date.now() + 300));
}

io.on('connection', sock => {
  let room = null, seat = -1;
  const bind = (r, i) => { room = r; seat = i; r.seats[i].sid = sock.id; };

  sock.on('create', ({ name, token, av }, cb) => {
    const r = { code: newCode(), seats: [null, null, null, null], host: 0, game: null, total: [0, 0], last: null, lastId: 0, act: null, actId: 0, scored: null, ev: '', t: Date.now() };
    rooms.set(r.code, r);
    r.seats[0] = { name: clean(name), token: String(token), av: cleanAv(av) };
    bind(r, 0); cb({ ok: 1, code: r.code }); emitAll(r);
  });

  sock.on('join', ({ code, name, token, av }, cb) => {
    const r = rooms.get(String(code || '').toUpperCase());
    if (!r) return cb({ err: 'Room not found' });
    let i = r.seats.findIndex(s => s && !s.bot && s.token === String(token));   // reconnect
    if (i < 0) {
      if (r.game) return cb({ err: 'That game has already started' });
      i = r.seats.findIndex(s => !s);
      if (i < 0) return cb({ err: 'Room is full' });
      r.seats[i] = { name: clean(name), token: String(token), av: cleanAv(av) };
    }
    bind(r, i); cb({ ok: 1, code: r.code }); emitAll(r);
  });

  sock.on('sit', j => {
    if (!room || room.game || !(j >= 0 && j < 4) || room.seats[j]) return;
    room.seats[j] = room.seats[seat]; room.seats[seat] = null;
    if (room.host === seat) room.host = j;
    seat = j; emitAll(room);
  });

  sock.on('bot', ({ seat: j, on }) => {
    if (!room || room.game || room.host !== seat || !(j >= 0 && j < 4)) return;
    if (on && !room.seats[j]) room.seats[j] = { name: 'Bot ' + (j + 1), bot: true, av: 10 };
    else if (!on && room.seats[j] && room.seats[j].bot) room.seats[j] = null;
    emitAll(room);
  });

  sock.on('start', () => {
    if (!room || room.game || room.host !== seat || room.seats.some(s => !s)) return;
    room.game = new E.Game(undefined, Math.random, 0);
    emitAll(room); pump(room);
  });

  sock.on('act', a => {
    if (!room || !room.game || !a) return;
    try { apply(room, seat, a); } catch (e) { sock.emit('err', e.message); }
  });

  sock.on('next', () => {
    if (!room || !room.game || room.host !== seat || room.game.s.phase !== 'finished') return;
    if (E.gameWinner(room.total) !== null) room.total = [0, 0];   // game over -> new game
    room.game.startRound(E.nextSeat(room.game.s.dealer));
    room.last = null; room.ev = ''; emitAll(room); pump(room);
  });

  let lastVoice = 0;                                   // voice messages are only relayed, never stored
  sock.on('voice', v => {
    const d = v && v.data;
    if (!room || seat < 0 || !d || !(Buffer.isBuffer(d) || d instanceof ArrayBuffer)) return;
    if (d.byteLength < 500 || d.byteLength > 200000 || Date.now() - lastVoice < 1500) return;
    lastVoice = Date.now();
    const mime = /^audio\/(webm|mp4|ogg)/.test(String(v.mime)) ? String(v.mime) : 'audio/webm';
    room.seats.forEach((s, i) => { if (s && s.sid && i !== seat) io.to(s.sid).emit('voice', { from: seat, mime, data: d }); });
  });

  sock.on('disconnect', () => {
    if (room && room.seats[seat] && room.seats[seat].sid === sock.id) { room.seats[seat].sid = null; emitAll(room); }
  });
});

setInterval(() => {                                  // drop rooms nobody has touched for 30 min
  for (const [c, r] of rooms) if (Date.now() - r.t > 30 * 60 * 1000 && !r.seats.some(s => s && s.sid)) rooms.delete(c);
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
srv.listen(PORT, () => console.log('29 server on http://localhost:' + PORT));
