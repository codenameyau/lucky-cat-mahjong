// Jorge Yau's hooks (js/mahjong-jorge-yau.js), included at the end of bot.cpp
// so they share its helpers.

// TARGETS, in the order they are tried.
enum TargetId { T_ORPHANS, T_GATES, T_WINDS, T_TERMINALS, T_HONORS, T_PAIRS, T_FULL, T_TRIPLETS, T_HALF, T_SEQUENCES, T_STANDARD };
static const bool TARGET_HARD[11] = {true, true, true, true, true, false, true, false, false, false, false};
static const int LOCK_TILES = 8, LOCK_TURNS = 8;
static const double LOCK_FAAN = 7;

static void allCountsOf(const Counts& c, const Ctx& ctx, Counts& all) {
  all = c;
  for (auto& m : ctx.melds) for (int k = 0; k < 3 && k < int(m.tiles.size()); k++) all[m.tiles[k]]++;
}

static bool hasSuitedMeld(const Ctx& ctx, int except) {
  for (auto& m : ctx.melds) { int su = suitIdx(meldFirst(m)); if (su != 3 && su != except) return true; }
  return false;
}

static int tilesOfJ(const Counts& c, const Ctx& ctx, Mask fits) {
  int n = countWhere(c, fits);
  for (auto& m : ctx.melds) n += inMask(fits, meldFirst(m)) ? 3 : 0;
  return n;
}

struct HandRead {
  Counts all;
  int by[3];
  int top;
  int pairs, sets;
  bool hasGates; int gatesSuit, gatesStart, gatesProgress;
  int orphanKinds, winds, terminals, honors;
};

static int topSuit(const int by[3], const LeftRead& read) {
  std::vector<int> order{0, 1, 2};
  js::sort(order, [&](int a, int b) { return by[b] - by[a]; });
  int top = order[0], next = order[1];
  if (by[next] >= by[top] - 1 && next != read.keeps && (top == read.keeps || next == read.feeds)) return next;
  return top;
}

static HandRead readHand(const Counts& c, const Ctx& ctx) {
  HandRead r;
  allCountsOf(c, ctx, r.all);
  for (int su = 0; su < 3; su++) r.by[su] = 0;
  for (int i = 0; i < 27; i++) r.by[i / 9] += r.all[i];
  r.pairs = r.sets = 0;
  for (int i = 0; i < 34; i++) { if (r.all[i] >= 2) r.pairs++; if (r.all[i] >= 3) r.sets++; }
  r.hasGates = false; r.gatesProgress = 0;
  for (int s = 0; s < 3; s++) {
    int progress = nineGatesProgress(r.all, s * 9);
    if (progress >= 7 && (!r.hasGates || progress > r.gatesProgress)) { r.hasGates = true; r.gatesSuit = s; r.gatesStart = s * 9; r.gatesProgress = progress; }
  }
  r.top = topSuit(r.by, ctx.leftRead);
  r.orphanKinds = 0;
  for (int k : ORPHAN_INDEXES) if (r.all[k] > 0) r.orphanKinds++;
  r.winds = r.all[27] + r.all[28] + r.all[29] + r.all[30];
  r.terminals = 0;
  for (int t : TERMINALS_) r.terminals += r.all[t];
  r.honors = 0;
  for (int i = 27; i < 34; i++) r.honors += r.all[i];
  return r;
}

