#pragma once
#include "engine.h"
#include "lucky_cat.h"
#include <functional>
#include <map>
#include <memory>
#include <string>

namespace lcm {

struct GenerateJob {
  std::string weights;  // the learner's .lcmw
  double temperature = 1;
  uint32_t seed = 7000000;
  std::vector<std::string> pool;  // native ids
  int learners = 2;
  bool returns = false, oracle = false, write = false;
  double sample = 1, sampleWon = -1;  // -1: unset
  long from = 0, to = 0;
  int shard = 0;
  std::string out;
};

struct GenerateStats {
  long deals = 0, learnerSeats = 0, learnerWins = 0, wins = 0, winDiscards = 0, winFaan = 0, dealIns = 0, samples = 0, negatives = 0;
  double learnerPoints = 0, learnerWinPoints = 0;
  std::map<std::string, std::pair<long, long>> byOpponent;  // id -> seats, wins
};

using AgentFactory = std::function<std::unique_ptr<Agent>(const std::string&)>;
int runGenerate(const GenerateJob& job, const AgentFactory& make);

}  // namespace lcm
