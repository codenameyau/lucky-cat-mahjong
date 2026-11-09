// The shared bot foundation (js/mahjong-bot.js) with Jorge Yau's hooks
// (js/mahjong-jorge-yau.js), the base of the benchmark's Jorge Yau and
// Neural Cat. Only the paths those two take are ported: their tuning has
// ownPlans set (no plansOfFamily, no gateSpecial), race unset, keepPairs 0.
// Every function keeps the JS's order of reads, products and sorts.
#pragma once
#include "engine.h"
#include "jsmath.h"
#include "jssort.h"
#include <map>
#include <memory>

namespace lcm {

constexpr double DINF = std::numeric_limits<double>::infinity();
inline bool isInf(int s) { return s >= INF; }

// Suits as the JS's letters: 0 c, 1 d, 2 b, 3 z; -1 none (null).
inline int suitIdx(int i) { return i >= 27 ? 3 : i / 9; }

enum PlanKind : uint8_t {
  P_PLAIN, P_RUNS, P_STRAIGHTS, P_HALF, P_FULL, P_TRIPLETS, P_CONCEALED_TRIPLETS, P_PAIRS, P_ORPHANS, P_GATES,
  P_MIXED_ORPHANS, P_ALL_TERMINALS, P_ALL_HONORS, P_SMALL_DRAGONS, P_BIG_DRAGONS, P_SMALL_WINDS, P_BIG_WINDS,
  P_PAIRS_ORPHANS, P_PAIRS_HONORS, P_PAIRS_TERMINALS, P_JY_WINDS, P_JY_HONORS, P_JY_TERMINALS,
};
enum Family : int8_t {
  F_NONE = -1, F_FLUSH_C, F_FLUSH_D, F_FLUSH_B, F_SETS, F_RUNS, F_PAIRS, F_MAJORS, F_DRAGONS, F_WINDS,
  F_ORPHANS, F_GATES, F_HONORS, F_TERMINALS,
};
Family planFamily(PlanKind k, int suit);

// A plan's shanten function.
enum ShKind : uint8_t { SH_STD, SH_TRIP, SH_SEVEN, SH_ORPH, SH_GATES, SH_GROUP };
struct ShFn {
  ShKind kind = SH_STD;
  bool filled = false;  // filled(fn): a restricted plan needs 13 of its tiles
  int start = 0;        // gates
  // groupShanten
  std::vector<int> group, doneIdx;
  int pungs = 0;
  bool pair = false;
  Counts unseen{};
};

using Mask = uint64_t;  // a set of tile kinds (bit i: kind i), for keep / favors
inline bool inMask(Mask m, int i) { return (m >> i) & 1; }

struct Plan {
  PlanKind kind;
  int suit = -1;
  Counts counts;
  ShFn fn;
  double faan = 0;
  bool open = true;
  double weight = 0;  // 0: unset (JS undefined: picks use 1)
  bool hasKeep = false; Mask keep = 0;
  bool hasFavors = false; Mask favors = 0;
  bool upgrade = false, pairs = false, hard = false;
  int start = 0;  // gates
};
using PlanP = std::shared_ptr<Plan>;

struct Wait { int tile; int left; int ronFaan, tsumoFaan; bool ronOk, tsumoOk; };
struct ReadyInfo { double value = 0; std::vector<Wait> waits; double live = 0; int bestFaan = 0; };

struct Entry {
  PlanP plan;  // null for a ready entry with no plan
  int shanten = 0, planShanten = 0;
  bool hasPlanShanten = true;
  double ukeire = 0;
  int nUkeireTiles = 0;
  double util = 0, chance = 0, pick = 0;
  bool hasChance = false;
  bool readyBest = false;
};

struct Analysis {
  double util = 0;
  bool hasBest = false;
  Entry best;
  double backup = 0;
  int shanten = 0, shapeShanten = 0, plainShanten = 0;
  bool hasReady = false;
  ReadyInfo ready;
};
using AnalysisP = std::shared_ptr<Analysis>;

struct Pivot { bool any = false; int from = -1, to = -1, at = 0; };
struct SeatRead { int seat; double want[34]; double out[34]; double hidden; int collecting; Pivot pivot; double pace; };
struct Track { std::vector<SeatRead> seats; double inWall[34]; double wall; int left, next; };
struct LeftRead { int seat, keeps = -1, feeds = -1; };
struct AfterRead { int seat, keeps = -1; bool locked = false; int melds = 0; };
struct OwnRead { int n = 0; int by[4] = {0, 0, 0, 0}; };

// Jorge Yau's read of an opponent's discards.
struct JyRead { bool has = false; int flush = -1; bool honors = false, sequences = false; };

struct Threat {
  int seat;
  double ready;
  int level, melds, flush = -1;
  int faan;
  double payment;
  bool discarded[34], since[34];
  bool suji[3][9];
  int chows[4];
  int windIndex;
  Counts unseen;
  double want[34];
  Pivot pivot;
  int collecting = -1;
  bool isNext = false;
  int afterKeeps = -1; bool afterLocked = false; int afterMelds = 0;
  JyRead read;
};

// Jorge Yau's target.
struct Target { int id = -1, rank = 0, suit = -1, start = 0; };

struct Tuning {
  std::string id;
  double valuePower = 1, defenseScale = 1.5, lateFold = 1.5, lateFoldWall = 45, chowSuitLate = 0.5, keepLive = 0.01;
  bool tripletsLive = true;
  double targetWeight = 1.5, giveUpWall = 40, giveUpDefense = 1.6, feed = 1;
  bool reads = true, ownDiscards = true, honorOrder = true, ownPlans = true;
  double keepPairs = 0;
};

struct Ctx {
  const Game* game = nullptr;
  int seat = 0, seatWind = 1, round = 1;
  std::vector<Meld> melds;
  bool actualMelds = true;  // ctx.melds === seat.melds
  int declared = 0;
  bool concealed = true, hasChow = false;
  bool meldSuits[4] = {false, false, false, false};
  std::vector<int8_t> flowers;
  Counts unseen{};
  int wallLeft = 0;
  int unseenTotal = 1;
  double drawsLeft = 1;
  int turn = 0;
  Family commitKey = F_NONE;
  std::map<int, int> commitLeft;
  double slope = 0.6;
  bool isDealer = false;
  LeftRead leftRead;
  AfterRead afterRead;
  OwnRead ownRead;
  std::shared_ptr<Track> track;
  double hazard = 0;
  // Jorge Yau
  Target target;
  bool fast = false;
  int lock = -2;  // -2 undefined, -1 null, else HANDS index
  bool hasLockedSpecial = false; int lockedSpecial = -1;
  bool planFixed = false;
  // syncHandPlans
  bool blockSevenPairs = false;
  int avoidSuit = -2;  // -2 undefined, -1 null
  PlanP upgrade;
  PlanP leadPlan;
  bool leadReady = false;
  bool folding = false;
  bool mlSynced = false;
};

struct Candidate {
  int index;
  double util, loss;
  int shanten;
  AnalysisP analysis;
  double score = 0, priority = 0, tier = 0;
  // Neural Cat
  bool hasFeatures = false;
  std::vector<float> features;
  bool hasMl = false;
  double mlEv = 0, mlPWin = 0, mlBest = 0;
  int mlOrder = 0;
  bool mlChoice = false;
};
using CandP = std::shared_ptr<Candidate>;

struct DiscardAnalysis { Ctx ctx; std::vector<CandP> candidates; std::vector<Threat> threats; double defense; bool folding; };

struct ClaimOption { Decision decision; double score; bool hasDiscard = false; int discard = NO_TILE; AnalysisP analysis; CandP cand; };
struct ClaimFound { std::vector<ClaimOption> options; double passScore; Analysis stay; };

// Per-seat state the foundation and Jorge Yau keep for the hand.
struct SeatMemo {
  bool hasPlan = false; int turn = -1; Family base = F_NONE, now = F_NONE; std::map<int, int> left;
  int bigHandLock = -2;  // -2 undefined, -1 null, else HANDS index
  bool hasOpening = false; Target opening;
};
SeatMemo& seatMemo(const Game& g, int seat, const std::string& botId);  // planMemo per strategy id
SeatMemo& seatShared(const Game& g, int seat);  // the seat's own (bigHandLock, opening)

class Foundation {
 public:
  Tuning T;
  explicit Foundation(const std::string& id) { T.id = id; }
  virtual ~Foundation() {}

