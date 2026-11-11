// lcm-sim generate-nc: scripts/ml/generate.js's worker natively, for Neural Cat,
// the frontier model and Only Orphans (--learner only-orphans): the same deals, the same random draws, the same rows,
// the same shard files byte for byte (scripts/ml/generate.js --native checks it
// with `parity`). Records the learner's own seats (--record <learner>).
#pragma once
#include "generate.h"

namespace lcm {

struct NcGenerateJob {
  std::string weights;            // the learner's .lcmw
  std::string learner = "neural-cat";  // or "only-orphans" (native/src/only_orphans.h)
  double temperature = 100, epsilon = 0.05, sample = 0.3;
  uint32_t seed = 1;              // the worker's first deal seed
  long deals = 0;
  int shard = 0, strategy = 0;    // the learner's index in the manifest's strategies
  std::vector<std::string> pool;  // native ids; "learner" is the exploring copy
  // Every seat recorded (generate.js's default), each read through the learner as the JS
  // reads it; poolStrategies[k] is pool[k]'s index in the manifest's strategies.
  bool recordAll = false;
  std::vector<int> poolStrategies;
  std::string out;
  // Replayed labels (the frontier plan, step 5): this share of the recorded
  // discards is played on `replays` times after the hand, with the tiles the
  // seat can't see (the others' hands and the wall) shuffled each time. The
  // counts go in shard-N.replay; the rows themselves are unchanged.
  int replays = 0;
  double replayShare = 0;
  // Option replays (steps 5 and 6): this share of the recorded decisions writes a
  // group of rows, one for each option the seat weighs (the first `options`
  // discards in the foundation's order and each kong; or passing, each call and
  // the kong), each played on `optionReplays` times from the position. In
  // shard-N.options (features) and shard-N.optlabels (56 bytes a row: group,
  // chosen, kind, strategy, options, replays, outcome counts, seat, mean points,
  // deal seed, win and pay faan counts).
  int optionReplays = 0, options = 4;
  double optionShare = 0;
  // generate-lcv only: --crn plays every option of a group on the same wall shuffles
  // (replay n of each option draws the same future), so the options' differences carry
  // far less of the futures' luck; --policy-only writes only the policy files (no value rows).
  bool crn = false, policyOnly = false;
  uint32_t crnSalt = 0;  // --crn-salt: another set of futures (to measure the replays' noise)
};

int runGenerateNc(const NcGenerateJob& job, const AgentFactory& make);

// lcm-sim generate-lcv: Lucky Cat's value data (js/mahjong-lucky-cat-value.js), native
// only. The learner is Lucky Cat (job.weights: <policy.lcmw>[+<value.lcmw>]), playing
// by its shares at job.temperature (no value), or by its value with job.epsilon. At a
// share of every seat's decisions (job.sample): the value's features of the position the
// move leaves, how the hand ended (shard-N.labels, as Neural Cat's), and the table's
// hidden-tile labels (shard-N.aux, no rules' hand); and at job.optionShare of them, the
// learner's top job.options moves by share (or every claim move), each played on
// job.optionReplays times (shard-N.options, shard-N.optlabels, as generate-nc).
int runGenerateLcv(const NcGenerateJob& job, const AgentFactory& make);

}  // namespace lcm
