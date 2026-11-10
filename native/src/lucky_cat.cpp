#include "lucky_cat.h"
#include "jsmath.h"
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <stdexcept>

namespace lcm {
namespace lucky {

// v1 layout starts
static const int G_HAND = 0, G_MELDS = 136, G_OWNMELDS = 170, G_POND = 174, G_SHOWN = 208, G_UNSEEN = 242, G_PLAYERS = 276,
                 G_SELF = 318, G_WINDS = 326, G_WALL = 334, G_MODE = 336, G_OFFER = 338, G_OFFERFROM = 372;
// v2 extras
static const int G_PILES = 376, G_AFTERCLAIM = 682, G_SHANTENAFTER = 784, G_WAVESAFTER = 818, G_NOW = 852;

static int suitSlot(int i) { return i >= 27 ? 3 : i / 9; }
static void addf(float& a, double v) { a = float(double(a) + v); }

static double liveWaits(int8_t* c, int declared, const int unseen[34]) {
  int n = 0;
  for (int t : winningTiles(c, declared)) n += unseen[t];
  return std::min(1.0, n / 16.0);
}

void encode(const Game& g, int seat, const Offer* offer, int version, float* x, const std::vector<int8_t>* handIn, const std::vector<Meld>* meldsIn) {
  const Hand& h = g.hand;
  const Seat& me = h.seats[seat];
  const std::vector<int8_t>& hand = handIn ? *handIn : me.hand;
  const std::vector<Meld>& melds = meldsIn ? *meldsIn : me.melds;
  int size = version == 2 ? SIZE_V2 : SIZE_V1;
  std::memset(x, 0, sizeof(float) * size);
  Counts c = countsOf(hand);
  for (int i = 0; i < 34; i++) for (int k = 0; k < c[i] && k < 4; k++) x[G_HAND + k * 34 + i] = 1;
  int seen[34];
  for (int i = 0; i < 34; i++) seen[i] = c[i];
  int ownKinds[4] = {0, 0, 0, 0};
  for (auto& m : melds) {
    for (int t : m.tiles) { addf(x[G_MELDS + t], 0.25); seen[t]++; }
    if (m.type == CHOW) ownKinds[0]++;
    else if (m.type == PUNG) ownKinds[1]++;
    else if (m.concealed) ownKinds[3]++;
    else ownKinds[2]++;
  }
  for (int k = 0; k < 4; k++) x[G_OWNMELDS + k] = float(ownKinds[k] / 4.0);
  for (int r = 1; r <= 3; r++) {
    int o = (seat + r) % 4, base = G_PLAYERS + (r - 1) * 14;
    const Seat& s = h.seats[o];
    int concealedKongs = 0, chows = 0, sets = 0, open = 0;
    for (auto& m : s.melds) {
      if (m.concealed) { concealedKongs++; continue; }
      open++;
      if (m.type == CHOW) chows++; else sets++;
      for (int t : m.tiles) {
        addf(x[G_SHOWN + t], 0.25);
        seen[t]++;
        addf(x[base + 8 + suitSlot(t)], 1.0 / 12);
      }
    }
    x[base] = float(open / 4.0);
    x[base + 1] = float(concealedKongs / 4.0);
    x[base + 2] = float(s.flowers.size() / 8.0);
    x[base + 3] = float(s.discards.size() / 24.0);
    for (auto& d : s.discards) addf(x[base + 4 + suitSlot(d.tile)], 1.0 / std::max<size_t>(1, s.discards.size()));
    x[base + 12] = float(chows / 4.0);
    x[base + 13] = float((open + concealedKongs >= 4 ? 1 : 0) + sets / 8.0);
  }
  for (int s = 0; s < 4; s++)
    for (auto& d : h.seats[s].discards) {
      if (d.claimed) continue;
      addf(x[G_POND + d.tile], 0.25);
      seen[d.tile]++;
    }
  for (int i = 0; i < 34; i++) x[G_UNSEEN + i] = float(std::max(0, 4 - seen[i]) / 4.0);
  int wind = seatWind(g, seat);
  int f = 0, sb = 0;
  for (int id : me.flowers) {
    int n = id < 38 ? id - 33 : id - 37;  // f1-f4, s1-s4
    if (n != wind) continue;
    if (id < 38) f = 1; else sb = 1;
  }
  x[G_SELF] = float(me.flowers.size() / 8.0);
  x[G_SELF + 1] = f;
  x[G_SELF + 2] = sb;
  x[G_SELF + 3] = float(me.discards.size() / 24.0);
  bool allConcealed = true;
  for (auto& m : melds) if (!m.concealed) allConcealed = false;
  x[G_SELF + 4] = allConcealed ? 1 : 0;
  x[G_SELF + 5] = float(melds.size() / 4.0);
  x[G_SELF + 6] = g.dealer == seat ? 1 : 0;
  int wallLeft = h.wall.size();
  x[G_SELF + 7] = wallLeft < 20 ? 1 : 0;
  x[G_WINDS + wind - 1] = 1;
  x[G_WINDS + 4 + ((g.round ? g.round : 1) - 1) % 4] = 1;
  x[G_WALL] = float(wallLeft / 91.0);
  x[G_WALL + 1] = float(double(x[G_WALL]) * double(x[G_WALL]));
  if (!offer) x[G_MODE] = 1;
  else {
    x[G_MODE + 1] = 1;
    x[G_OFFER + offer->tile] = 1;
    if (offer->robKong) x[G_OFFERFROM + 3] = 1;
    else x[G_OFFERFROM + ((seat - offer->from + 4) % 4) - 1] = 1;
  }
  if (version != 2) return;
  // Features v2 (js/mahjong-frontier-net.js extend)
  for (int r = 1; r <= 3; r++) {
    const Seat& s = h.seats[(seat + r) % 4];
    int len = int(s.discards.size());
    for (int idx = 0; idx < len; idx++) {
      int back = len - 1 - idx;
      int bucket = back < 3 ? 0 : back < 6 ? 1 : 2;
      int at = G_PILES + ((r - 1) * 3 + bucket) * 34 + s.discards[idx].tile;
      x[at] = float(std::min(1.0, double(x[at]) + 0.5));
    }
    for (auto& m : s.melds) {
      if (m.concealed || m.at >= len) continue;
      x[G_AFTERCLAIM + (r - 1) * 34 + s.discards[m.at].tile] = 1;
    }
  }
  int unseen[34];
  for (int i = 0; i < 34; i++) unseen[i] = int(js::round(double(x[G_UNSEEN + i]) * 4));
  Counts cc = countsOf(hand);
  int declared = int(melds.size());
  int held = 0;
  for (int i = 0; i < 34; i++) held += cc[i];
  if (held % 3 == 2) {
    for (int i = 0; i < 34; i++) {
      if (!cc[i]) continue;
      cc[i]--;
      int sh = shanten(cc.data(), declared);
      x[G_SHANTENAFTER + i] = float(std::max(0.0, 1 - (sh + 1) / 8.0));
      if (sh == 0) x[G_WAVESAFTER + i] = float(liveWaits(cc.data(), declared, unseen));
      cc[i]++;
    }
  } else {
    int now = shanten(cc.data(), declared);
    x[G_NOW] = float(std::max(0.0, 1 - (now + 1) / 8.0));
    if (now == 0) x[G_NOW + 1] = float(liveWaits(cc.data(), declared, unseen));
  }
}

std::vector<Move> turnMoves(const std::vector<int8_t>& hand, const std::vector<KongOption>& kongs) {
  std::vector<Move> out;
  Counts c = countsOf(hand);
  for (int i = 0; i < 34; i++) if (c[i]) { Move m; m.action = i; m.decision.type = A_DISCARD; m.decision.tile = i; out.push_back(m); }
  for (auto& k : kongs) { Move m; m.action = 34 + k.tile; m.decision.type = A_KONG; m.decision.tile = k.tile; out.push_back(m); }
  return out;
}

std::vector<Move> claimMoves(const ClaimOptions& o) {
  std::vector<Move> out;
  Move pass; pass.action = TURN; pass.decision.type = A_PASS; out.push_back(pass);
  int ti = o.tile;
  for (auto& pair : o.chows) {
    int lo = std::min(int(pair[0]), int(pair[1]));
    int slot = lo > ti ? 1 : lo == ti - 1 ? 2 : 3;
    Move m; m.action = TURN + slot; m.decision.type = A_CHOW; m.decision.tiles = pair; out.push_back(m);
  }
  if (o.pung) { Move m; m.action = TURN + 4; m.decision.type = A_PUNG; out.push_back(m); }
  if (o.kong) { Move m; m.action = TURN + 5; m.decision.type = A_KONG; out.push_back(m); }
  return out;
}

// js/mahjong-lucky-cat-value.js: the hand and melds a move leaves.
static std::vector<int8_t> without(const std::vector<int8_t>& hand, int idx, int n, std::vector<int8_t>* taken) {
  std::vector<int8_t> out = hand;
  for (int k = int(out.size()) - 1; k >= 0 && n > 0; k--) {
    if (out[k] == idx) { if (taken) taken->push_back(out[k]); out.erase(out.begin() + k); n--; }
  }
  return out;
}

After afterTurn(const Game& g, int seat, const Decision& d) {
  const Seat& me = g.hand.seats[seat];
  After a;
  a.melds = me.melds;
  int i = d.tile;
  if (d.type == A_DISCARD) { a.hand = without(me.hand, i, 1, nullptr); a.thrown = i; a.kind = 0; return a; }
  a.kind = 1;
  for (auto& m : a.melds) if (m.type == PUNG && m.tiles[0] == i) {
    std::vector<int8_t> t;
    a.hand = without(me.hand, i, 1, &t);
    Meld k; k.type = KONG; k.tiles = m.tiles; k.tiles.push_back(t[0]); k.concealed = false;
    m = k;
    return a;
  }
  std::vector<int8_t> t;
  a.hand = without(me.hand, i, 4, &t);
  Meld k; k.type = KONG; k.tiles = t; k.concealed = true;
  a.melds.push_back(k);
  return a;
}

After afterCall(const Game& g, int seat, const ClaimOptions& o, const Decision& d) {
  const Seat& me = g.hand.seats[seat];
  After a;
  a.melds = me.melds;
  if (d.type == A_PASS) { a.hand = me.hand; a.kind = 2; return a; }
  Meld m; m.concealed = false;
  if (d.type == A_CHOW) {
    std::vector<int8_t> t;
    std::vector<int8_t> h1 = without(me.hand, d.tiles[0], 1, &t);
    a.hand = without(h1, d.tiles[1], 1, &t);
    m.type = CHOW; m.tiles = {t[0], t[1], int8_t(o.tile)};
    a.melds.push_back(m); a.kind = 4;
    return a;
  }
  bool kong = d.type == A_KONG;
  std::vector<int8_t> t;
  a.hand = without(me.hand, o.tile, kong ? 3 : 2, &t);
  m.type = kong ? KONG : PUNG; m.tiles = t; m.tiles.push_back(int8_t(o.tile));
  a.melds.push_back(m); a.kind = kong ? 5 : 3;
  return a;
}

void valueFeatures(const Game& g, int seat, const After& a, float* x) {
  encode(g, seat, nullptr, 1, x, &a.hand, &a.melds);
  std::memset(x + SIZE_V1, 0, sizeof(float) * 40);
  if (a.thrown >= 0) x[SIZE_V1 + a.thrown] = 1;
  x[SIZE_V1 + 34 + a.kind] = 1;
}

}  // namespace lucky

LuckyCat::LuckyCat(std::shared_ptr<Mlp> model, double temperature, std::function<double()> rng)
    : model_(std::move(model)), temperature_(temperature), rng_(std::move(rng)), base_(std::make_shared<Foundation>("jorge-yau")) {
  const Weights& w = model_->weights();
  version_ = w.featureVersion;
  size_ = version_ == 2 ? lucky::SIZE_V2 : lucky::SIZE_V1;
  if (w.featureSize != size_ || model_->outputs() != lucky::OUTPUTS)
    throw std::runtime_error("lucky cat: the model's features (" + std::to_string(w.featureSize) + ", version " + std::to_string(version_) + ") aren't v1 or v2");
  if (w.meta.has("oracle")) throw std::runtime_error("lucky cat: an oracle model reads the hidden tiles; the native simulator doesn't play them");
  x_.resize(size_);
}

void LuckyCat::policy(std::vector<Move>& moves) { policyOn(x_.data(), moves); }

void LuckyCat::policyOn(const float* x, std::vector<Move>& moves) {
  const std::vector<double>& raw = model_->forward(x);
  double top = -std::numeric_limits<double>::infinity();
  for (auto& m : moves) { m.logit = raw[m.action]; top = std::max(top, m.logit); }
  double sum = 0;
  for (auto& m : moves) { m.p = js::exp(m.logit - top); sum += m.p; }
  for (auto& m : moves) m.p /= sum;
}

// The network's pick first, then its other moves by share; the first that doesn't
// contradict the hand it builds toward, or the last if all do.
int LuckyCat::firstConsistent(const std::vector<Move>& moves, int k, const std::function<bool(const Move&)>& ok) {
  std::vector<int> order;
  for (int j = 0; j < int(moves.size()); j++) if (j != k) order.push_back(j);
  std::sort(order.begin(), order.end(), [&](int a, int b) { return moves[a].p != moves[b].p ? moves[a].p > moves[b].p : a < b; });
  order.insert(order.begin(), k);
  for (int j : order) if (ok(moves[j])) return j;
  return order.back();
}

int LuckyCat::decide(const Game& g, int seat, std::vector<Move>& moves, const std::function<int(int)>& check) {
  policy(moves);
  int k = 0;
  if (temperature_) {
    std::vector<double> w;
    double total = 0;
    for (auto& m : moves) { w.push_back(js::pow(m.p, 1 / temperature_)); }
    for (double v : w) total = total + v;
    double r = rng_() * total;
    k = int(w.size()) - 1;
    for (size_t j = 0; j < w.size(); j++) { r -= w[j]; if (r <= 0) { k = int(j); break; } }
  } else {
    for (size_t j = 0; j < moves.size(); j++) if (moves[j].p > moves[k].p) k = int(j);
  }
  if (check) k = check(k);
  if (onDecision) onDecision(g, seat, x_.data(), moves, k);
  return k;
}

// js/mahjong-lucky-cat-ml.js valueDecide: the policy's best few by share, each scored by
// its value plus the win bonus, then the rest by share; the first the check lets through.
int LuckyCat::valueDecide(const Game& g, int seat, std::vector<Move>& moves, const std::function<ValueRead(const Move&)>& score,
                          const std::function<bool(const Move&)>& ok, bool all) {
  policy(moves);
  int n = int(moves.size());
  int K = all ? n : std::min(n, value->topK());
  std::vector<int> byShare(n);
  for (int j = 0; j < n; j++) byShare[j] = j;
  std::sort(byShare.begin(), byShare.end(), [&](int a, int b) { return moves[a].p != moves[b].p ? moves[a].p > moves[b].p : a < b; });
  std::vector<int> rank(n);
  for (int j = 0; j < n; j++) rank[byShare[j]] = j;
  std::vector<double> v(n, 0);
  std::vector<int> top(byShare.begin(), byShare.begin() + K);
  for (int j : top) { ValueRead r = score(moves[j]); v[j] = r.ev + value->winBonus() * r.pWin; }
  std::vector<int> ranked = top;
  std::sort(ranked.begin(), ranked.end(), [&](int a, int b) { return v[a] != v[b] ? v[a] > v[b] : rank[a] < rank[b]; });
  if (epsilon && rng_() < epsilon) {
    int r0 = int(std::floor(rng_() * double(ranked.size())));
    int c = ranked[r0]; ranked.erase(ranked.begin() + r0); ranked.insert(ranked.begin(), c);
  }
  std::vector<int> order = ranked;
  order.insert(order.end(), byShare.begin() + K, byShare.end());
  int k = order.back();
  for (int j : order) if (!ok || ok(moves[j])) { k = j; break; }
  if (onDecision) onDecision(g, seat, x_.data(), moves, k);
  return k;
}

std::vector<Move> LuckyCat::turnShares(const Game& g, int seat, const TurnOptions& o) {
  auto moves = lucky::turnMoves(g.hand.seats[seat].hand, o.kongs);
  std::vector<float> x(static_cast<size_t>(size_), 0.0f);
  lucky::encode(g, seat, nullptr, version_, x.data());
  policyOn(x.data(), moves);
  return moves;
}

std::vector<Move> LuckyCat::claimShares(const Game& g, int seat, const ClaimOptions& o) {
  auto moves = lucky::claimMoves(o);
  std::vector<float> x(static_cast<size_t>(size_), 0.0f);
  lucky::Offer offer{o.tile, o.from, o.robKong};
  lucky::encode(g, seat, &offer, version_, x.data());
  policyOn(x.data(), moves);
  return moves;
}

Decision LuckyCat::turn(Game& g, int seat, const TurnOptions& o) {
  if (o.hasWin) { Decision d; d.type = A_WIN; return d; }
  auto moves = lucky::turnMoves(g.hand.seats[seat].hand, o.kongs);
  lucky::encode(g, seat, nullptr, version_, x_.data());
  if (value) {
    DiscardAnalysis a = base_->analyzeDiscards(g, seat);
    Counts counts = countsOf(g.hand.seats[seat].hand);
    float vx[lucky::VALUE_SIZE];
    auto score = [&](const Move& m) { lucky::valueFeatures(g, seat, lucky::afterTurn(g, seat, m.decision), vx); return value->ev(vx); };
    auto ok = [&](const Move& m) {
      if (m.decision.type == A_KONG) return !Foundation::kongContradicts(a.ctx.leadPlan.get(), m.decision.tile);
      if (m.decision.type != A_DISCARD || a.folding) return true;
      for (auto& x : a.candidates) if (x->index == m.decision.tile) return !base_->contradicts(g, counts, *x);
      return true;
    };
    return moves[valueDecide(g, seat, moves, score, this->check ? std::function<bool(const Move&)>(ok) : nullptr, false)].decision;
  }
  auto check = [&](int k) {
    DiscardAnalysis a = base_->analyzeDiscards(g, seat);
    Counts counts = countsOf(g.hand.seats[seat].hand);
    return firstConsistent(moves, k, [&](const Move& m) {
      if (m.decision.type == A_KONG) return !Foundation::kongContradicts(a.ctx.leadPlan.get(), m.decision.tile);
      if (m.decision.type != A_DISCARD || a.folding) return true;
      for (auto& x : a.candidates) if (x->index == m.decision.tile) return !base_->contradicts(g, counts, *x);
      return true;
    });
  };
  return moves[decide(g, seat, moves, this->check ? std::function<int(int)>(check) : std::function<int(int)>())].decision;
}

Decision LuckyCat::claim(Game& g, int seat, const ClaimOptions& o) {
  Decision d;
  if (o.hasWin) { d.type = A_WIN; return d; }
  if (!o.pung && !o.kong && o.chows.empty()) return d;
  auto moves = lucky::claimMoves(o);
  if (!this->check) {
    lucky::Offer offer0{o.tile, o.from, o.robKong};
    lucky::encode(g, seat, &offer0, version_, x_.data());
    return moves[decide(g, seat, moves, std::function<int(int)>())].decision;
  }
  Foundation::Decided found = base_->decideClaim(g, seat, o);
  lucky::Offer offer{o.tile, o.from, o.robKong};
  lucky::encode(g, seat, &offer, version_, x_.data());
  if (value) {
    float vx[lucky::VALUE_SIZE];
    std::vector<float> px(static_cast<size_t>(size_), 0.0f);
    auto score = [&](const Move& m) {
      lucky::After a = lucky::afterCall(g, seat, o, m.decision);
      if (m.decision.type != A_PUNG && m.decision.type != A_CHOW) { lucky::valueFeatures(g, seat, a, vx); return value->ev(vx); }
      // A call: the best of the policy's top discards after it.
      std::vector<KongOption> none;
      auto discards = lucky::turnMoves(a.hand, none);
      lucky::encode(g, seat, nullptr, version_, px.data(), &a.hand, &a.melds);
      policyOn(px.data(), discards);
      std::sort(discards.begin(), discards.end(), [](const Move& p, const Move& q) { return p.p != q.p ? p.p > q.p : p.action < q.action; });
      ValueRead best; bool have = false;
      int K = std::min(int(discards.size()), value->topK());
      for (int j = 0; j < K; j++) {
        lucky::After b;
        b.hand = a.hand;
        for (int t = int(b.hand.size()) - 1; t >= 0; t--) if (b.hand[t] == discards[j].action) { b.hand.erase(b.hand.begin() + t); break; }
        b.melds = a.melds; b.thrown = discards[j].action; b.kind = 0;  // read as the discard it is
        lucky::valueFeatures(g, seat, b, vx);
        ValueRead r = value->ev(vx);
        if (!have || r.ev + value->winBonus() * r.pWin > best.ev + value->winBonus() * best.pWin) { best = r; have = true; }
      }
      return best;
    };
    auto ok = [&](const Move& m) { return base_->claimConsistent(g, seat, found.hasFound ? &found.found : nullptr, m.decision, o.tile); };
    return moves[valueDecide(g, seat, moves, score, ok, true)].decision;
  }
  auto check = [&](int k) {
    return firstConsistent(moves, k, [&](const Move& m) {
      return base_->claimConsistent(g, seat, found.hasFound ? &found.found : nullptr, m.decision, o.tile);
    });
  };
  return moves[decide(g, seat, moves, check)].decision;
}

}  // namespace lcm