  // Decisions (createBotAgent's turn and claim).
  virtual Decision chooseTurnAction(const Game& g, int seat, const TurnOptions& o);
  virtual Decision chooseClaim(const Game& g, int seat, const ClaimOptions& o);

  // The parts Neural Cat builds on.
  Ctx buildContext(const Game& g, int seat);
  Ctx withMeld(const Ctx& ctx, const Meld& meld);
  DiscardAnalysis analyzeDiscards(const Game& g, int seat, const Ctx* ctxOverride = nullptr, const std::vector<int8_t>* handOverride = nullptr);
  Analysis handUtility(Counts c, Ctx& ctx);
  std::vector<Threat> opponentThreats(const Game& g, int seat);
  double dealInLoss(const Game& g, const std::vector<Threat>& threats, int i);
  double waitChance(const Game& g, const Threat& t, int i);
  void syncHandPlans(Ctx& ctx, const Counts& counts);
  int flowerPoints(const Ctx& ctx);
  double baseFaan(const Ctx& ctx);
  bool cheapWin(const Ctx& ctx);
  int valueWeight(const Ctx& ctx, int i);
  bool deadTile(const Game& g, int i);
  struct Decided { Decision decision; bool hasFound = false; ClaimFound found; };
  Decided decideClaim(const Game& g, int seat, const ClaimOptions& o);
  std::vector<CandP> honorTieOrder(const std::vector<CandP>& out, const Ctx& ctx, const Counts& c);