Target Foundation::jyClassify(const Counts& c, const Ctx& ctx, bool& found) {
  HandRead r = readHand(c, ctx);
  int avoid = avoidSuitOf(c, ctx);
  for (int k = 0; k <= T_STANDARD; k++) {
    bool fits;
    switch (k) {
      case T_ORPHANS: fits = !ctx.declared && r.orphanKinds >= 8 && orphansAlive(c, ctx); break;
      case T_GATES: fits = !ctx.declared && r.hasGates; break;
      case T_WINDS: fits = r.winds >= 8; break;
      case T_TERMINALS: fits = r.terminals >= 8; break;
      case T_HONORS: fits = r.honors >= 8; break;
      case T_PAIRS: fits = !ctx.declared && r.pairs >= 4; break;
      case T_FULL: fits = r.by[r.top] >= 8; break;
      case T_TRIPLETS: fits = r.sets >= 1 && r.sets <= 3; break;
      case T_HALF: {
        int second = 0;
        for (int s = 0; s < 3; s++) if (s != r.top) second = std::max(second, r.by[s]);
        fits = r.honors >= 3 && r.by[r.top] >= 5 && r.by[r.top] >= second * 2;
        break;
      }
      case T_SEQUENCES: {
        int suited = r.by[0] + r.by[1] + r.by[2];
        std::vector<int> used;
        for (int s = 0; s < 3; s++) if (r.by[s] >= 2) used.push_back(r.by[s]);
        fits = suited >= 9 && used.size() >= 2 && *std::max_element(used.begin(), used.end()) - *std::min_element(used.begin(), used.end()) <= 3;
        break;
      }
      default: fits = true;
    }
    if (!fits) continue;
    Target out;
    out.id = k; out.rank = k;
    if (k == T_GATES) { out.suit = r.gatesSuit; out.start = r.gatesStart; }
    if (k == T_FULL || k == T_HALF || k == T_TRIPLETS) out.suit = r.top;
    if (avoid >= 0 && (k == T_GATES || k == T_FULL || k == T_HALF) && out.suit == avoid) continue;
    found = true;
    return out;
  }
  found = false;
  return Target();
}

static bool targetDead(const Target& t, const HandRead& r, const Counts& c, const Ctx& ctx, Foundation* f, bool (Foundation::*alive)(const Counts&, const Ctx&)) {
  switch (t.id) {
    case T_ORPHANS: return ctx.declared || !(f->*alive)(c, ctx);
    case T_GATES: return ctx.declared || hasSuitedMeld(ctx, t.suit) || ctx.meldSuits[3];
    case T_WINDS: { int n = 0; for (auto& m : ctx.melds) if (!isHonorI(meldFirst(m))) n++; return n > 1; }
    case T_TERMINALS: { if (ctx.hasChow) return true; for (auto& m : ctx.melds) if (!isOrphanI(meldFirst(m))) return true; return false; }
    case T_HONORS: return ctx.hasChow;
    case T_PAIRS: return ctx.declared;
    case T_FULL: return hasSuitedMeld(ctx, t.suit);
    case T_TRIPLETS: return ctx.hasChow;
    case T_HALF: return hasSuitedMeld(ctx, t.suit);
    case T_SEQUENCES: return ctx.declared;
    default: return false;
  }
}

Target Foundation::jyCurrentTarget(const Game& g, int seat, const Counts& c, const Ctx& ctx) {
  SeatMemo& sh = seatShared(g, seat);
  bool found;
  if (!sh.hasOpening) { sh.opening = jyClassify(c, ctx, found); sh.hasOpening = true; }
  Target now = jyClassify(c, ctx, found);
  Target& held = sh.opening;
  HandRead r = readHand(c, ctx);
  bool oneSuit = held.id == T_GATES || held.id == T_FULL || held.id == T_HALF;
  bool avoided = oneSuit && held.suit == avoidSuitOf(c, ctx) && held.suit >= 0;
  bool stronger = now.rank < held.rank && (ctx.turn < 3 || TARGET_HARD[now.id]);
  if (targetDead(held, r, c, ctx, this, &Foundation::orphansAlive) || avoided || stronger) sh.opening = now;
  return sh.opening;
}

bool Foundation::jyHasQuickFaan(const Counts& c, const Ctx& ctx) {
  int mine = 26 + ctx.seatWind, round = 26 + ctx.round;
  Counts all;
  allCountsOf(c, ctx, all);
  bool wind = false;
  for (int i : {mine, round}) if (all[i] >= 3 || (all[i] == 2 && ctx.unseen[i] >= 1)) wind = true;
  bool flower = false;
  for (int f : ctx.flowers) if (f == 34 + ctx.seatWind - 1 || f == 38 + ctx.seatWind - 1) flower = true;
  return wind || flower || cheapWin(ctx);
}

void Foundation::jyContext(Ctx& ctx, const Game& g, int seat) {
  Counts c = countsOf(g.hand.seats[seat].hand);
  ctx.target = jyCurrentTarget(g, seat, c, ctx);
  ctx.fast = jyHasQuickFaan(c, ctx);
  if (ctx.fast && !TARGET_HARD[ctx.target.id]) ctx.slope = std::min(ctx.slope, 0.45);
}

