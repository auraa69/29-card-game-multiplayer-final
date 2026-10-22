const E = require('./engine.js');
function winnerOf(trick,led,trump){
  const pool=trump&&trick.some(p=>p.card.suit===trump)?trick.filter(p=>p.card.suit===trump):trick.filter(p=>p.card.suit===led);
  return pool.reduce((a,b)=>E.strength(b.card.rank)>E.strength(a.card.rank)?b:a);
}
function botMove(v){
  const seat=v.you,L=v.legal;
  if(v.phase==='bidding'){
    const val=v.hand.reduce((n,c)=>n+E.cardPoints(c),0),next=v.highBid+1;
    return next<=Math.min(15+val,24)?{type:'bid',amount:next}:{type:'pass'};
  }
  if(v.phase==='trump-select'){
    const sc={};v.hand.forEach(c=>sc[c.suit]=(sc[c.suit]||0)+E.strength(c.rank)+3);
    const best=Object.keys(sc).sort((a,b)=>sc[b]-sc[a])[0];
    const cnt={};v.hand.forEach(c=>cnt[c.suit]=(cnt[c.suit]||0)+1);
    if(Math.max(...Object.values(cnt))<2)return Math.random()<.5?{type:'setTrump',seventh:true}:{type:'setTrump',joker:true};
    return {type:'setTrump',suit:best};
  }
  if(v.phase==='single'){const t=v.hand.filter(c=>c.suit===v.trumpSuit);return {type:'single',on:t.length>=5&&t.some(c=>c.rank==='J')&&t.some(c=>c.rank==='9')};}
  if(v.phase==='double'||v.phase==='redouble'){
    const p=v.hand.reduce((n,c)=>n+E.cardPoints(c),0);
    return {type:v.phase,on:v.phase==='double'?(v.bid>=20&&p>=5):p>=6};
  }
  if(L.some(a=>a.type==='reveal')&&Math.random()<.6)return {type:'reveal'};
  const plays=L.filter(a=>a.type==='play'),m=plays.find(a=>a.declareMarriage);
  if(m)return m;
  const cards=plays.map(a=>a.card),trump=v.trumpRevealed?v.trumpSuit:null;
  const cheap=(a,b)=>E.cardPoints(a)-E.cardPoints(b)||E.strength(a.rank)-E.strength(b.rank);
  let card;
  if(!v.trick.length)card=[...cards].sort((a,b)=>E.strength(b.rank)-E.strength(a.rank))[0];
  else{
    const w=winnerOf(v.trick,v.ledSuit,trump);
    if(w.seat===(seat+2)%4)card=v.trick.length===3?[...cards].sort((a,b)=>E.cardPoints(b)-E.cardPoints(a))[0]:[...cards].sort(cheap)[0];
    else{
      const wins=cards.filter(c=>winnerOf([...v.trick,{seat,card:c}],v.ledSuit,trump).seat===seat);
      card=wins.length?wins.sort((a,b)=>E.strength(a.rank)-E.strength(b.rank))[0]:[...cards].sort(cheap)[0];
    }
  }
  return plays.find(a=>E.sameCard(a.card,card)&&!a.declareMarriage);
}


module.exports = { botMove };