 protected:
  // Reads of the table that depend only on the hand's state, kept for its version.
  struct ThreatMemo { uint64_t version = 0; int seat = -1; std::vector<Threat> threats; };
  struct TrackMemo { uint64_t version = 0; int seat = -1; std::shared_ptr<Track> track; };
  ThreatMemo threatMemo_[2];
  TrackMemo trackMemo_[2];
  int threatNext_ = 0, trackNext_ = 0;
  std::vector<Threat> opponentThreatsUncached(const Game& g, int seat);
  std::shared_ptr<Track> readTableUncached(const Game& g, int seat, const Counts& unseen);

  // A strategy's last word on the discard order (Neural Cat).
  virtual bool hasRerank() const { return false; }
  virtual std::vector<CandP> rerank(std::vector<CandP> out, Ctx& ctx, const Counts& counts, const Game& g, int seat,
                                    const std::vector<Threat>& threats, bool folding) { return out; }

  // context and value model
  LeftRead leftRead(const Game& g, int seat);
  AfterRead afterRead(const Game& g, int seat);
  void suitCounts(const Counts& counts, const Ctx& ctx, int out[3]);
  int avoidSuitOf(const Counts& counts, const Ctx& ctx);
  double suitLean(const Plan* plan, const Ctx& ctx);
  double ownLean(const Plan* plan, const Ctx& ctx);
  double handValue(double f, double slope);
  double valueSlope(const Game& g, int seat);
  double handYaku(const Ctx& ctx, const Counts& c);
  int chowCommitment(const Ctx& ctx);
  int suitHeld(const Ctx& ctx, const Counts& counts, int su);
  bool chowSuitReady(const Ctx& ctx, const Counts& counts, int su);
  int suitCommitment(const Ctx& ctx, const Counts& counts);
  int keptHonorPair(const Counts& counts, const Ctx& ctx);
  bool holdsDragon(const Game& g, int i, int shanten);
  bool loneDragon(const Game& g, const Counts& counts, int i);
  bool chowOfAnotherSuit(const Ctx& ctx, int i);
  bool sharedPriority(const Game& g, const Ctx& ctx, const Counts& counts, const Candidate& cand, double& out);
  bool chaseSevenPairs(const Counts& c, const Ctx& ctx);
  bool orphansAlive(const Counts& c, const Ctx& ctx);
  PlanP makeSpecialPlan(int kind, const Counts& c, const Ctx& ctx, int gatesSuit = -1, int gatesStart = 0);
  int revealedCopies(const Game& g, int i);
  bool isPungTile(const Game& g, int i);
  double discardPriority(const Game& g, const Ctx& ctx, const Counts& counts, const Candidate& cand, int bestShanten);
  std::vector<PlanP> plansFor(const Counts& c, Ctx& ctx);
  std::vector<PlanP> aimablePlans(std::vector<PlanP> plans, const Counts& c, const Ctx& ctx);
  std::vector<PlanP> scoringPlans(const Counts& c, const Ctx& ctx);
  std::vector<PlanP> basePlans(const Counts& c, const Ctx& ctx);
  std::vector<PlanP> setUpgrades(const Counts& c, const Ctx& ctx, bool any);
  std::vector<PlanP> upgradePlans(const Counts& c, const Ctx& ctx);
  std::vector<PlanP> pairsUpgrades(const Counts& c, const Ctx& ctx, bool any);
  PlanP liveUpgrade(const Counts& c, const Ctx& ctx);
  bool isHardTarget(const Plan& p, int s, int best, const Counts& c, const Ctx& ctx);
  const Plan* discardTarget(const Ctx& ctx);
  double upgradeOrder(const Ctx& ctx, const Counts& counts, int i, double group);
  bool isDeadFor(const Plan& plan, const Counts& counts, const Ctx& ctx, int i);
  int shantenOf(const ShFn& fn, const Counts& c, int declared);
  // table reads
  SeatRead readSeat(const Game& g, int o, const Counts& unseen);
  std::shared_ptr<Track> readTable(const Game& g, int seat, const Counts& unseen);
  double liveOuts(const Ctx& ctx, const std::vector<int>& tiles);
  double finishChance(const Ctx& ctx, int s, const std::vector<int>& tiles, const Plan& plan);
  double feedLoss(const Game& g, const std::vector<Threat>& list, int i);
  bool readyValue(const Counts& c, const Ctx& ctx, ReadyInfo& out);
  int scoreIfWin(const Ctx& ctx, const std::vector<int8_t>& ids, bool selfDraw);
  void updateCommit(const Game& g, int seat, const Candidate* pick, bool folding);
  Family readCommit(const Game& g, int seat, std::map<int, int>& left);
  bool pivotWhy(const Entry& alt, const Entry& cur, const Ctx& ctx);
  int chooseEntry(std::vector<Entry>& entries, const Ctx& ctx);
  double backupValue(const std::vector<Entry>& entries, int best);
  double defenseWeight(const Ctx& ctx, const std::vector<Threat>& threats, int shanten, int readyFaan);
  // discard order
  std::vector<CandP> tripletsOrder(const std::vector<CandP>& out, const Ctx& ctx, const Counts& counts);
  std::vector<CandP> keepDragonPair(const std::vector<CandP>& out, const Ctx& ctx, const Counts& counts);
  ClaimFound claimCandidates(const Game& g, int seat, const ClaimOptions& o);
  bool claimKeepsPlan(const ClaimOption& o, const ClaimFound& res, const Ctx& ctx);
  bool chowAllowed(const ClaimOption& o, const ClaimFound& res, const Game& g, const Ctx& ctx);