// keepFor(target): false when there is none.
static bool keepFor(const Target& t, Mask& m) {
  switch (t.id) {
    case T_ORPHANS: m = M_ORPHAN; return true;
    case T_GATES: m = suitMask(t.suit); return true;
    case T_WINDS: case T_HONORS: m = M_HONOR; return true;
    case T_TERMINALS: m = M_TERMINAL | M_HONOR; return true;
    case T_FULL: m = suitMask(t.suit); return true;
    case T_HALF: m = halfMask(t.suit); return true;
    case T_SEQUENCES: m = M_NUMBERS; return true;
    default: return false;
  }
}

static PlanP jyPlan(PlanKind kind, int suit, const Counts& counts, ShKind sh, double faan, bool open, double weight) {
  auto p = stdPlan(kind, suit, counts, sh, faan, open);
  p->weight = weight ? weight : 1;
  return p;
}

std::vector<PlanP> Foundation::jyPlansBase(const Counts& c, const Ctx& ctx) {
  Target t = ctx.target.id >= 0 ? ctx.target : Target{T_STANDARD, T_STANDARD, -1, 0};
  if (chowCommitment(ctx) >= 0) return basePlans(c, ctx);
  bool hard = TARGET_HARD[t.id];
  double W = ctx.fast && !hard ? 1 : T.targetWeight;
  double base = baseFaan(ctx) + (ctx.concealed ? 1 : 0);
  PlanP plain = jyPlan(P_PLAIN, -1, c, SH_STD, base + handYaku(ctx, c), true, 0.6);
  int su = t.suit;
  auto flushPlans = [&](int s, double halfW, double fullW) {
    std::vector<PlanP> out;
    if (!hasSuitedMeld(ctx, s)) {
      Counts half = restrictMask(c, halfMask(s));
      out.push_back(jyPlan(P_HALF, s, half, SH_STD, base + 3 + handYaku(ctx, half), true, halfW));
      if (!ctx.meldSuits[3]) out.push_back(jyPlan(P_FULL, s, restrictMask(c, suitMask(s)), SH_STD, base + 7, true, fullW));
    }
    return out;
  };
  auto honorsOnly = [&]() { return restrictMask(c, M_HONOR); };
  auto windsPlan = [&](double weight) {
    int sets = 0;
    for (int i : WINDS_) if (c[i] >= 2) sets++;
    for (auto& m : ctx.melds) if (isWindI(meldFirst(m))) sets++;
    bool big = sets >= 4;
    Counts h = honorsOnly();
    return jyPlan(P_JY_WINDS, -1, h, SH_STD, big ? double(LIMIT) : std::min(double(LIMIT), base + 6 + handYaku(ctx, h)), true, weight);
  };
  auto honorsPlan = [&](double weight) {
    Counts h = honorsOnly();
    return jyPlan(P_JY_HONORS, -1, h, SH_TRIP, std::min(double(LIMIT), base + 10 + handYaku(ctx, h)), true, weight);
  };
  auto terminalsPlan = [&](double weight) {
    Counts kept = restrictMask(c, M_TERMINAL | M_HONOR);
    int hon = 0;
    for (int i = 27; i < 34; i++) hon += kept[i];
    bool honors = hon > 0 || ctx.meldSuits[3];
    return jyPlan(P_JY_TERMINALS, -1, kept, SH_TRIP, honors ? base + 1 + 3 + handYaku(ctx, kept) : std::min(double(LIMIT), base + 10), true, weight);
  };
  auto tripletsPlans = [&](double weight) {
    std::vector<PlanP> out;
    if (ctx.hasChow) return out;
    double yaku = handYaku(ctx, c);
    out.push_back(jyPlan(P_TRIPLETS, -1, c, SH_TRIP, base + 3 + yaku, true, weight));
    if (!ctx.declared) out.push_back(jyPlan(P_CONCEALED_TRIPLETS, -1, c, SH_TRIP, base - 1 + 10, false, weight));
    return out;
  };
  auto cat = [](std::vector<PlanP>& a, const std::vector<PlanP>& b) { a.insert(a.end(), b.begin(), b.end()); };
  std::vector<PlanP> out;
  switch (t.id) {
    case T_ORPHANS: {
      out.push_back(makeSpecialPlan(1, c, ctx));
      out.push_back(terminalsPlan(0.8));
      if (!ctx.declared) {
        PlanP op = makeSpecialPlan(0, restrictMask(c, M_ORPHAN), ctx);
        op->faan += 1;
        op->weight = W * 0.8;
        out.push_back(op);
      }
      out[0]->weight = W;
      break;
    }
    case T_GATES:
      out.push_back(makeSpecialPlan(2, c, ctx, su, t.start));
      cat(out, flushPlans(su, 0.8, W));
      out[0]->weight = W;
      break;
    case T_WINDS: out.push_back(windsPlan(W)); out.push_back(honorsPlan(W * 0.9)); break;
    case T_TERMINALS: out.push_back(terminalsPlan(W)); cat(out, tripletsPlans(0.8)); break;
    case T_HONORS:
      out.push_back(honorsPlan(W));
      cat(out, tripletsPlans(W * 0.9));
      for (int s = 0; s < 3; s++) { auto fp = flushPlans(s, 1, 0.6); if (!fp.empty()) out.push_back(fp[0]); }
      break;
    case T_PAIRS:
      if (!ctx.declared && !concealedShape(c).hasSet) { PlanP pp = makeSpecialPlan(0, c, ctx); pp->weight = W; out.push_back(pp); }
      cat(out, tripletsPlans(1));
      break;
    case T_FULL: out = flushPlans(su, W * 0.9, W); break;
    case T_HALF: out = flushPlans(su, W, 1); cat(out, tripletsPlans(0.8)); break;
    case T_TRIPLETS: {
      out = tripletsPlans(W * 0.9);
      for (auto& p : out) if (p->kind == P_CONCEALED_TRIPLETS) p->weight = W;
      if (!ctx.hasChow && !hasSuitedMeld(ctx, su)) {
        Counts kept = restrictMask(c, halfMask(su));
        out.push_back(jyPlan(P_TRIPLETS, -1, kept, SH_TRIP, base + 3 + 3 + handYaku(ctx, kept), true, W));
      }
      if (!ctx.declared) { PlanP sp = makeSpecialPlan(0, c, ctx); sp->weight = W * 0.9; out.push_back(sp); }
      cat(out, flushPlans(su, 1, 0.8));
      break;
    }
    case T_SEQUENCES:
      out = basePlans(c, ctx);
      for (auto& p : out) if (p->kind == P_STRAIGHTS) p->weight = W;
      break;
    default:
      out = basePlans(c, ctx);
      if (chaseSevenPairs(c, ctx)) out.push_back(makeSpecialPlan(0, c, ctx));
  }
  if (!hard || t.id == T_FULL) {
    auto sameId = [](const Plan& a, const Plan& b) { return a.kind == b.kind && (!isFlushKind(a.kind) || a.suit == b.suit); };
    std::vector<PlanP> more = t.id == T_PAIRS ? pairsUpgrades(c, ctx, false) : upgradePlans(c, ctx);
    if (t.id == T_FULL) { std::vector<PlanP> f; for (auto& p : more) if (!p->hasKeep) f.push_back(p); more = f; }
    std::vector<PlanP> have = out;
    for (auto& p : more) {
      bool dup = false;
      for (auto& h : have) if (sameId(*h, *p)) dup = true;
      if (!dup) out.push_back(p);
    }
  }
  Mask keep;
  if (keepFor(t, keep)) {
    for (auto& p : out) {
      if (p->hasKeep) continue;
      bool same = false;
      switch (t.id) {
        case T_ORPHANS: same = p->kind == P_ORPHANS; break;
        case T_GATES: same = p->kind == P_GATES; break;
        case T_WINDS: same = p->kind == P_JY_WINDS; break;
        case T_TERMINALS: same = p->kind == P_JY_TERMINALS; break;
        case T_HONORS: same = p->kind == P_JY_HONORS; break;
        case T_FULL: same = p->kind == P_FULL && p->suit == su; break;
        case T_HALF: same = p->kind == P_HALF && p->suit == su; break;
        case T_SEQUENCES: same = p->kind == P_STRAIGHTS; break;
        default: break;
      }
      if (same) { p->hasKeep = true; p->keep = keep; }
    }
  }
  bool hasPlain = false;
  for (auto& p : out) if (p->kind == P_PLAIN) hasPlain = true;
  if (!hasPlain) out.push_back(plain);
  return out;
}

