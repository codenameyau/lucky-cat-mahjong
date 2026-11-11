// js/mahjong-only-orphans.js, in the JS's order of reads, sums and products.
#include "only_orphans.h"
#include "shanten.h"
#include <algorithm>
#include <cstring>

namespace lcm {

// The worths read for a context (the JS's ctx.ooWorths: the same tiles read again
// in the same position are worth the same), shared by the context's copies.
struct OoWorthCache {
  struct Entry { uint64_t a, b; int key; OnlyOrphans::Worths w; };
  std::vector<Entry> entries;
};

static bool isOrphanTile(int i) { return i >= 27 || (i % 9 == 0 || i % 9 == 8); }

static void packCounts(const Counts& c, uint64_t& a, uint64_t& b) {
  a = 0; b = 0;
  for (int i = 0; i < 17; i++) a = (a << 3) | uint64_t(c[i] & 7);
  for (int i = 17; i < 34; i++) b = (b << 3) | uint64_t(c[i] & 7);
}

OnlyOrphans::OnlyOrphans(std::shared_ptr<Mlp> model, const std::string& id) : NeuralCat(std::move(model), id) {
  // create(): topK 0, every discard the rules allow (the option, so the weights' own topK is never read).
  topK_ = 0;
  // BASE_TUNING with Only Orphans' { valuePower: 0.5, ownPlans: true }; the rest of
  // Jorge Yau's knobs are unset (falsy) in the JS.
  T.valuePower = 0.5;
  T.ownPlans = true;
  T.reads = false;
  T.ownDiscards = false;
  T.honorOrder = false;
  T.keepPairs = 0;
}

/* ---------------- 1. Targets ---------------- */

static const double CLAIMED = 2, OTHERS = 0.025, MOST = 0.9;

static double payout(double f) { return js::pow(2, std::min(f, 13.0) - 3); }

bool OnlyOrphans::exposed(const Ctx& ctx) {
  for (auto& m : ctx.melds) if (!m.concealed) return true;
  return false;
}

bool OnlyOrphans::alive(Plan& p, const Ctx& ctx) {
  p.committed = true;
  return !isInf(shantenOf(p.fn, p.counts, ctx.declared));
}

std::vector<PlanP> OnlyOrphans::setPlans(const Counts& c, const Ctx& ctx) {
  std::vector<PlanP> out;
  for (auto& p : setUpgrades(c, ctx, true)) if (alive(*p, ctx)) out.push_back(p);
  return out;
}

std::vector<PlanP> OnlyOrphans::pairPlans(const Counts& c, const Ctx& ctx) {
  std::vector<PlanP> out;
  for (auto& p : pairsUpgrades(c, ctx, true)) if (alive(*p, ctx)) out.push_back(p);
  return out;
}

PlanP OnlyOrphans::sevenPairsPlan(const Counts& c, const Ctx& ctx) {
  if (ctx.declared) return nullptr;
  PlanP p = makeSpecialPlan(0, c, ctx);
  p->committed = true;
  return p;
}

PlanP OnlyOrphans::concealedTripletsPlan(const Counts& c, const Ctx& ctx) {
  if (exposed(ctx) || ctx.hasChow) return nullptr;
  auto p = std::make_shared<Plan>();
  p->kind = P_CONCEALED_TRIPLETS; p->counts = c; p->fn.kind = SH_TRIP;
  p->faan = std::min(13.0, baseFaan(ctx) + 10 + handYaku(ctx, c));
  p->open = false; p->committed = true;
  return p;
}

// Shanten for the three counting kinds (triplets, seven pairs, orphans) kept as
// counts, so finishOdds reads a tile added or taken in O(1) instead of a pass over
// the hand: the same numbers as tripletsShanten, sevenPairsShanten and
// orphansShanten (shanten.cpp) with shantenOf's filled rule, by construction.
namespace {
struct CountSh {
  ShKind kind;
  bool filled;
  int declared, full;
  int a = 0, b = 0, held = 0;  // trip: pungs (>= 3), pairs (== 2); seven / orph: kinds (>= 1), pairs (>= 2)
  static bool fits(const ShFn& fn) { return fn.kind == SH_TRIP || fn.kind == SH_SEVEN || fn.kind == SH_ORPH; }
  CountSh(const ShFn& fn, int dec) : kind(fn.kind), filled(fn.filled), declared(dec), full(3 * (4 - dec) + 1) {}
  static bool orphan(int i) { return i >= 27 || i % 9 == 0 || i % 9 == 8; }
  void load(const Counts& c) {
    a = b = held = 0;
    for (int i = 0; i < 34; i++) {
      held += c[i];
      if (kind == SH_TRIP) { if (c[i] >= 3) a++; else if (c[i] == 2) b++; }
      else if (kind == SH_SEVEN || orphan(i)) { if (c[i] >= 1) a++; if (c[i] >= 2) b++; }
    }
  }
  int value(int A, int B, int h) const {
    int s;
    if (kind == SH_TRIP) {
      int need = 4 - declared;
      int m = std::min(A, need), p = B > 0 ? 1 : 0, t = std::min(B - p, need - m);
      s = 2 * need - 2 * m - t - p;
    } else if (declared) return INF;
    else if (kind == SH_SEVEN) s = 6 - B + std::max(0, 7 - A);
    else s = 13 - A - (B > 0 ? 1 : 0);
    if (filled && s < INF) s = std::max(s, full - h);
    return s;
  }
  // Shanten with one more of tile i (v: its count now), or one fewer of tile t.
  int plus(int i, int v) const {
    int A = a, B = b;
    if (kind == SH_TRIP) { if (v == 1) B++; else if (v == 2) { B--; A++; } }
    else if (kind == SH_SEVEN || orphan(i)) { if (v == 0) A++; else if (v == 1) B++; }
    return value(A, B, held + 1);
  }
  int minus(int t, int v) const {
    int A = a, B = b;
    if (kind == SH_TRIP) { if (v == 3) { A--; B++; } else if (v == 2) B--; }
    else if (kind == SH_SEVEN || orphan(t)) { if (v == 1) A--; else if (v == 2) B--; }
    return value(A, B, held - 1);
  }
};
}  // namespace

// The odds of finishing a plan s steps from ready, a go-around at a time (finishOdds).
double OnlyOrphans::finishOdds(const Plan& p, const Ctx& ctx, int s) {
  const ShFn& fn = p.fn;
  int declared = ctx.declared;
  Counts counts = p.counts, unseen = ctx.unseen;
  int full = 3 * (4 - declared) + 1;
  double rates[16];
  int nRates = 0;
  const bool fast = CountSh::fits(fn);
  CountSh cs(fn, declared);
  for (int k = 0; k <= s; k++) {
    int now = s - k;
    int total = 0, tiles[34], nt = 0;
    if (fast) cs.load(counts);
    for (int i = 0; i < 34; i++) {
      if (!unseen[i] || counts[i] >= 4) continue;
      int sh;
      if (fast) sh = cs.plus(i, counts[i]);
      else { counts[i]++; sh = shantenOf(fn, counts, declared); counts[i]--; }
      if (sh < now) { total += unseen[i]; tiles[nt++] = i; }
    }
    if (!total) return 0;
    double rate = 0;
    for (int q = 0; q < nt; q++) {
      int i = tiles[q];
      rate += double(unseen[i]) / ctx.unseenTotal * (now == 0 || (p.open && counts[i] == 2) ? CLAIMED : 1);
    }
    if (nRates >= 16) throw std::runtime_error("only orphans: finishOdds, too many steps");
    rates[nRates++] = std::min(MOST, rate);
    if (now == 0) break;
    int mass[4] = {0, 0, 0, 0}, pick[4] = {-1, -1, -1, -1};
    for (int q = 0; q < nt; q++) {
      int i = tiles[q];
      int n = counts[i];
      mass[n] += unseen[i];
      if (pick[n] == -1 || unseen[i] > unseen[pick[n]]) pick[n] = i;
    }
    int kind = 0;
    for (int m = 1; m < 4; m++) if (mass[m] > mass[kind]) kind = m;
    int take = pick[kind];
    counts[take]++;
    unseen[take]--;
    int held = 0;
    for (int j = 0; j < 34; j++) held += counts[j];
    if (held <= full) continue;
    int out = -1, outS = INF;
    if (fast) cs.load(counts);
    for (int t = 0; t < 34; t++) {
      if (!counts[t] || t == take) continue;
      int st;
      if (fast) st = cs.minus(t, counts[t]);
      else { counts[t]--; st = shantenOf(fn, counts, declared); counts[t]++; }
      if (isInf(st)) continue;  // Infinity never beats Infinity, nor ties a tile with copies (unseen[-1])
      if (st < outS || (st == outS && unseen[t] < unseen[out])) { out = t; outS = st; }
    }
    if (out == -1) return 0;
    counts[out]--;
  }
  double hazard = 1 - (1 - OTHERS) * (1 - ctx.hazard);
  double at[17];
  for (int q = 0; q <= nRates; q++) at[q] = 0;
  at[0] = 1;
  double won = 0;
  int turns = int(std::max(1.0, js::round(ctx.drawsLeft)));
  for (int g = 0; g < turns; g++) {
    for (int step = nRates - 1; step >= 0; step--) {
      double move = at[step] * rates[step];
      at[step] -= move;
      if (step == nRates - 1) won += move; else at[step + 1] += move;
    }
    for (int q = 0; q < nRates; q++) at[q] *= 1 - hazard;
  }
  return won;
}

double OnlyOrphans::planWorth(const Plan& p, const Ctx& ctx) {
  int s = shantenOf(p.fn, p.counts, ctx.declared);
  if (isInf(s)) return 0;
  if (s < 0) return payout(p.faan);
  return payout(p.faan) * finishOdds(p, ctx, s);
}

OnlyOrphans::Worths OnlyOrphans::targetWorths(const Counts& c, const Ctx& ctx) {
  uint64_t a, b;
  packCounts(c, a, b);
  int key = ctx.declared * 2 + (exposed(ctx) ? 1 : 0);
  if (!ctx.ooWorths) ctx.ooWorths = std::make_shared<OoWorthCache>();
  for (auto& e : ctx.ooWorths->entries) if (e.a == a && e.b == b && e.key == key) return e.w;
  Worths w = readWorths(c, ctx);
  ctx.ooWorths->entries.push_back({a, b, key, w});
  return w;
}

OnlyOrphans::Worths OnlyOrphans::readWorths(const Counts& c, const Ctx& ctx) {
  Worths worth;
  for (int t = 0; t < OO_TARGETS; t++) worth.w[t] = 0;
  int held = 0;
  for (int i = 0; i < 34; i++) held += c[i];
  // A plan that only keeps some tiles reads the same after any of the others goes.
  struct Done { int kind; uint64_t a, b; double w; };
  std::vector<Done> done;
  auto consider = [&](int target, const PlanP& p) {
    uint64_t pa, pb;
    packCounts(p->counts, pa, pb);
    double w = -1;
    for (auto& d : done) if (d.kind == p->kind && d.a == pa && d.b == pb) { w = d.w; break; }
    if (w < 0) { w = planWorth(*p, ctx); done.push_back({int(p->kind), pa, pb, w}); }
    if (w > worth.w[target]) worth.w[target] = w;
  };
  auto read = [&](const Counts& k) {
    // targetPlans: every target's plans for a hand waiting to draw.
    if (!ctx.declared && orphansAlive(k, ctx)) consider(OO_ORPHANS, makeSpecialPlan(1, k, ctx));
    for (auto& p : setPlans(k, ctx)) consider(OO_MAJOR_SETS, p);
    for (auto& p : pairPlans(k, ctx)) consider(OO_MAJOR_PAIRS, p);
    PlanP sp = sevenPairsPlan(k, ctx);
    if (sp) consider(OO_PAIRS, sp);
    PlanP ct = concealedTripletsPlan(k, ctx);
    if (ct) consider(OO_CONCEALED_TRIPLETS, ct);
  };
  if (held % 3 != 2) { read(c); return worth; }
  for (int j = 0; j < 34; j++) {
    if (!c[j]) continue;
    Counts k = c;
    k[j]--;
    read(k);
  }
  return worth;
}

int OnlyOrphans::pickTarget(const Worths& worth, int now) {
  int best = -1;
  for (int t = 0; t < OO_TARGETS; t++) if (worth.w[t] > 0 && (best < 0 || worth.w[t] > worth.w[best])) best = t;
  if (best < 0) return now >= 0 ? now : OO_ORPHANS;
  if (now >= 0 && worth.w[now] > 0 && worth.w[best] < worth.w[now] * SWITCH) return now;
  return best;
}

// The target for these tiles. Reading the seat's real hand records it.
int OnlyOrphans::readTarget(Ctx& ctx, const Counts& counts, bool record) {
  int memo = seatMemo(*ctx.game, ctx.seat, T.id).ooTarget;
  Worths worth = targetWorths(counts, ctx);
  int id = pickTarget(worth, memo);
  if (record) seatMemo(*ctx.game, ctx.seat, T.id).ooTarget = id;
  return id;
}

int OnlyOrphans::seatTarget(const Game& g, int seat, Ctx& ctx) {
  if (seatMemo(g, seat, T.id).ooTarget < 0) readTarget(ctx, countsOf(g.hand.seats[seat].hand), true);
  return seatMemo(g, seat, T.id).ooTarget;
}

/* ---------------- 2. The hands it reads ---------------- */

std::vector<PlanP> OnlyOrphans::hookPlans(const Counts& c, Ctx& ctx) {
  int t = ctx.ooTarget;
  std::vector<PlanP> out;
  if (t == OO_PAIRS) {
    PlanP sp = sevenPairsPlan(c, ctx);
    if (sp) { out.push_back(sp); auto pp = pairPlans(c, ctx); out.insert(out.end(), pp.begin(), pp.end()); }
  } else if (t == OO_CONCEALED_TRIPLETS) {
    PlanP ct = concealedTripletsPlan(c, ctx);
    if (ct) { out.push_back(ct); auto sp = setPlans(c, ctx); out.insert(out.end(), sp.begin(), sp.end()); }
  }
  if (out.empty()) {
    if (!ctx.declared && orphansAlive(c, ctx)) out.push_back(makeSpecialPlan(1, c, ctx));
    auto sp = setPlans(c, ctx);
    out.insert(out.end(), sp.begin(), sp.end());
    auto pp = pairPlans(c, ctx);
    out.insert(out.end(), pp.begin(), pp.end());
  }
  // (The usual hands only if a meld somehow rules all of those out.)
  return out.empty() ? basePlans(c, ctx) : out;
}

/* ---------------- 3. The fixed rules ---------------- */

void OnlyOrphans::hookContext(Ctx& ctx, const Game& g, int seat) { ctx.ooTarget = seatTarget(g, seat, ctx); }

void OnlyOrphans::hookHand(Ctx& ctx, const Counts& counts) {
  ctx.mixedHand = true;
  int held = 0;
  for (int i = 0; i < 34; i++) held += counts[i];
  bool real = false;
  if (held % 3 == 2 && ctx.actualMelds) real = countsOf(ctx.game->hand.seats[ctx.seat].hand) == counts;
  if (real) ctx.ooTarget = readTarget(ctx, counts, true);
  else if (exposed(ctx)) ctx.ooTarget = OO_MAJOR_SETS;
}

bool OnlyOrphans::mustGo(const Ctx& ctx, const Counts& counts, int i) {
  if (isOrphanTile(i)) return false;
  int t = ctx.ooTarget;
  if (t == OO_PAIRS) return counts[i] != 2;
  if (t == OO_CONCEALED_TRIPLETS) return counts[i] < 2;
  return true;
}

bool OnlyOrphans::hookPriority(const Game&, const Ctx& ctx, const Counts& counts, const Candidate& cand, int, double& out) {
  if (!mustGo(ctx, counts, cand.index)) return false;
  out = 0;
  return true;
}

bool OnlyOrphans::kongFits(const KongOption& k, int target) {
  if (target == OO_MAJOR_SETS) return isOrphanTile(k.tile);
  if (target == OO_CONCEALED_TRIPLETS) return !k.added;
  return false;
}

// It passes unless the model takes a pung or kong the target allows.
bool OnlyOrphans::hookClaim(const ClaimFound&, const Ctx&, const Game&, const ClaimOptions&, Decision& out) {
  out = Decision();
  out.type = A_PASS;
  return true;
}

/* ---------------- 4. The strategy (MahjongML.create's options) ---------------- */

std::vector<CandP> OnlyOrphans::allow(const std::vector<CandP>& out, const Ctx& ctx, const Counts& counts, const Game& g) {
  std::vector<CandP> other;
  for (auto& x : out) if (mustGo(ctx, counts, x->index)) other.push_back(x);
  if (!other.empty()) return other;
  std::vector<CandP> ok;
  for (auto& x : out) if (x->shanten <= 0 || !loneDragon(g, counts, x->index)) ok.push_back(x);
  return ok;
}

// A pung or kong of a 1, a 9 or an honor: on the triplets target, or when the
// claim makes that target worth SWITCH times the one it's on.
bool OnlyOrphans::claimOk(const ClaimOption& o, const ClaimOptions& opts, const Game& g, int seat) {
  if (o.decision.type == A_CHOW || !isOrphanTile(opts.tile)) return false;
  Ctx ctx = buildContext(g, seat);
  int t = ctx.ooTarget;
  if (t == OO_MAJOR_SETS) return true;
  Counts c = countsOf(g.hand.seats[seat].hand);
  double now = t >= 0 ? targetWorths(c, ctx).w[t] : 0;
  bool kong = o.decision.type == A_KONG;
  c[opts.tile] -= kong ? 3 : 2;
  Meld m;
  m.type = kong ? KONG : PUNG;
  m.tiles.assign(kong ? 4 : 3, int8_t(opts.tile));
  m.concealed = false;
  double after = targetWorths(c, withMeld(ctx, m)).w[OO_MAJOR_SETS];
  return after > 0 && after >= now * SWITCH;
}

bool OnlyOrphans::kongAllowed(const KongOption& k, const Game& g, int seat) { return kongFits(k, buildContext(g, seat).ooTarget); }

}  // namespace lcm
