// lcm-sim generate-nc: scripts/ml/generate.js's worker natively, for Neural Cat
// and the frontier model: the same deals, the same random draws, the same rows,
// the same shard files byte for byte (scripts/ml/generate.js --native checks it
// with `parity`). Records the learner's own seats (--record <learner>).
#pragma once
#include "generate.h"

namespace lcm {

struct NcGenerateJob {
  std::string weights;            // the learner's .lcmw
  double temperature = 100, epsilon = 0.05, sample = 0.3;
  uint32_t seed = 1;              // the worker's first deal seed
  long deals = 0;
  int shard = 0, strategy = 0;    // the learner's index in the manifest's strategies
  std::vector<std::string> pool;  // native ids; "learner" is the exploring copy
  std::string out;
  // Replayed labels (the frontier plan, step 5): this share of the recorded
  // discards is played on `replays` times after the hand, with the tiles the
  // seat can't see (the others' hands and the wall) shuffled each time. The
  // counts go in shard-N.replay; the rows themselves are unchanged.
  int replays = 0;
  double replayShare = 0;
};

int runGenerateNc(const NcGenerateJob& job, const AgentFactory& make);

}  // namespace lcm