/* ---- locking onto a big hand: HANDS ---- */

enum { H_FULL_C, H_FULL_D, H_FULL_B, H_ORPHANS, H_ALL_HONORS, H_ALL_TERMINALS, H_MIXED_ORPHANS, H_WINDS, H_DRAGONS, H_COUNT };

bool Foundation::jyHandFits(int hand, int i) {
  switch (hand) {
    case H_FULL_C: case H_FULL_D: case H_FULL_B: return i < 27 && i / 9 == hand - H_FULL_C;
    case H_ORPHANS: case H_MIXED_ORPHANS: return isOrphanI(i);
    case H_ALL_HONORS: return isHonorI(i);
    case H_ALL_TERMINALS: return isTerminalI(i);
    case H_WINDS: return isWindI(i);
    case H_DRAGONS: return isDragon(i);
  }
  return false;
}
static bool handSets(int hand) { return hand >= H_ALL_HONORS; }
static Mask handMask(int hand) {
  switch (hand) {
    case H_FULL_C: case H_FULL_D: case H_FULL_B: return suitMask(hand - H_FULL_C);
    case H_ORPHANS: case H_MIXED_ORPHANS: return M_ORPHAN;
    case H_ALL_HONORS: return M_HONOR;
    case H_ALL_TERMINALS: return M_TERMINAL;
    case H_WINDS: return M_WIND;
    default: return M_DRAGON;
  }
}

