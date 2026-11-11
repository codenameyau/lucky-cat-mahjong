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
      double pn = 0, psum = 0, psq = 0, pwin = 0, pwinSq = 0;
      // --dump FILE: each deal's points a seat and hands won a seat for each model (float32 pairs,
      // model by model), so screens can pair any candidate with a cached champion.
      FILE* dump = a.count("dump") ? std::fopen(a["dump"].c_str(), "wb") : nullptr;
      if (a.count("dump") && !dump) throw std::runtime_error("lcm-sim play: can't write " + a["dump"]);
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
            x.seats++;
            x.points += r.deltas[k];
            dealPoints[m] += r.deltas[k] / 4.0;
            if (r.win && r.winner == k) {
              x.wins++; dealWins[m] += 0.25;
              x.winPoints += r.deltas[k];
              x.winFaan += r.score.faan;
              if (r.how == H_SELF_DRAW) x.selfDraws++;
            } else if (r.win && r.payer == k) x.dealIns++;
          }
        }
        for (size_t m = 0; m < models.size(); m++) { out[m].n++; out[m].sq += dealPoints[m] * dealPoints[m]; out[m].winSq += dealWins[m] * dealWins[m]; }
        if (dump) for (size_t m = 0; m < models.size(); m++) { float v[2] = {float(dealPoints[m]), float(dealWins[m])}; std::fwrite(v, 4, 2, dump); }
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
      if (dump) std::fclose(dump);
      std::printf("],\"pair\":{\"n\":%.17g,\"sum\":%.17g,\"sq\":%.17g,\"win\":%.17g,\"winSq\":%.17g}}\n", pn, psum, psq, pwin, pwinSq);
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
      j.crn = a.count("crn") > 0;
      j.crnSalt = a.count("crn-salt") ? uint32_t(std::stoul(a["crn-salt"])) : 0;
      j.policyOnly = a.count("policy-only") > 0;
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
