#include "neural_cat.h"
#include <algorithm>
#include <cstring>

namespace lcm {

static const int G_HAND = 0, G_DISCARD = 178, G_TABLE = 218, G_CONTEXT = 492, G_SPEED = 508, G_VALUE = 524, G_SAFETY = 556;

static double clip(double x, double lo, double hi) { return x < lo ? lo : x > hi ? hi : x; }
static double log1(double x) { return js::log(1 + std::max(0.0, x)); }

NeuralCat::NeuralCat(std::shared_ptr<Mlp> model, const std::string& id) : Foundation(id), model_(std::move(model)) {
  const Json& play = model_->weights().meta["play"];
  topK_ = int(play["topK"].num(3));
  winBonus_ = play["winBonus"].num(0);
  claimMargin_ = play["claimMargin"].num(0);
  spicyBlend_ = play["spicyBlend"].num(0);
  const Weights& w = model_->weights();
  if (!w.reader.empty()) {
    if (w.readerVersion != 1) throw std::runtime_error("neural cat: the model reads version " + std::to_string(w.readerVersion) + " of the reader, have 1");
    Weights r;
    r.featureVersion = w.featureVersion; r.featureSize = w.featureSize; r.layers = w.reader;
    reader_.reset(new Mlp(r));
  }
  int want = SIZE + (reader_ ? READ_SIZE : 0);
  if (model_->inputs() != want) throw std::runtime_error("neural cat: the model reads " + std::to_string(model_->inputs()) + " inputs, not " + std::to_string(want));
}

// js/mahjong-ml-model.js readFeatures (read version 1): each opponent ready, the tile
// thrown deals in now, and the hand this seat would win with, as chances.
const float* NeuralCat::input(const float* x, float* buf) const {
  if (!reader_) return x;
  const std::vector<double>& r = reader_->forward(x);
  std::memcpy(buf, x, sizeof(float) * SIZE);
  const int R_WIN = 28, R_READY = 52, R_DEAL = 55;
  for (int k = 0; k < 3; k++) buf[SIZE + k] = float(1 / (1 + js::exp(-r[R_READY + k])));
  buf[SIZE + 3] = float(1 / (1 + js::exp(-r[R_DEAL])));
  double m = -DINF, e[12], sum = 0;
  for (int i = 0; i < 12; i++) m = std::max(m, r[R_WIN + i]);
  for (int i = 0; i < 12; i++) { e[i] = js::exp(r[R_WIN + i] - m); sum += e[i]; }
  for (int i = 0; i < 12; i++) buf[SIZE + 4 + i] = float(e[i] / sum);
  return buf;
}

void NeuralCat::prepare(State& st, const Game& g, int seat, Ctx& ctx, const std::vector<Threat>* threats, const Counts* counts) {
  st.g = &g; st.seat = seat; st.ctx = &ctx;
  st.threats = threats ? *threats : opponentThreats(g, seat);
  st.counts = counts ? *counts : countsOf(g.hand.seats[seat].hand);
  if (!ctx.mlSynced) { syncHandPlans(ctx, st.counts); ctx.mlSynced = true; }
  st.opponents.clear();
  for (int k = 1; k <= 3; k++) {
    Opp op;
    op.seat = (seat + k) % 4;
    const Seat& os = g.hand.seats[op.seat];
    std::memset(op.discards, 0, sizeof op.discards);
    std::memset(op.shown, 0, sizeof op.shown);
    for (auto& d : os.discards) op.discards[d.tile]++;
    op.hidden = 0;
    for (auto& m : os.melds) {
      if (m.concealed) { op.hidden++; continue; }
      for (int t = 0; t < 3 && t < int(m.tiles.size()); t++) op.shown[m.tiles[t]]++;
    }
    op.threat = nullptr;
    for (auto& t : st.threats) if (t.seat == op.seat) { op.threat = &t; break; }
    st.opponents.push_back(op);
  }
  std::memset(st.own, 0, sizeof st.own);
  for (auto& m : ctx.melds) for (int t = 0; t < 3 && t < int(m.tiles.size()); t++) st.own[m.tiles[t]]++;
  st.flowerFaan = flowerPoints(ctx);
}

static int featureFamily(Family f) {
  switch (f) {
    case F_RUNS: return 0; case F_SETS: return 1; case F_PAIRS: return 2; case F_MAJORS: return 3;
    case F_DRAGONS: return 4; case F_WINDS: return 5; case F_ORPHANS: return 6; case F_GATES: return 7;
    case F_FLUSH_C: case F_FLUSH_D: case F_FLUSH_B: return 8;
    default: return 9;  // 'standard' (not one of the families listed)
  }
}

void NeuralCat::encode(const State& st, int index, const Analysis& analysis, double loss, float* x) {
  std::memset(x, 0, sizeof(float) * SIZE);
  const Game& g = *st.g;
  const Ctx& ctx = *st.ctx;
  Counts c = st.counts;
  c[index]--;
  int p = G_HAND;
  for (int i = 0; i < 34; i++) for (int k = 1; k <= 4; k++) x[p + i * 4 + k - 1] = c[i] >= k ? 1 : 0;
  p += 136;
  for (int i = 0; i < 34; i++) x[p + i] = float(st.own[i] / 4.0);
  p += 34;
  int chows = 0, pungs = 0, kongs = 0;
  for (auto& m : ctx.melds) { if (m.type == CHOW) chows++; else if (m.type == PUNG) pungs++; else kongs++; }
  x[p] = float(chows / 4.0);
  x[p + 1] = float(pungs / 4.0);
  x[p + 2] = float(kongs / 4.0);
  x[p + 3] = ctx.concealed ? 1 : 0;
  x[p + 4] = float(ctx.flowers.size() / 8.0);
  x[p + 5] = float(st.flowerFaan / 4.0);
  x[p + 6] = float(ctx.melds.size() / 4.0);
  x[p + 7] = ctx.hasChow ? 1 : 0;

  p = G_DISCARD;
  x[p + index] = 1;
  p += 34;
  x[p] = index >= 27 ? 1 : 0;
  x[p + 1] = index >= 31 ? 1 : 0;
  x[p + 2] = index == 26 + ctx.seatWind || index == 26 + g.round ? 1 : 0;
  x[p + 3] = isTerminalOrHonor(index) ? 1 : 0;
  x[p + 4] = float(st.counts[index] / 4.0);
  x[p + 5] = float(ctx.unseen[index] / 4.0);

  p = G_TABLE;
  for (int i = 0; i < 34; i++) x[p + i] = float(ctx.unseen[i] / 4.0);
  p += 34;
  for (auto& op : st.opponents) {
    for (int i = 0; i < 34; i++) x[p + i] = float(op.discards[i] / 4.0);
    p += 34;
    for (int i = 0; i < 34; i++) x[p + i] = float(op.shown[i] / 4.0);
    p += 34;
    const Seat& os = g.hand.seats[op.seat];
    if (op.threat) {
      const Threat& t = *op.threat;
      x[p] = float(t.ready);
      x[p + 1 + t.level] = 1;
      if (t.flush >= 0) x[p + 5 + t.flush] = 1;
      x[p + 8] = float((t.faan - 3) / 10.0);
    } else {
      x[p] = 0;
      x[p + 1] = 1;
      x[p + 8] = 0;
    }
    x[p + 9] = float(os.melds.size() / 4.0);
    x[p + 10] = float(os.discards.size() / 24.0);
    x[p + 11] = op.seat == g.dealer ? 1 : 0;
    p += 12;
  }

  p = G_CONTEXT;
  x[p] = float(ctx.wallLeft / 100.0);
  x[p + 1] = float(ctx.turn / 24.0);
  x[p + 2 + (ctx.seatWind - 1)] = 1;
  x[p + 6 + (g.round - 1)] = 1;
  x[p + 10] = ctx.isDealer ? 1 : 0;
  x[p + 11] = float(g.minFaan / 13.0);
  x[p + 12] = ctx.wallLeft < 16 ? 1 : 0;
  x[p + 13] = float(ctx.hazard);
  x[p + 14] = float(ctx.slope);
  x[p + 15] = float(ctx.declared / 4.0);

  p = G_SPEED;
  int stdS = standardShanten(c.data(), ctx.declared);
  int pairs = ctx.declared ? 8 : sevenPairsShanten(c.data(), 0);
  int orphans = ctx.declared ? 13 : orphansShanten(c.data(), 0);
  x[p] = float(clip(stdS, -1, 8) / 8);
  x[p + 1] = float(clip(pairs, -1, 8) / 8);
  x[p + 2] = float(clip(orphans, -1, 13) / 13);
  x[p + 3] = float(clip(analysis.shanten, -1, 8) / 8);
  x[p + 4] = float(clip(analysis.shapeShanten, -1, 8) / 8);
  x[p + 5] = analysis.shanten <= 0 ? 1 : 0;
  x[p + 6] = analysis.shanten == 1 ? 1 : 0;
  const Entry* best = analysis.hasBest ? &analysis.best : nullptr;
  x[p + 7] = float(log1(best ? best->ukeire : 0) / 4);
  x[p + 8] = float((best && !best->readyBest ? best->nUkeireTiles : 0) / 34.0);
  x[p + 9] = float(best && best->hasChance ? best->chance : 0);
  bool ready = analysis.hasReady;
  x[p + 10] = ready ? 1 : 0;
  x[p + 11] = float(ready ? analysis.ready.waits.size() / 8.0 : 0);
  x[p + 12] = float(ready ? log1(analysis.ready.live) / 3 : 0);
  x[p + 13] = float(clip(analysis.plainShanten, -1, 8) / 8);
  x[p + 14] = float(ctx.drawsLeft / 30);
  x[p + 15] = float(clip(analysis.shanten, 0, 8) / std::max(1.0, ctx.drawsLeft));

  p = G_VALUE;
  const Plan* plan = best ? best->plan.get() : nullptr;
  if (plan) {
    x[p + featureFamily(planFamily(plan->kind, plan->suit))] = 1;
    x[p + 10] = plan->kind == P_FULL ? 1 : 0;
    x[p + 11] = plan->kind == P_HALF ? 1 : 0;
    if (plan->suit >= 0) x[p + 12 + plan->suit] = 1;
    x[p + 15] = float(clip(plan->faan, 0, 13) / 13);
    x[p + 16] = float(clip(best->planShanten, -1, 8) / 8);
    x[p + 17] = plan->upgrade ? 1 : 0;
  }
  x[p + 18] = float(log1(analysis.util) / 3);
  x[p + 19] = float(log1(analysis.backup) / 3);
  x[p + 20] = best && best->readyBest ? 1 : 0;
  x[p + 21] = float(ready ? clip(analysis.ready.bestFaan, 0, 13) / 13 : 0);
  x[p + 22] = float(ready ? log1(analysis.ready.value) / 3 : 0);
  int su[4] = {0, 0, 0, 0};
  for (int i = 0; i < 34; i++) su[suitIdx(i)] += c[i] + st.own[i];
  x[p + 23] = float(su[0] / 14.0); x[p + 24] = float(su[1] / 14.0); x[p + 25] = float(su[2] / 14.0); x[p + 26] = float(su[3] / 14.0);
  int nPairs = 0, nSets = 0, valueHonors = 0;
  for (int i = 0; i < 34; i++) {
    if (c[i] >= 2) nPairs++;
    if (c[i] >= 3) nSets++;
    if (i >= 27 && c[i] >= 2 && valueWeight(ctx, i)) valueHonors++;
  }
  x[p + 27] = float(nPairs / 7.0);
  x[p + 28] = float(nSets / 4.0);
  x[p + 29] = float(valueHonors / 3.0);
  x[p + 30] = float(clip(baseFaan(ctx), 0, 13) / 13);
  x[p + 31] = cheapWin(ctx) ? 1 : 0;

  p = G_SAFETY;
  x[p] = float(log1(loss * 10) / 3);
  x[p + 1] = deadTile(g, index) ? 1 : 0;
  for (size_t k2 = 0; k2 < st.opponents.size(); k2++) {
    const Threat* t = st.opponents[k2].threat;
    if (!t) continue;
    x[p + 2 + k2] = t->discarded[index] ? 1 : 0;
    x[p + 5 + k2] = t->since[index] ? 1 : 0;
    x[p + 8 + k2] = float(t->ready * waitChance(g, *t, index));
  }
  int top = 0;
  for (auto& t : st.threats) top = std::max(top, t.level);
  x[p + 11] = float(top / 3.0);
}

MlRead NeuralCat::ev(const float* x) {
  float buf[SIZE + READ_SIZE];
  return evRaw(model_->forward(input(x, buf)));
}

MlRead NeuralCat::evRaw(const std::vector<double>& raw) {
  auto softmax = [&](int from, int n, double* out) {
    double m = -DINF;
    for (int i = 0; i < n; i++) m = std::max(m, raw[from + i]);
    double sum = 0;
    for (int i = 0; i < n; i++) { out[i] = js::exp(raw[from + i] - m); sum += out[i]; }
    for (int i = 0; i < n; i++) out[i] /= sum;
  };
  double o[6], winF[11], payF[11];
  softmax(0, 6, o);
  softmax(6, 11, winF);
  softmax(17, 11, payF);
  double winPts = 0, payPts = 0;
  for (int i = 0; i < 11; i++) {
    double pts = 8 * js::pow(2, std::min(3 + i, 13) - 3);
    // An experiment (not in the JS, so it never runs for a shipped model): each faan's
    // worth blended toward the half-spicy table (js/points.js halfSpicyPoints).
    if (spicyBlend_ > 0) pts = (1 - spicyBlend_) * pts + spicyBlend_ * halfSpicyPoints(std::min(3 + i, 13));
    winPts += winF[i] * pts;
    payPts += payF[i] * pts;
  }
  double gain = o[0] * 3 * winPts + o[1] * winPts;
  double cost = (o[2] + o[3]) * payPts;
  MlRead r;
  r.ev = gain - cost;
  r.pWin = o[0] + o[1];
  return r;
}

std::vector<CandP> NeuralCat::rerank(std::vector<CandP> out, Ctx& ctx, const Counts& counts, const Game& g, int seat,
                                     const std::vector<Threat>& threats, bool folding) {
  State st;
  prepare(st, g, seat, ctx, &threats, &counts);
  int open = int(out.size());
  // Only the discards `allow` lets through are picked from; they go first.
  if (hasAllow()) {
    std::vector<CandP> ok = allow(out, ctx, counts, g);
    if (!ok.empty()) {
      std::vector<CandP> next = ok;
      for (auto& x : out) if (std::find(ok.begin(), ok.end(), x) == ok.end()) next.push_back(x);
      out = next;
      open = int(ok.size());
    }
  }
  int k0 = topK_ > 0 ? std::min(topK_, open) : open;
  // The best few, through the network together.
  static thread_local std::vector<float> xs, stacked;
  static thread_local std::vector<double> raws[16];
  xs.resize(size_t(k0) * SIZE);
  stacked.resize(size_t(k0) * (SIZE + READ_SIZE));
  const float* ptrs[16];
  for (int k = 0; k < k0; k++) {
    encode(st, out[k]->index, *out[k]->analysis, out[k]->loss, xs.data() + size_t(k) * SIZE);
    ptrs[k] = input(xs.data() + size_t(k) * SIZE, stacked.data() + size_t(k) * (SIZE + READ_SIZE));
  }
  model_->forwardBatch(ptrs, k0, raws);
  for (int k = 0; k < k0; k++) {
    Candidate& c = *out[k];
    MlRead m = evRaw(raws[k]);
    c.hasMl = true; c.mlEv = m.ev; c.mlPWin = m.pWin; c.mlOrder = k;
  }
  std::vector<CandP> ranked(out.begin(), out.begin() + k0);
  js::sort(ranked, [&](const CandP& p, const CandP& q) -> double {
    double d = (q->mlEv + winBonus_ * q->mlPWin) - (p->mlEv + winBonus_ * p->mlPWin);
    return d ? d : p->mlOrder - q->mlOrder;
  });
  ranked.insert(ranked.end(), out.begin() + k0, out.end());
  if (T.honorOrder && !folding) ranked = honorTieOrder(ranked, ctx, counts);
  int pick = pickIndex(ranked, k0);
  if (pick) { CandP c = ranked[pick]; ranked.erase(ranked.begin() + pick); ranked.insert(ranked.begin(), c); }
  // No discard that goes against the hand it is building (Foundation::consistentFirst).
  ranked = consistentFirst(ranked, g, counts, folding);
  if (!ranked[0]->hasMl) {
    static thread_local std::vector<float> x1;
    x1.resize(SIZE);
    encode(st, ranked[0]->index, *ranked[0]->analysis, ranked[0]->loss, x1.data());
    MlRead m = ev(x1.data());
    Candidate& top = *ranked[0];
    top.hasMl = true; top.mlEv = m.ev; top.mlPWin = m.pWin;
    for (size_t k = 0; k < out.size(); k++) if (out[k] == ranked[0]) top.mlOrder = int(k);
  }
  double best = -DINF;
  for (int k = 0; k < k0; k++) best = std::max(best, out[k]->mlEv);
  ranked[0]->mlBest = best;
  return ranked;
}

// Exploring (js/mahjong-ml.js pickIndex): the same draws from the same generator.
int NeuralCat::pickIndex(const std::vector<CandP>& ranked, int k0) {
  if (epsilon && rng() < epsilon) {
    // With allow, among the discards it picks from (the first k0); else any.
    size_t n = hasAllow() ? size_t(k0) : ranked.size();
    int best = 1 << 30;
    for (size_t i = 0; i < n; i++) best = std::min(best, ranked[i]->shanten);
    std::vector<int> pool;
    for (size_t i = 0; i < n; i++) if (ranked[i]->shanten <= best) pool.push_back(int(i));
    return pool[size_t(rng() * double(pool.size()))];
  }
  if (!temperature) return 0;
  auto val = [&](const CandP& x) { return x->mlEv + winBonus_ * x->mlPWin; };
  double top = val(ranked[0]);
  std::vector<double> w;
  for (int k = 0; k < k0; k++) w.push_back(js::exp((val(ranked[k]) - top) / temperature));
  double sum = 0;
  for (double v : w) sum += v;
  double r = rng() * sum;
  for (size_t k = 0; k < w.size(); k++) { r -= w[k]; if (r <= 0) return int(k); }
  return 0;
}

// js/mahjong-ml.js pickChoice: the choice worth the most, unless it beats the
// foundation's (index `at`) by less than claimMargin; or an exploring pick.
template <class C> int NeuralCat::pickChoice(const std::vector<C>& choices, int at) {
  if (epsilon && rng() < epsilon) return int(rng() * double(choices.size()));
  if (temperature) {
    std::vector<double> w;
    for (auto& x : choices) w.push_back(js::exp((value(x.ml) - value(choices[at].ml)) / temperature));
    double sum = 0;
    for (double v : w) sum += v;
    double r = rng() * sum;
    for (size_t k = 0; k < w.size(); k++) { r -= w[k]; if (r <= 0) return int(k); }
    return at;
  }
  int top = 0;
  for (size_t k = 0; k < choices.size(); k++) if (value(choices[k].ml) > value(choices[top].ml)) top = int(k);
  return value(choices[top].ml) > value(choices[at].ml) + claimMargin_ ? top : at;
}

void NeuralCat::read(Reading& r, const Game& g, int seat) {
  r.ctx = buildContext(g, seat);
  prepare(r.st, g, seat, r.ctx, nullptr, nullptr);
}

int NeuralCat::row(Reading& r, int index, float* x) {
  Counts kept = r.st.counts;
  kept[index]--;
  Analysis an = handUtility(kept, r.ctx);
  double loss = dealInLoss(*r.st.g, r.st.threats, index);
  encode(r.st, index, an, loss, x);
  return an.hasBest && an.best.plan ? int(an.best.plan->kind) : -1;
}

MlRead NeuralCat::waitingFeatures(const Game& g, int seat, int kind, int tile) {
  float x[SIZE];
  waitingRow(g, seat, kind, tile, x);
  return ev(x);
}

void NeuralCat::waitingRow(const Game& g, int seat, int kind, int tile, float* x) {
  Ctx ctx = buildContext(g, seat);
  Counts c = countsOf(g.hand.seats[seat].hand);
  int i = tile;
  Meld four;
  four.type = KONG;
  four.tiles = {int8_t(tile), int8_t(tile), int8_t(tile), int8_t(tile)};
  if (kind == 1) { c[i] -= 3; four.concealed = false; ctx = withMeld(ctx, four); }
  else if (kind == 2) { c[i] -= 4; four.concealed = true; ctx = withMeld(ctx, four); }
  else if (kind == 3) {
    c[i] -= 1;
    for (auto& m : ctx.melds) if (m.type == PUNG && m.tiles[0] == i) { Meld k = four; k.concealed = false; m = k; }
    ctx.actualMelds = false;
  }
  ctx.mlSynced = false;
  State st;
  prepare(st, g, seat, ctx, nullptr, &c);
  const auto& d = g.hand.seats[seat].discards;
  int index = d.empty() ? i : d.back().tile;
  // encodeWaiting
  Analysis an = handUtility(st.counts, ctx);
  st.counts[index]++;
  encode(st, index, an, 0, x);
  st.counts[index]--;
}

static bool sameDecision(const Decision& a, const Decision& b) {
  if (a.type != b.type) return false;
  if (a.type == A_CHOW && !(a.tiles[0] == b.tiles[0] && a.tiles[1] == b.tiles[1])) return false;
  if (a.tile != NO_TILE && b.tile != NO_TILE && a.tile != b.tile) return false;
  return true;
}

Decision NeuralCat::chooseClaim(const Game& g, int seat, const ClaimOptions& opts) {
  Decided d = decideClaim(g, seat, opts);
  if (!d.hasFound || d.found.options.empty() || d.decision.type == A_WIN) return d.decision;
  struct Choice { Decision decision; MlRead ml; };
  std::vector<Choice> choices;
  Choice pass;
  pass.decision.type = A_PASS;
  pass.ml = waitingFeatures(g, seat, 0, opts.tile);
  choices.push_back(pass);
  for (auto& o : d.found.options) {
    if (!claimOk(o, opts, g, seat)) continue;
    // Never a call that goes against the hand it's building (the contradiction check).
    if (!claimConsistent(g, seat, &d.found, o.decision, opts.tile)) continue;
    MlRead ml;
    if (o.decision.type == A_KONG) ml = waitingFeatures(g, seat, 1, opts.tile);
    else {
      if (!o.cand || !o.cand->hasMl) continue;
      ml.ev = o.cand->mlBest; ml.pWin = o.cand->mlPWin;  // ml.best stands in for ev
    }
    choices.push_back({o.decision, ml});
  }
  if (choices.size() == 1) { Decision p; p.type = A_PASS; return p; }
  int at = 0;
  for (size_t k = 0; k < choices.size(); k++) if (sameDecision(choices[k].decision, d.decision)) at = int(k);
  return choices[size_t(pickChoice(choices, at))].decision;
}

std::vector<NeuralCat::ClaimValue> NeuralCat::claimValues(const Game& g, int seat, const ClaimOptions& opts, int* at) {
  std::vector<ClaimValue> out;
  *at = 0;
  Decided d = decideClaim(g, seat, opts);
  if (!d.hasFound || d.found.options.empty() || d.decision.type == A_WIN) return out;
  Decision pass; pass.type = A_PASS;
  MlRead p = waitingFeatures(g, seat, 0, opts.tile);
  out.push_back({pass, p.ev, value(p)});
  for (auto& o : d.found.options) {
    if (!claimOk(o, opts, g, seat)) continue;
    if (!claimConsistent(g, seat, &d.found, o.decision, opts.tile)) continue;
    MlRead ml;
    if (o.decision.type == A_KONG) ml = waitingFeatures(g, seat, 1, opts.tile);
    else {
      if (!o.cand || !o.cand->hasMl) continue;
      ml.ev = o.cand->mlBest; ml.pWin = o.cand->mlPWin;
    }
    out.push_back({o.decision, ml.ev, value(ml)});
  }
  if (out.size() == 1) { out.clear(); return out; }
  for (size_t k = 0; k < out.size(); k++) if (sameDecision(out[k].decision, d.decision)) *at = int(k);
  return out;
}

Decision NeuralCat::chooseTurnAction(const Game& g, int seat, const TurnOptions& opts) {
  Decision d = Foundation::chooseTurnAction(g, seat, opts);
  std::vector<KongOption> allowed;
  for (auto& kong : opts.kongs) if (kongAllowed(kong, g, seat)) allowed.push_back(kong);
  if (opts.hasWin || allowed.empty()) return d;
  DiscardAnalysis a = analyzeDiscards(g, seat);
  // Never a kong that goes against the hand it's building (the contradiction check).
  std::vector<KongOption> kongs;
  for (auto& kong : allowed) if (!check || !kongContradicts(a.ctx.leadPlan.get(), kong.tile)) kongs.push_back(kong);
  if (kongs.empty()) return d;
  const Candidate& keep = *a.candidates[0];
  struct Choice { Decision decision; MlRead ml; };
  std::vector<Choice> choices;
  Choice first;
  if (d.type == A_DISCARD) first.decision = d;
  else { first.decision.type = A_DISCARD; first.decision.tile = keep.index; }
  first.ml.ev = keep.mlBest;  // keep.ml.best is always set on the top candidate
  first.ml.pWin = keep.mlPWin;
  choices.push_back(first);
  for (auto& kong : kongs) {
    Choice c;
    c.decision.type = A_KONG;
    c.decision.tile = kong.tile;
    c.ml = waitingFeatures(g, seat, kong.added ? 3 : 2, kong.tile);
    choices.push_back(c);
  }
  int at = 0;
  for (size_t k = 0; k < choices.size(); k++) if (sameDecision(choices[k].decision, d)) at = int(k);
  return choices[size_t(pickChoice(choices, at))].decision;
}

}  // namespace lcm