int Foundation::jyHandTiles(int hand, const Counts& c, const Ctx& ctx) {
  if (hand == H_ORPHANS) {
    int kinds = 0, pair = 0;
    for (int i = 0; i < 34; i++) { if (!isOrphanI(i) || !c[i]) continue; kinds++; if (c[i] >= 2) pair = 1; }
    return kinds + pair;
  }
  return tilesOfJ(c, ctx, handMask(hand));
}

std::vector<PlanP> Foundation::jyHandPlans(int hand, const Counts& c, const Ctx& ctx) {
  std::vector<PlanP> out;
  if (hand <= H_FULL_B) {
    int su = hand - H_FULL_C;
    Mask fits = suitMask(su);
    for (auto& m : ctx.melds) if (!inMask(fits, meldFirst(m))) return out;
    out.push_back(stdPlan(P_FULL, su, restrictMask(c, fits), SH_STD, baseFaan(ctx) + (ctx.concealed ? 1 : 0) + 7, true));
    int start = su * 9;
    if (!ctx.declared && nineGatesProgress(c, start) >= LOCK_TILES) out.push_back(makeSpecialPlan(2, c, ctx, su, start));
    return out;
  }
  if (hand == H_ORPHANS) {
    if (!ctx.declared && orphansAlive(c, ctx)) out.push_back(makeSpecialPlan(1, c, ctx));
    return out;
  }
  if (hand == H_WINDS || hand == H_DRAGONS) {
    for (auto& p : upgradePlans(c, ctx)) {
      if (hand == H_WINDS ? (p->kind == P_SMALL_WINDS || p->kind == P_BIG_WINDS) : (p->kind == P_SMALL_DRAGONS || p->kind == P_BIG_DRAGONS)) out.push_back(p);
    }
    return out;
  }
  auto pool = setUpgrades(c, ctx, true);
  auto pu = pairsUpgrades(c, ctx, true);
  pool.insert(pool.end(), pu.begin(), pu.end());
  for (auto& p : pool) {
    bool ok = hand == H_ALL_HONORS ? (p->kind == P_ALL_HONORS || p->kind == P_PAIRS_HONORS)
            : hand == H_ALL_TERMINALS ? (p->kind == P_ALL_TERMINALS || p->kind == P_PAIRS_TERMINALS)
            : (p->kind == P_MIXED_ORPHANS || p->kind == P_PAIRS_ORPHANS);
    if (ok) out.push_back(p);
  }
  return out;
}

Foundation::Measure Foundation::jyMeasure(int hand, const Counts& c, const Ctx& ctx) {
  Measure out{INF, 0, 0};
  for (auto& p : jyHandPlans(hand, c, ctx)) {
    if (p->faan < LOCK_FAAN) continue;
    int s = shantenOf(p->fn, p->counts, ctx.declared);
    if (isInf(s)) continue;
    out.faan = std::max(out.faan, p->faan);
    if (s < out.steps) out.steps = s;
    out.outs += s < 0 ? 1 : ukeireOf(this, p->counts, p->fn, ctx.declared, ctx.unseen, s, &Foundation::shantenOf).total;
  }
  return out;
}