  // Jorge Yau's hooks
  void jyContext(Ctx& ctx, const Game& g, int seat);
  void jyLockHand(Ctx& ctx, const Counts& counts);
  std::vector<PlanP> jyPlans(const Counts& c, Ctx& ctx);
  std::vector<PlanP> jyPlansBase(const Counts& c, const Ctx& ctx);
  bool jyPriority(const Game& g, const Ctx& ctx, const Counts& counts, const Candidate& cand, int bestShanten, double& out);
  double jyReadyValue(double value, const std::vector<Wait>& waits, const Counts& c, const Ctx& ctx);
  void jyThreats(std::vector<Threat>& list, const Game& g);
  double jyWaitChance(double chance, const Threat& t, int i);
  double jyExtraLoss(const Game& g, const std::vector<Threat>& list, int i);
  double jyDefense(double w, const Ctx& ctx, int shanten);
  std::vector<CandP> jyFinalOrder(const std::vector<CandP>& out, const Ctx& ctx, const Counts& c);
  bool jyKongOk(const KongOption& k, const Ctx& ctx);
  Target jyClassify(const Counts& c, const Ctx& ctx, bool& found);
  Target jyCurrentTarget(const Game& g, int seat, const Counts& c, const Ctx& ctx);
  bool jyHasQuickFaan(const Counts& c, const Ctx& ctx);
  int jyUpdateLock(const Counts& c, const Ctx& ctx);
  int jySavedLock(const Ctx& ctx);
  bool jyStillPossible(int hand, const Counts& c, const Ctx& ctx);
  int jyPickLock(const Counts& c, const Ctx& ctx);
  struct Measure { int steps; double faan; double outs; };
  Measure jyMeasure(int hand, const Counts& c, const Ctx& ctx);
  std::vector<PlanP> jyHandPlans(int hand, const Counts& c, const Ctx& ctx);
  int jyHandTiles(int hand, const Counts& c, const Ctx& ctx);
  bool jyHandFits(int hand, int i);
};

// The agent that plays a strategy at the table.
struct BotAgent : Agent {
  std::shared_ptr<Foundation> bot;
  explicit BotAgent(std::shared_ptr<Foundation> b) : bot(std::move(b)) {}
  Decision turn(Game& g, int seat, const TurnOptions& o) override { return bot->chooseTurnAction(g, seat, o); }
  Decision claim(Game& g, int seat, const ClaimOptions& o) override { return bot->chooseClaim(g, seat, o); }
};

}  // namespace lcm
