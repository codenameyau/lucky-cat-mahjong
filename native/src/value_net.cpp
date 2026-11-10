#include "value_net.h"
#include "bot.h"
#include "jsmath.h"
#include <algorithm>
#include <cstring>
#include <stdexcept>

namespace lcm {

ValueNet::ValueNet(std::shared_ptr<Mlp> model, int size) : model_(std::move(model)), size_(size) {
  const Weights& w = model_->weights();
  const Json& play = w.meta["play"];
  topK_ = int(play["topK"].num(4));
  winBonus_ = play["winBonus"].num(300);
  if (!w.reader.empty()) {
    if (w.readerVersion != 1) throw std::runtime_error("value: the model reads version " + std::to_string(w.readerVersion) + " of the reader, have 1");
    Weights r;
    r.featureVersion = w.featureVersion; r.featureSize = w.featureSize; r.layers = w.reader;
    reader_.reset(new Mlp(r));
  }
  int want = size_ + (reader_ ? READ_SIZE : 0);
  if (w.featureSize != size_ || model_->inputs() != want || model_->outputs() < 28)
    throw std::runtime_error("value: the model reads " + std::to_string(model_->inputs()) + " inputs, not " + std::to_string(want));
  buf_.resize(size_t(size_ + READ_SIZE));
}

ValueRead ValueNet::ev(const float* x) const {
  const float* in = x;
  if (reader_) {
    // js/mahjong-ml-model.js readFeatures (read version 1).
    const std::vector<double>& r = reader_->forward(x);
    std::memcpy(buf_.data(), x, sizeof(float) * size_t(size_));
    const int R_WIN = 28, R_READY = 52, R_DEAL = 55;
    float* b = buf_.data() + size_;
    for (int k = 0; k < 3; k++) b[k] = float(1 / (1 + js::exp(-r[R_READY + k])));
    b[3] = float(1 / (1 + js::exp(-r[R_DEAL])));
    double m = -DINF, e[12], sum = 0;
    for (int i = 0; i < 12; i++) m = std::max(m, r[R_WIN + i]);
    for (int i = 0; i < 12; i++) { e[i] = js::exp(r[R_WIN + i] - m); sum += e[i]; }
    for (int i = 0; i < 12; i++) b[4 + i] = float(e[i] / sum);
    in = buf_.data();
  }
  const std::vector<double>& raw = model_->forward(in);
  auto softmax = [&](int from, int n, double* out) {
    double m = -DINF;
    for (int i = 0; i < n; i++) m = std::max(m, raw[from + i]);
    double sum = 0;
    for (int i = 0; i < n; i++) { out[i] = js::exp(raw[from + i] - m); sum += out[i]; }
    for (int i = 0; i < n; i++) out[i] /= sum;
  };
  double o[6], winF[11], payF[11];
  softmax(0, 6, o);
  softmax(6, 11, winF);
  softmax(17, 11, payF);
  double winPts = 0, payPts = 0;
  for (int i = 0; i < 11; i++) {
    double pts = 8 * js::pow(2, std::min(3 + i, 13) - 3);
    winPts += winF[i] * pts;
    payPts += payF[i] * pts;
  }
  ValueRead v;
  v.ev = o[0] * 3 * winPts + o[1] * winPts - (o[2] + o[3]) * payPts;
  v.pWin = o[0] + o[1];
  return v;
}

}  // namespace lcm