bool Foundation::jyStillPossible(int hand, const Counts& c, const Ctx& ctx) {
  Measure m = jyMeasure(hand, c, ctx);
  return jyHandTiles(hand, c, ctx) >= LOCK_TILES && !isInf(m.steps) && m.outs > 0 && m.steps < ctx.wallLeft;
}

int Foundation::jyPickLock(const Counts& c, const Ctx& ctx) {
  int best = -1;
  double bestValue = -DINF;
  for (int hand = 0; hand < H_COUNT; hand++) {
    if (jyHandTiles(hand, c, ctx) < LOCK_TILES || !jyStillPossible(hand, c, ctx)) continue;
    Measure m = jyMeasure(hand, c, ctx);
    double value = m.faan - STEP_IN_FAAN * m.steps;
    if (value > bestValue) { best = hand; bestValue = value; }
  }
  return best;
}

int Foundation::jySavedLock(const Ctx& ctx) {
  int v = seatShared(*ctx.game, ctx.seat).bigHandLock;
  return v >= 0 ? v : -1;
}

int Foundation::jyUpdateLock(const Counts& c, const Ctx& ctx) {
  const Seat& seat = ctx.game->hand.seats[ctx.seat];
  bool actual = ctx.actualMelds && countsOf(seat.hand) == c;
  if (!actual) return jySavedLock(ctx);
  SeatMemo& sh = seatShared(*ctx.game, ctx.seat);
  int lock = jySavedLock(ctx);
  if (lock >= 0 && !jyStillPossible(lock, c, ctx)) lock = -1;
  if (lock < 0 && (ctx.turn < LOCK_TURNS || sh.bigHandLock == -2)) lock = jyPickLock(c, ctx);
  sh.bigHandLock = lock >= 0 ? lock : -1;
  return lock;
}

void Foundation::jyLockHand(Ctx& ctx, const Counts& counts) {
  int lock = jyUpdateLock(counts, ctx);
  ctx.lock = lock >= 0 ? lock : -1;
  ctx.hasLockedSpecial = lock >= 0;
  ctx.lockedSpecial = lock;
  ctx.planFixed = lock >= 0;
}

std::vector<PlanP> Foundation::jyPlans(const Counts& c, Ctx& ctx) {
  int lock = ctx.lock != -2 ? ctx.lock : jySavedLock(ctx);
  if (lock >= 0) {
    std::vector<PlanP> own;
    for (auto& p : jyHandPlans(lock, c, ctx))
      if (p->faan >= LOCK_FAAN && !isInf(shantenOf(p->fn, p->counts, ctx.declared))) own.push_back(p);
    if (!own.empty()) return own;
  }
  return jyPlansBase(c, ctx);
}

static bool leading(const Target& t, const Candidate& cand) {
  const Analysis* an = cand.analysis.get();
  const Plan* plan = an && an->hasBest ? an->best.plan.get() : nullptr;
  if (!plan) return false;
  if ((t.id == T_HALF || t.id == T_TRIPLETS) && plan->kind == P_HALF && plan->suit == t.suit) return true;
  if (t.id == T_TRIPLETS) return plan->kind == P_TRIPLETS || plan->kind == P_CONCEALED_TRIPLETS || plan->kind == P_PAIRS;
  if (t.id == T_PAIRS) return plan->kind == P_PAIRS;
  if (t.id == T_SEQUENCES) return plan->kind == P_STRAIGHTS;
  return false;
}

