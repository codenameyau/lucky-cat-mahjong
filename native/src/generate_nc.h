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
};

int runGenerateNc(const NcGenerateJob& job, const AgentFactory& make);

}  // namespace lcm
