// lcm-sim: the native simulator's command line.
//   lcm-sim trace --agents simple,simple,simple,simple --seed S --deals N
//       every action of every hand and its result, as scripts/ml/native.js
//       prints them from the JS engine (the parity harness diffs the two).
//   lcm-sim speed --agents ... --seed S --deals N
//       hands a second, no trace.
//   lcm-sim play --models a[,b] --table x,y,z --seed S --from F --to T
//       scripts/ml/bench.js playWork natively: the same sums, as JSON.
//   lcm-sim generate --weights W.lcmw --seed S --from F --to T [--out DIR --shard K] [--pool ids]
//       [--learners N] [--returns] [--oracle] [--sample P] [--sample-won P] [--temperature T]
//       scripts/ml/lucky.js generate's worker natively: the same shard files and stats.
//   lcm-sim shanten FILE   shanten of 34-count rows (uint8), one int8 each to stdout
#include "engine.h"
#include "simple_agent.h"
#include "bot.h"
#include "neural_cat.h"
#include "only_orphans.h"
#include "lucky_cat.h"
#include "generate.h"
#include "generate_nc.h"
#include <chrono>
#include <cstdio>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif
#include <cstdlib>
#include <array>
#include <cmath>
#include <map>
#include <sstream>

using namespace lcm;

static std::map<std::string, std::string> parseArgs(int argc, char** argv, std::string& cmd) {
  std::map<std::string, std::string> a;
  cmd = argc > 1 ? argv[1] : "";
  for (int i = 2; i < argc; i++) {
    std::string k = argv[i];
    if (k.rfind("--", 0) == 0) {
      if (i + 1 < argc && std::string(argv[i + 1]).rfind("--", 0) != 0) { a[k.substr(2)] = argv[i + 1]; i++; }
      else a[k.substr(2)] = "1";
    }
  }
  return a;
}

static std::vector<std::string> split(const std::string& s, char sep) {
  std::vector<std::string> out;
  std::stringstream ss(s);
  std::string x;
  while (std::getline(ss, x, sep)) out.push_back(x);
  return out;
}

static std::unique_ptr<Agent> makeAgentChecked(const std::string& id, bool check);
// id~nocheck: the same player without the contradiction check (to measure it).
static std::unique_ptr<Agent> makeAgent(const std::string& id) {
  const std::string off = "~nocheck";
  if (id.size() > off.size() && id.compare(id.size() - off.size(), off.size(), off) == 0) return makeAgentChecked(id.substr(0, id.size() - off.size()), false);
  return makeAgentChecked(id, true);
}

static std::unique_ptr<Agent> makeAgentChecked(const std::string& id, bool check) {
  if (id == "simple") return std::unique_ptr<Agent>(new SimpleAgent());
  if (id == "jorge-yau") { auto f = std::make_shared<Foundation>("jorge-yau"); f->check = check; return std::unique_ptr<Agent>(new BotAgent(f)); }
  // Neural Cat: its weights as .lcmw (scripts/ml/weights.js export), shared by every seat that plays it.
  if (id == "neural-cat" || id.rfind("nc:", 0) == 0) {
    static std::map<std::string, std::shared_ptr<Mlp>> models;
    std::string file = id == "neural-cat" ? "native/build/neural-cat.lcmw" : id.substr(3);
    auto& m = models[file];
    if (!m) m = std::make_shared<Mlp>(loadWeights(file));
    // Each model keeps its own memory of a seat's plan, under its own name, as the JS
    // (create({ id })): an earlier model at the table and the learner reading that
    // seat for training data mustn't share it. "neural-cat" is the shipped one.
    auto f = std::make_shared<NeuralCat>(m, id == "neural-cat" ? std::string("neural-cat") : id);
    f->check = check;
    return std::unique_ptr<Agent>(new BotAgent(f));
  }
  // Only Orphans: oo:<file.lcmw> (js/mahjong-only-orphans.js), or the shipped one
  // (only-orphans: native/build/only-orphans.lcmw). A stacked model (a reader) plays as Neural Cat's.
  if (id == "only-orphans" || id.rfind("oo:", 0) == 0) {
    static std::map<std::string, std::shared_ptr<Mlp>> models;
    std::string file = id == "only-orphans" ? "native/build/only-orphans.lcmw" : id.substr(3);
    auto& m = models[file];
    if (!m) m = std::make_shared<Mlp>(loadWeights(file));
    auto f = std::make_shared<OnlyOrphans>(m, id == "only-orphans" ? std::string("only-orphans") : id);
    f->check = check;
    return std::unique_ptr<Agent>(new BotAgent(f));
  }
  // Lucky Cat: lc:<file.lcmw>, features v1 or v2 (scripts/ml/native.js converts a .json model).
  // With a value (js/mahjong-lucky-cat-value.js): lc:<policy.lcmw>+<value.lcmw>.
  if (id.rfind("lc:", 0) == 0) {
    static std::map<std::string, std::shared_ptr<Mlp>> models;
    static std::map<std::string, std::shared_ptr<ValueNet>> values;
    std::string rest = id.substr(3), vfile;
    size_t plus = rest.find('+');
    if (plus != std::string::npos) { vfile = rest.substr(plus + 1); rest = rest.substr(0, plus); }
    auto& m = models[rest];
    if (!m) m = std::make_shared<Mlp>(loadWeights(rest));
    auto lc = std::unique_ptr<LuckyCat>(new LuckyCat(m));
    if (!vfile.empty()) {
      auto& v = values[vfile];
      if (!v) v = std::make_shared<ValueNet>(std::make_shared<Mlp>(loadWeights(vfile)), lucky::VALUE_SIZE);
      lc->value = v;
    }
    lc->check = check;
    return std::unique_ptr<Agent>(lc.release());
  }
  throw std::runtime_error("lcm-sim: no agent " + id);
}