bool Foundation::jyPriority(const Game& g, const Ctx& ctx, const Counts& counts, const Candidate& cand, int bestShanten, double& out) {
  if (!T.ownDiscards) return false;
  int i = cand.index;
  Target t = ctx.target.id >= 0 ? ctx.target : Target{T_STANDARD, T_STANDARD, -1, 0};
  bool hard = TARGET_HARD[t.id];
  bool givingUp = ctx.wallLeft < T.giveUpWall && bestShanten >= 2;
  bool pair = counts[i] == 2;
  if (givingUp) { out = pair ? 3 : 2; return true; }
  if (!hard && !leading(t, cand)) return false;
  Mask keep;
  bool hasKeep = keepFor(t, keep);
  bool eyes = t.id == T_SEQUENCES && i == keptHonorPair(counts, ctx);
  if (t.id == T_SEQUENCES && !eyes && holdsDragon(g, i, cand.shanten)) { out = 4; return true; }
  if (hasKeep && !inMask(keep, i) && !eyes) {
    if (pair && i < 27 && !hard && !chowOfAnotherSuit(ctx, i)) { out = 1.25; return true; }
    out = hard ? -1 : 1;
    return true;
  }
  if (t.id == T_GATES && !gatesTileNeeded(counts, t.start, i)) { out = 1; return true; }
  if (isPungTile(g, i) && counts[i] < 2 && cand.shanten <= bestShanten) { out = 1; return true; }
  if (t.id == T_PAIRS) { out = pair ? 6 : 2; return true; }
  if ((t.id == T_TRIPLETS || t.id == T_TERMINALS || t.id == T_HONORS || t.id == T_WINDS) && counts[i] >= 2) { out = counts[i] >= 3 ? 6 : 5; return true; }
  if (t.id == T_TRIPLETS && i < 27 && i / 9 != t.suit) { out = 1; return true; }
  if (i >= 27 && t.id != T_SEQUENCES) {
    int shown = revealedCopies(g, i);
    bool value = valueWeight(ctx, i) > 0;
    if (shown < 2 && (ctx.wallLeft > EARLY_WALL || value)) {
      out = pair ? (value ? 5 : 4) : (value ? 4 : 3);
      return true;
    }
  }
  out = pair ? 3 : 2;
  return true;
}

double Foundation::jyReadyValue(double value, const std::vector<Wait>& waits, const Counts& c, const Ctx& ctx) {
  int min = ctx.game->minFaan;
  bool kongable = false;
  for (int i = 0; i < 34; i++) if (c[i] == 4 || (c[i] == 3 && ctx.unseen[i] > 0)) kongable = true;
  for (auto& m : ctx.melds) if (m.type == PUNG && ctx.unseen[meldFirst(m)] > 0) kongable = true;
  double pLast = ctx.wallLeft <= 8 ? 0.25 : ctx.wallLeft <= 16 ? 0.08 : 0;
  double pKong = kongable ? 0.12 : 0;
  if (!pLast && !pKong) return value;
  double extra = 0;
  for (auto& w : waits)
    if (w.left && !w.tsumoOk && w.tsumoFaan == min - 1)
      extra += (double(w.left) / ctx.unseenTotal) * std::min(ctx.drawsLeft, 6.0) * (pLast + pKong) * 3 * 0.7;
  return value + extra;
}

void Foundation::jyThreats(std::vector<Threat>& list, const Game& g) {
  if (!T.reads) return;
  for (auto& t : list) {
    const Seat& s = g.hand.seats[t.seat];
    int n = int(s.discards.size());
    int by[4] = {0, 0, 0, 0};
    for (auto& d : s.discards) by[suitIdx(d.tile)]++;
    JyRead read;
    read.has = true;
    if (n >= 6) {
      for (int su = 0; su < 3; su++) {
        bool others = true;
        for (int x = 0; x < 3; x++) if (x != su && !(by[x] >= 2)) others = false;
        if (by[su] <= int(std::floor(n * 0.1)) && others) read.flush = su;
      }
    }
    if (n >= 7 && by[3] == 0) read.honors = true;
    int open = std::min(n, 5);
    if (open >= 4) {
      bool all = true;
      for (int k = 0; k < open; k++) if (!isTerminalOrHonor(s.discards[k].tile)) all = false;
      if (all) read.sequences = true;
    }
    t.read = read;
    if (t.flush < 0 && read.flush >= 0 && t.melds >= 1) t.flush = read.flush;
  }
}

double Foundation::jyWaitChance(double chance, const Threat& threat, int i) {
  const JyRead& read = threat.read;
  if (!read.has) return chance;
  if (read.flush >= 0 && threat.flush < 0) {
    int su = suitIdx(i);
    chance *= su == read.flush ? 1.8 : su == 3 ? 1.1 : 0.6;
  }
  if (read.honors && i >= 27 && threat.unseen[i] >= 2) chance *= 1.6;
  if (read.sequences) {
    if (i >= 27) chance *= 0.6;
    else if (i % 9 >= 2 && i % 9 <= 6) chance *= 1.3;
  }
  return chance;
}

