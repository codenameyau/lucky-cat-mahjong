// Model weights (.lcmw, written by scripts/ml/weights.js) and the forward
// pass the JS models use: float32 buffers (each store rounds to float32),
// sums in double, the first layer by input so zero features cost nothing.
#pragma once
#include <cstdint>
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace lcm {

// A small JSON value, for the weights' header.
struct Json {
  enum Kind { NUL, BOOL, NUM, STR, ARR, OBJ } kind = NUL;
  bool b = false;
  double n = 0;
  std::string s;
  std::vector<Json> a;
  std::map<std::string, Json> o;
  const Json& operator[](const std::string& k) const;
  bool has(const std::string& k) const { return kind == OBJ && o.count(k); }
  double num(double dflt) const { return kind == NUM ? n : dflt; }
};
Json parseJson(const std::string& text);

struct Layer { int rows, cols; std::vector<float> w, b; };

struct Weights {
  int featureVersion = 0, featureSize = 0;
  Json meta;
  std::vector<Layer> layers;
};
Weights loadWeights(const std::string& file);

class Mlp {
 public:
  explicit Mlp(const Weights& w);
  // The raw outputs for one feature vector (float32 values, widened).
  const std::vector<double>& forward(const float* x) const;
  int outputs() const { return outputs_; }
  int inputs() const { return inputs_; }
  const Weights& weights() const { return w_; }

 private:
  Weights w_;
  std::vector<float> firstT_;            // the first layer, by input
  std::vector<std::vector<float>> wT_;   // later layers, by input (so a row's sum keeps its order)
  int outputs_, inputs_, widest_;
  mutable std::vector<float> bufA_, bufB_;
  mutable std::vector<double> acc_, out_;
  // Answers already worked out, keyed by the exact input: the same input
  // gives the same output, so a hit is the forward pass itself. (A compare
  // plays every deal once per model: the table's players see the same
  // positions until the two models first differ.)
  static const int CACHE_BITS = 12;
  struct CacheEntry { uint64_t hash = 0; std::vector<float> x; std::vector<double> out; };
  mutable std::vector<CacheEntry> cache_;
  const std::vector<double>& compute(const float* x) const;
};

}  // namespace lcm