// js/points.js halfSpicyPoints over full spicy's 8 x 2^(f-3), for a win of f faan (capped at 13):
// payments are linear in the hand's points, so a hand's half-spicy deltas are its deltas times this.
static double halfRatio(int faan) {
  int f = faan > 13 ? 13 : faan;
  if (f < 3) return 1;
  double h = f <= 4 ? std::pow(2.0, f) : f % 2 == 0 ? std::pow(2.0, (f + 4) / 2) : std::pow(2.0, (f + 3) / 2) * 1.5;
  return h / (8.0 * std::pow(2.0, f - 3));
}

int main(int argc, char** argv) {
#ifdef _WIN32
  // Windows opens stdout in text mode, which turns each LF into CR LF: the
  // traces and JSON the scripts read must be byte for byte the JS's.
  _setmode(_fileno(stdout), _O_BINARY);
  _setmode(_fileno(stdin), _O_BINARY);
#endif
  std::string cmd;
  auto a = parseArgs(argc, argv, cmd);
  try {
    if (cmd == "trace" || cmd == "speed") {
      auto ids = split(a.count("agents") ? a["agents"] : "simple,simple,simple,simple", ',');
      if (ids.size() != 4) throw std::runtime_error("lcm-sim: --agents needs 4 ids");
      std::unique_ptr<Agent> own[4];
      Agent* agents[4];
      for (int i = 0; i < 4; i++) { own[i] = makeAgent(ids[i]); agents[i] = own[i].get(); }
      uint32_t seed = uint32_t(std::stoul(a.count("seed") ? a["seed"] : "1"));
      int deals = std::stoi(a.count("deals") ? a["deals"] : "10");
      bool trace = cmd == "trace";
      auto t0 = std::chrono::steady_clock::now();
      long hands = 0;
      std::vector<std::string> lines;
      for (int d = 0; d < deals; d++) {
        GameOptions o;
        o.seed = seed + d; o.dealer = d % 4; o.startPoints = 1000000000;
        Game g = createGame(o);
        lines.clear();
        Result r = runHand(g, agents, trace ? &lines : nullptr);
        hands++;
        if (trace) {
          std::printf("hand %u\n", seed + d);
          for (auto& l : lines) std::printf("%s\n", l.c_str());
          std::printf("%s\n", traceText(r).c_str());
        }
      }
      double s = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
      if (!trace) std::printf("{\"hands\":%ld,\"seconds\":%.4f,\"handsPerSecond\":%.1f}\n", hands, s, hands / s);
      return 0;
    }
    if (cmd == "play") {
      // bench.js playWork: each model in every seat of every deal, the table in the others.
      auto models = split(a["models"], ',');
      auto table = split(a.count("table") ? a["table"] : "neural-cat,jorge-yau,neural-cat", ',');
      if (table.size() != 3) throw std::runtime_error("lcm-sim: --table needs 3 ids");
      uint32_t seed = uint32_t(std::stoul(a["seed"]));
      long from = std::stol(a["from"]), to = std::stol(a["to"]);
      std::vector<std::unique_ptr<Agent>> modelAgents, tableAgents;
      for (auto& id : models) modelAgents.push_back(makeAgent(id));
      for (auto& id : table) tableAgents.push_back(makeAgent(id));
      struct Out { double seats = 0, points = 0, wins = 0, dealIns = 0, winPoints = 0, winFaan = 0, selfDraws = 0, n = 0, sq = 0, winSq = 0; };
      std::vector<Out> out(models.size());
      // --rows FILE: each deal's sums for each model (float64: points, wins, deal-ins, win
      // points, win faan, self-draws, over the deal's four seats), so a result can be cached
      // and paired deal by deal with another run on the same deals (scripts/ml/oo-night.js).
      struct RowAcc { double points = 0, wins = 0, dealIns = 0, winPoints = 0, winFaan = 0, selfDraws = 0, half = 0, limits = 0; };
      std::vector<RowAcc> acc(models.size());
      FILE* rowsFile = nullptr;
      if (a.count("rows")) {
        rowsFile = std::fopen(a["rows"].c_str(), "wb");
        if (!rowsFile) throw std::runtime_error("lcm-sim: can't write " + a["rows"]);
      }
      double pn = 0, psum = 0, psq = 0, pwin = 0, pwinSq = 0;
      for (long d = from; d < to; d++) {
        std::vector<double> dealPoints(models.size(), 0), dealWins(models.size(), 0);
        for (int k = 0; k < 4; k++) {
          for (size_t m = 0; m < models.size(); m++) {
            Agent* agents[4];
            int t = 0;
            for (int s = 0; s < 4; s++) agents[s] = s == k ? modelAgents[m].get() : tableAgents[t++].get();
            GameOptions o;
            o.seed = uint32_t(seed + d); o.dealer = int(d % 4); o.startPoints = 1000000000;
            Game g = createGame(o);
            Result r = runHand(g, agents);
            Out& x = out[m];
            RowAcc& q = acc[m];
            x.seats++;
            x.points += r.deltas[k];
            q.points += r.deltas[k];
            q.half += r.win ? r.deltas[k] * halfRatio(r.score.faan) : r.deltas[k];
            dealPoints[m] += r.deltas[k] / 4.0;
            if (r.win && r.winner == k) {
              x.wins++; dealWins[m] += 0.25; q.wins++;
              x.winPoints += r.deltas[k]; q.winPoints += r.deltas[k];
              x.winFaan += r.score.faan; q.winFaan += r.score.faan;
              if (r.score.faan >= 13) q.limits++;
              if (r.how == H_SELF_DRAW) { x.selfDraws++; q.selfDraws++; }
            } else if (r.win && r.payer == k) { x.dealIns++; q.dealIns++; }
          }
        }
        for (size_t m = 0; m < models.size(); m++) { out[m].n++; out[m].sq += dealPoints[m] * dealPoints[m]; out[m].winSq += dealWins[m] * dealWins[m]; }
        if (rowsFile) for (size_t m = 0; m < models.size(); m++) {
          const RowAcc& q = acc[m];
          double row[8] = {q.points, q.wins, q.dealIns, q.winPoints, q.winFaan, q.selfDraws, q.half, q.limits};
          std::fwrite(row, sizeof(double), 8, rowsFile);
        }
        for (auto& q : acc) q = RowAcc();
        if (models.size() == 2) {
          double gp = dealPoints[0] - dealPoints[1], w = dealWins[0] - dealWins[1];
          pn++; psum += gp; psq += gp * gp; pwin += w; pwinSq += w * w;
        }
      }
      std::printf("{\"out\":[");
      for (size_t m = 0; m < out.size(); m++) {
        const Out& x = out[m];
        std::printf("%s{\"seats\":%.17g,\"points\":%.17g,\"wins\":%.17g,\"dealIns\":%.17g,\"winPoints\":%.17g,\"winFaan\":%.17g,\"selfDraws\":%.17g,\"n\":%.17g,\"sq\":%.17g,\"winSq\":%.17g}",
                    m ? "," : "", x.seats, x.points, x.wins, x.dealIns, x.winPoints, x.winFaan, x.selfDraws, x.n, x.sq, x.winSq);
      }
      if (rowsFile) std::fclose(rowsFile);
      std::printf("],\"pair\":{\"n\":%.17g,\"sum\":%.17g,\"sq\":%.17g,\"win\":%.17g,\"winSq\":%.17g}}\n", pn, psum, psq, pwin, pwinSq);
      return 0;
    }
    if (cmd == "shadow") {
      // lcm-sim shadow --champion oo:C --shadows oo:a,oo:b,... --table x,y,z --seed S --from F --to T --rows FILE
      // As play, for the champion and each shadow in every seat of every deal, but each
      // shadow is read alongside the champion (NeuralCat::shadows): a hand where it chose
      // as the champion at every decision is the champion's hand, and only the hands where
      // it chose otherwise are played with it. Rows as play --rows: champion first, then
      // the shadows in order.
      std::string champId = a["champion"];
      auto shadowIds = split(a["shadows"], ',');
      auto table = split(a.count("table") ? a["table"] : "", ',');
      if (table.size() != 3) throw std::runtime_error("lcm-sim shadow: --table needs 3 ids");
      if (champId.rfind("oo:", 0) != 0) throw std::runtime_error("lcm-sim shadow: --champion oo:<file>");
      uint32_t seed = uint32_t(std::stoul(a["seed"]));
      long from = std::stol(a["from"]), to = std::stol(a["to"]);
      auto champ = std::make_shared<OnlyOrphans>(std::make_shared<Mlp>(loadWeights(champId.substr(3))), champId);
      for (auto& id : shadowIds) {
        if (id.rfind("oo:", 0) != 0) throw std::runtime_error("lcm-sim shadow: --shadows oo:<file>,...");
        champ->addShadow(std::make_shared<Mlp>(loadWeights(id.substr(3))));
      }
      BotAgent champAgent(champ);
      std::vector<std::unique_ptr<Agent>> own, tableAgents;
      for (auto& id : shadowIds) own.push_back(makeAgent(id));
      for (auto& id : table) tableAgents.push_back(makeAgent(id));
      const size_t M = 1 + shadowIds.size();
      std::vector<double> replays(shadowIds.size(), 0);
      FILE* rowsFile = std::fopen(a["rows"].c_str(), "wb");
      if (!rowsFile) throw std::runtime_error("lcm-sim: can't write " + a["rows"]);
      double hands = 0;
      for (long d = from; d < to; d++) {
        std::vector<std::array<double, 8>> acc(M, std::array<double, 8>{0, 0, 0, 0, 0, 0, 0, 0});
        auto add = [&](size_t m, const Result& r, int k) {
          auto& q = acc[m];
          q[0] += r.deltas[k];
          q[6] += r.win ? r.deltas[k] * halfRatio(r.score.faan) : r.deltas[k];
          if (r.win && r.winner == k) { q[1]++; q[3] += r.deltas[k]; q[4] += r.score.faan; if (r.how == H_SELF_DRAW) q[5]++; if (r.score.faan >= 13) q[7]++; }
          else if (r.win && r.payer == k) q[2]++;
        };
        auto playWith = [&](Agent* me, int k) {
          Agent* agents[4];
          int t = 0;
          for (int s = 0; s < 4; s++) agents[s] = s == k ? me : tableAgents[t++].get();
          GameOptions o;
          o.seed = uint32_t(seed + d); o.dealer = int(d % 4); o.startPoints = 1000000000;
          Game g = createGame(o);
          return runHand(g, agents);
        };
        for (int k = 0; k < 4; k++) {
          champ->resetShadows();
          Result r = playWith(&champAgent, k);
          hands++;
          add(0, r, k);
          for (size_t s = 0; s < shadowIds.size(); s++) {
            if (!champ->shadows[s].diverged) { add(s + 1, r, k); continue; }
            Result rs = playWith(own[s].get(), k);
            replays[s]++;
            add(s + 1, rs, k);
          }
        }
        for (size_t m = 0; m < M; m++) std::fwrite(acc[m].data(), sizeof(double), 8, rowsFile);
      }
      std::fclose(rowsFile);
      std::printf("{\"hands\":%.17g,\"replays\":[", hands);
      for (size_t s = 0; s < replays.size(); s++) std::printf("%s%.17g", s ? "," : "", replays[s]);
      std::printf("]}\n");
      return 0;
    }
    if (cmd == "vr") {
      // lcm-sim vr --champion oo:C --shadows oo:a,... --table x,y,z --seed S --from F --to T --rows FILE [--k K]
      // The variance-reduced paired estimate. Each hand is played once by the champion with
      // the arms read alongside (as shadow). A hand where an arm chose as the champion
      // throughout contributes a gap of exactly zero. Where an arm first chose otherwise, the
      // game just before that decision is kept, and the rest of the hand is played K times by
      // each side from there, with the wall (the draws still to come, and nothing else) reshuffled
      // the same way for both (common random numbers). Every hand stays as it was, so given
      // everything that has happened the remaining wall is exchangeable: each replay is an
      // unbiased draw of how that hand ends, and their mean an unbiased, lower-variance estimate
      // of the arm's gap on it. Rows as play --rows: the champion's real rows, then for each arm
      // the champion's rows plus its estimated gap (so a paired gap of the two is the estimate).
      std::string champId = a["champion"];
      auto shadowIds = split(a["shadows"], ',');
      auto table = split(a.count("table") ? a["table"] : "", ',');
      if (table.size() != 3) throw std::runtime_error("lcm-sim vr: --table needs 3 ids");
      int K = a.count("k") ? std::stoi(a["k"]) : 4;
      uint32_t seed = uint32_t(std::stoul(a["seed"]));
      long from = std::stol(a["from"]), to = std::stol(a["to"]);
      auto champ = std::make_shared<OnlyOrphans>(std::make_shared<Mlp>(loadWeights(champId.substr(3))), champId);
      for (auto& id : shadowIds) champ->addShadow(std::make_shared<Mlp>(loadWeights(id.substr(3))));
      BotAgent champAgent(champ);
      auto plainChamp = makeAgent(champId);
      std::vector<std::unique_ptr<Agent>> own, tableAgents;
      for (auto& id : shadowIds) own.push_back(makeAgent(id));
      for (auto& id : table) tableAgents.push_back(makeAgent(id));
      const size_t S = shadowIds.size(), M = 1 + S;
      // Where an arm first chose otherwise: the game before that decision.
      struct Split { std::shared_ptr<Game> snap; bool atClaim = false; int from = -1, tile = NO_TILE; bool ok = false; };
      std::vector<Split> splits(S);
      auto snapshotOf = [](const Game& g) {
        auto p = std::make_shared<Game>(g);
        for (auto& s : p->hand.seats) if (s.botState) s.botState = s.botState->clone();
        return p;
      };
      // The model seat's decisions, each with the game kept before it, in case an arm splits there.
      struct Watch : Agent {
        Agent* inner; NeuralCat* nc; std::vector<Split>* splits; std::function<std::shared_ptr<Game>(const Game&)> snap;
        std::vector<char> before;
        void mark() { before.assign(nc->shadows.size(), 0); for (size_t s = 0; s < before.size(); s++) before[s] = nc->shadows[s].diverged; }
        void after(const std::shared_ptr<Game>& g, bool atClaim, int from, int tile, bool ok) {
          for (size_t s = 0; s < before.size(); s++)
            if (!before[s] && nc->shadows[s].diverged) { Split& x = (*splits)[s]; x.snap = g; x.atClaim = atClaim; x.from = from; x.tile = tile; x.ok = ok; }
        }
        Decision turn(Game& g, int seat, const TurnOptions& o) override {
          mark(); auto sn = snap(g); Decision d = inner->turn(g, seat, o); after(sn, false, -1, NO_TILE, true); return d;
        }
        Decision claim(Game& g, int seat, const ClaimOptions& o) override {
          mark(); auto sn = snap(g); Decision d = inner->claim(g, seat, o); after(sn, true, o.from, o.tile, !o.robKong); return d;
        }
      };
      Watch watch; watch.inner = &champAgent; watch.nc = champ.get(); watch.splits = &splits; watch.snap = snapshotOf;
      FILE* rowsFile = std::fopen(a["rows"].c_str(), "wb");
      if (!rowsFile) throw std::runtime_error("lcm-sim: can't write " + a["rows"]);
      double hands = 0, split = 0, replays = 0, full = 0;
      for (long d = from; d < to; d++) {
        std::vector<std::array<double, 8>> acc(M, std::array<double, 8>{0, 0, 0, 0, 0, 0, 0, 0});
        // A result's eight numbers for seat k.
        auto row = [&](const Result& r, int k, double w, std::array<double, 8>& q) {
          q[0] += w * r.deltas[k];
          q[6] += w * (r.win ? r.deltas[k] * halfRatio(r.score.faan) : r.deltas[k]);
          if (r.win && r.winner == k) { q[1] += w; q[3] += w * r.deltas[k]; q[4] += w * r.score.faan; if (r.how == H_SELF_DRAW) q[5] += w; if (r.score.faan >= 13) q[7] += w; }
          else if (r.win && r.payer == k) q[2] += w;
        };
        auto agentsFor = [&](Agent* me, int k, Agent** ag) { int t = 0; for (int s = 0; s < 4; s++) ag[s] = s == k ? me : tableAgents[t++].get(); };
        for (int k = 0; k < 4; k++) {
          champ->resetShadows();
          for (auto& x : splits) x = Split();
          Agent* ag[4];
          agentsFor(&watch, k, ag);
          GameOptions o;
          o.seed = uint32_t(seed + d); o.dealer = int(d % 4); o.startPoints = 1000000000;
          Game g = createGame(o);
          Result r = runHand(g, ag);
          hands++;
          row(r, k, 1, acc[0]);
          for (size_t s = 0; s < S; s++) {
            row(r, k, 1, acc[s + 1]);
            if (!champ->shadows[s].diverged) continue;
            split++;
            const Split& x = splits[s];
            if (!x.snap || !x.ok) {
              // No replay from here (a robbed kong): the arm's own whole hand, less the champion's.
              Agent* a2[4]; agentsFor(own[s].get(), k, a2);
              Game g2 = createGame(o);
              Result r2 = runHand(g2, a2);
              row(r, k, -1, acc[s + 1]); row(r2, k, 1, acc[s + 1]);
              full++;
              continue;
            }
            for (int j = 0; j < K; j++) {
              uint32_t rs = uint32_t((uint64_t(seed + d) * 2654435761u) ^ (uint32_t(k) * 40503u) ^ (uint32_t(j + 1) * 2246822519u) ^ (uint32_t(s) * 3266489917u));
              Result side[2];
              for (int w = 0; w < 2; w++) {
                Game c = *x.snap;
                for (auto& st : c.hand.seats) if (st.botState) st.botState = st.botState->clone();
                Rng rng(rs);
                Hand& h = c.hand;
                for (int i = h.wall.tail; i > h.wall.head + 1; i--) std::swap(h.wall.t[i - 1], h.wall.t[h.wall.head + size_t(rng() * double(i - h.wall.head))]);
                touch(h);
                Agent* me = w == 0 ? plainChamp.get() : own[s].get();
                // The arm's memory of the hand is the champion's so far: they chose alike until here.
                if (w == 1) seatMemo(c, k, shadowIds[s]) = seatMemo(c, k, champId);
                Agent* a2[4]; agentsFor(me, k, a2);
                side[w] = x.atClaim ? continueAtClaims(c, a2, x.from, x.tile) : continueAtTurn(c, a2, k);
              }
              row(side[0], k, -1.0 / K, acc[s + 1]);
              row(side[1], k, 1.0 / K, acc[s + 1]);
              replays++;
            }
          }
        }
        for (size_t m = 0; m < M; m++) std::fwrite(acc[m].data(), sizeof(double), 8, rowsFile);
      }
      std::fclose(rowsFile);
      std::printf("{\"hands\":%.17g,\"split\":%.17g,\"replays\":%.17g,\"full\":%.17g}\n", hands, split, replays, full);
      return 0;
    }
    if (cmd == "targets") {
      // lcm-sim targets --model oo:M --table x,y,z --seed S --from F --to T --k K --rows FILE
      // The target choice measured: in each deal the model sits in seat d % 4. At its first turn the
      // game is kept, and the rest of the hand is played K times under each option: the rules' own
      // targets (as the game plays), and each target the rules read as possible then (worth > 0),
      // forced at that first decision, the rules carrying on from it. Every option plays the same K reshuffled walls (common random
      // numbers; only the wall is reshuffled, so each replay is an unbiased draw of the hand's end).
      // Rows: per deal, float64 x (1 + 5 options) x 4: [mean points, mean wins, mean limit wins,
      // feasible], then the rules' first pick, the seat.
      std::string modelId = a["model"];
      auto table = split(a.count("table") ? a["table"] : "", ',');
      if (table.size() != 3) throw std::runtime_error("lcm-sim targets: --table needs 3 ids");
      int K = a.count("k") ? std::stoi(a["k"]) : 32;
      uint32_t salt = a.count("salt") ? uint32_t(std::stoul(a["salt"])) : 0;  // other walls for the same deals
      uint32_t seed = uint32_t(std::stoul(a["seed"]));
      long from = std::stol(a["from"]), to = std::stol(a["to"]);
      auto oo = std::make_shared<OnlyOrphans>(std::make_shared<Mlp>(loadWeights(modelId.substr(3))), modelId);
      BotAgent me(oo);
      std::vector<std::unique_ptr<Agent>> tableAgents;
      for (auto& id : table) tableAgents.push_back(makeAgent(id));
      struct First : Agent {
        Agent* inner; int seat; std::shared_ptr<Game> snap;
        Decision turn(Game& g, int s, const TurnOptions& o) override {
          if (s == seat && !snap && !o.hasWin) { snap = std::make_shared<Game>(g); for (auto& st : snap->hand.seats) if (st.botState) st.botState = st.botState->clone(); }
          return inner->turn(g, s, o);
        }
        Decision claim(Game& g, int s, const ClaimOptions& o) override { return inner->claim(g, s, o); }
      };
      FILE* rowsFile = std::fopen(a["rows"].c_str(), "wb");
      if (!rowsFile) throw std::runtime_error("lcm-sim: can't write " + a["rows"]);
      const int NOPT = 1 + OnlyOrphans::OO_TARGETS;
      long done = 0;
      for (long d = from; d < to; d++) {
        int k = int(d % 4);
        GameOptions o;
        o.seed = uint32_t(seed + d); o.dealer = int(d % 4); o.startPoints = 1000000000;
        Game g = createGame(o);
        First fa; fa.inner = &me; fa.seat = k;
        Agent* ag[4];
        { int t = 0; for (int s = 0; s < 4; s++) ag[s] = s == k ? static_cast<Agent*>(&fa) : tableAgents[t++].get(); }
        oo->forcedTarget = -1;
        runHand(g, ag);
        std::vector<double> row(size_t(NOPT) * 4 + 2, 0);
        if (fa.snap) {
          Game& s0 = *fa.snap;
          Ctx ctx = oo->buildContext(s0, k);
          OnlyOrphans::Worths w = oo->targetWorths(countsOf(s0.hand.seats[k].hand), ctx);
          int first = OnlyOrphans::pickTarget(w, -1);
          row[size_t(NOPT) * 4] = first;
          row[size_t(NOPT) * 4 + 1] = k;
          for (int opt = 0; opt < NOPT; opt++) {
            int t = opt - 1;
            if (t >= 0 && !(w.w[t] > 0)) continue;
            row[size_t(opt) * 4 + 3] = 1;
            for (int j = 0; j < K; j++) {
              Game c = s0;
              for (auto& st : c.hand.seats) if (st.botState) st.botState = st.botState->clone();
              Rng rng(uint32_t((uint64_t(seed + d) * 2654435761u) ^ (uint32_t(j + 1 + salt) * 2246822519u)));
              Hand& h = c.hand;
              for (int i = h.wall.tail; i > h.wall.head + 1; i--) std::swap(h.wall.t[i - 1], h.wall.t[h.wall.head + size_t(rng() * double(i - h.wall.head))]);
              touch(h);
              // The target forced at this first decision only (the seat's memory of it set too);
              // from the next decision the rules carry on from it, switching as they would.
              struct ForceFirst : Agent {
                Agent* inner; OnlyOrphans* oo; int seat, t; bool used = false;
                Decision turn(Game& g, int s, const TurnOptions& o) override {
                  if (s != seat || used || t < 0) return inner->turn(g, s, o);
                  used = true; oo->forcedTarget = t; Decision d = inner->turn(g, s, o); oo->forcedTarget = -1; return d;
                }
                Decision claim(Game& g, int s, const ClaimOptions& o) override { return inner->claim(g, s, o); }
              };
              ForceFirst ffa; ffa.inner = &me; ffa.oo = oo.get(); ffa.seat = k; ffa.t = t;
              if (t >= 0) seatMemo(c, k, modelId).ooTarget = t;
              Agent* a2[4];
              { int q = 0; for (int s = 0; s < 4; s++) a2[s] = s == k ? static_cast<Agent*>(&ffa) : tableAgents[q++].get(); }
              Result r = continueAtTurn(c, a2, k);
              row[size_t(opt) * 4] += double(r.deltas[k]) / K;
              if (r.win && r.winner == k) { row[size_t(opt) * 4 + 1] += 1.0 / K; if (r.score.faan >= 13) row[size_t(opt) * 4 + 2] += 1.0 / K; }
            }
            oo->forcedTarget = -1;
          }
        }
        std::fwrite(row.data(), sizeof(double), row.size(), rowsFile);
        done++;
      }
      std::fclose(rowsFile);
      std::printf("{\"deals\":%ld}\n", done);
      return 0;
    }
    if (cmd == "generate") {
      // scripts/ml/lucky.js generate's worker: the same rows, shard files and stats.
      GenerateJob j;
      j.weights = a["weights"];
      j.temperature = a.count("temperature") ? std::stod(a["temperature"]) : 1;
      j.seed = uint32_t(std::stoul(a["seed"]));
      if (a.count("pool") && !a["pool"].empty()) j.pool = split(a["pool"], ',');
      j.learners = a.count("learners") ? std::stoi(a["learners"]) : 2;
      j.returns = a.count("returns") > 0;
      j.oracle = a.count("oracle") > 0;
      j.sample = a.count("sample") ? std::stod(a["sample"]) : 1;
      j.sampleWon = a.count("sample-won") ? std::stod(a["sample-won"]) : -1;
      j.from = std::stol(a["from"]);
      j.to = std::stol(a["to"]);
      j.shard = a.count("shard") ? std::stoi(a["shard"]) : 0;
      if (a.count("out")) { j.out = a["out"]; j.write = true; }
      return runGenerate(j, [](const std::string& id) { return makeAgent(id); });
    }
    if (cmd == "generate-lcv") {
      // Lucky Cat's value data (js/mahjong-lucky-cat-value.js): native only.
      NcGenerateJob j;
      j.weights = a["weights"];
      j.temperature = a.count("temperature") ? std::stod(a["temperature"]) : 1;
      j.epsilon = a.count("epsilon") ? std::stod(a["epsilon"]) : 0.1;
      j.sample = a.count("sample") ? std::stod(a["sample"]) : 0.12;
      j.seed = uint32_t(std::stoul(a["seed"]));
      j.deals = std::stol(a["deals"]);
      j.shard = a.count("shard") ? std::stoi(a["shard"]) : 0;
      j.pool = split(a["pool"], ',');
      if (a.count("strategies")) for (auto& k : split(a["strategies"], ',')) j.poolStrategies.push_back(std::stoi(k));
      j.out = a["out"];
      j.optionReplays = a.count("option-replays") ? std::stoi(a["option-replays"]) : 0;
      j.options = a.count("options") ? std::stoi(a["options"]) : 4;
      j.optionShare = a.count("option-share") ? std::stod(a["option-share"]) : 0.1;
      return runGenerateLcv(j, [](const std::string& id) { return makeAgent(id); });
    }
    if (cmd == "generate-nc") {
      // scripts/ml/generate.js's worker (Neural Cat and the frontier model): the same shard files.
      NcGenerateJob j;
      j.weights = a["weights"];
      j.temperature = a.count("temperature") ? std::stod(a["temperature"]) : 100;
      j.epsilon = a.count("epsilon") ? std::stod(a["epsilon"]) : 0.05;
      j.sample = a.count("sample") ? std::stod(a["sample"]) : 0.3;
      j.seed = uint32_t(std::stoul(a["seed"]));
      j.deals = std::stol(a["deals"]);
      j.shard = a.count("shard") ? std::stoi(a["shard"]) : 0;
      j.strategy = a.count("strategy") ? std::stoi(a["strategy"]) : 0;
      j.pool = split(a["pool"], ',');
      j.out = a["out"];
      // The learner: neural-cat (default) or only-orphans (generate.js --learner).
      j.learner = a.count("learner") ? a["learner"] : "neural-cat";
      if (j.learner != "neural-cat" && j.learner != "only-orphans") throw std::runtime_error("lcm-sim generate-nc: --learner neural-cat or only-orphans");
      j.replays = a.count("replays") ? std::stoi(a["replays"]) : 0;
      if (a.count("record-all")) {
        j.recordAll = true;
        for (auto& k : split(a["record-all"], ',')) j.poolStrategies.push_back(std::stoi(k));
        if (j.poolStrategies.size() != j.pool.size()) throw std::runtime_error("lcm-sim generate-nc: --record-all needs a strategy index for each pool id");
      }
      j.replayShare = a.count("replay-share") ? std::stod(a["replay-share"]) : 0.25;
      j.otherShare = a.count("other-share") ? std::stod(a["other-share"]) : -1;
      j.optionReplays = a.count("option-replays") ? std::stoi(a["option-replays"]) : 0;
      j.options = a.count("options") ? std::stoi(a["options"]) : 4;
      j.optionShare = a.count("option-share") ? std::stod(a["option-share"]) : 0.1;
      return runGenerateNc(j, [](const std::string& id) { return makeAgent(id); });
    }
    if (cmd == "shanten") {
      FILE* f = std::fopen(argv[2], "rb");
      if (!f) throw std::runtime_error("lcm-sim: can't read " + std::string(argv[2]));
      uint8_t row[34];
      std::vector<int8_t> out;
      while (std::fread(row, 1, 34, f) == 34) {
        int8_t c[34];
        for (int i = 0; i < 34; i++) c[i] = int8_t(row[i]);
        out.push_back(int8_t(shanten(c, 0)));
      }
      std::fclose(f);
      std::fwrite(out.data(), 1, out.size(), stdout);
      return 0;
    }
    std::fprintf(stderr, "usage: lcm-sim trace|speed|shanten (see native/src/main.cpp)\n");
    return 2;
  } catch (const std::exception& e) {
    std::fprintf(stderr, "%s\n", e.what());
    return 1;
  }
}