double Foundation::jyExtraLoss(const Game& g, const std::vector<Threat>& list, int i) {
  bool inList[4] = {false, false, false, false};
  for (auto& t : list) inList[t.seat] = true;
  int me = 0;
  for (int s = 0; s < 4; s++) if (!inList[s]) { me = s; break; }
  const Threat* next = nullptr;
  for (auto& t : list) if (t.seat == (me + 1) % 4) { next = &t; break; }
  bool late = g.hand.wall.size() < T.giveUpWall;
  double feed = 0;
  if (i < 27 && next) {
    int su = i / 9, r = i % 9, nearN = 0;
    static const int DS[4] = {-2, -1, 1, 2};
    for (int d : DS) {
      if (r + d < 0 || r + d > 8) continue;
      if (next->discarded[i + d]) nearN++;
    }
    double wants = (next->chows[su] ? 2 : 1) * (next->read.has && next->read.flush == su ? 2 : 1) * (nearN ? 0.5 : 1);
    if (!(next->read.has && next->read.flush >= 0 && next->read.flush != su)) feed += 0.002 * wants;
  }
  if (i >= 27 && revealedCopies(g, i) == 0) {
    bool scoring = isDragon(i) || i == 26 + g.round;
    for (auto& t : list) if (t.windIndex == i) scoring = true;
    feed += scoring ? 0.006 : 0.003;
  }
  return feed * T.feed * (late ? 1 : 0.3);
}

double Foundation::jyDefense(double w, const Ctx& ctx, int shanten) {
  if (ctx.lock >= 0) return 0;
  if (ctx.wallLeft < T.giveUpWall && shanten >= 2) return w * T.giveUpDefense;
  return 0;
}

static bool winsNow(const Candidate& x) { return x.shanten == 0 && x.analysis && winsWhenReady(x.analysis->hasReady, x.analysis->ready); }
static bool deadHonor(const Counts& c, const Ctx& ctx, int i) { return isHonorI(i) && c[i] == 1 && ctx.unseen[i] == 0; }

std::vector<CandP> Foundation::jyFinalOrder(const std::vector<CandP>& out, const Ctx& ctx, const Counts& c) {
  if (ctx.folding || !T.ownDiscards) return out;
  int lock = ctx.lock;
  int bestSteps = INT_MAX;
  for (auto& x : out) bestSteps = std::min(bestSteps, x->shanten);
  const Game& g = *ctx.game;
  auto rank = [&](const Candidate& x) -> int {
    int i = x.index;
    if (lock >= 0) {
      if (lock != H_ORPHANS && deadHonor(c, ctx, i)) return 0;
      if (loneDragon(g, c, i) && !winsNow(x)) return 5;
      bool dead = handSets(lock) && c[i] == 1 && ctx.unseen[i] == 0;
      if (!jyHandFits(lock, i) || dead) {
        if (winsNow(x)) return 1;
        return isHonorI(i) ? 3 : 2;
      }
      return 4;
    }
    if (deadHonor(c, ctx, i)) return 0;
    if (winsNow(x)) return 1;
    if (loneDragon(g, c, i)) return 8;
    bool straights = ctx.leadPlan && ctx.leadPlan->kind == P_STRAIGHTS;
    int eyes = straights ? keptHonorPair(c, ctx) : -1;
    if (straights && eyes >= 0 && i >= 27 && i != eyes) return 2;
    if (!isHonorI(i)) {
      int rk = x.shanten <= bestSteps ? 2 : 4;
      if (straights && eyes >= 0) rk += 1;
      if (straights && breaksFinishedStraight(c, i)) rk += 2;
      return rk;
    }
    if (c[i] >= 3) return 7;
    if (c[i] == 2) return 6;
    return 3;
  };
  struct KXR { CandP x; int k; int r; };
  std::vector<KXR> v;
  for (size_t k = 0; k < out.size(); k++) v.push_back({out[k], int(k), rank(*out[k])});
  js::sort(v, [&](const KXR& a, const KXR& b) -> double {
    if (a.r != b.r) return a.r - b.r;
    if (a.x->index >= 27 && b.x->index >= 27) {
      int d = ctx.unseen[a.x->index] - ctx.unseen[b.x->index];
      if (d) return d;
      d = honorKeepRank(ctx, a.x->index) - honorKeepRank(ctx, b.x->index);
      if (d) return d;
    }
    return a.k - b.k;
  });
  std::vector<CandP> r;
  for (auto& e : v) r.push_back(e.x);
  return r;
}

bool Foundation::jyKongOk(const KongOption& kong, const Ctx& ctx) {
  return ctx.lock < 0 || (jyHandFits(ctx.lock, kong.tile) && ctx.lock != H_ORPHANS);
}
