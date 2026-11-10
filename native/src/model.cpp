#include "model.h"
#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <stdexcept>

namespace lcm {

static const Json NULL_JSON;
const Json& Json::operator[](const std::string& k) const {
  if (kind != OBJ) return NULL_JSON;
  auto it = o.find(k);
  return it == o.end() ? NULL_JSON : it->second;
}

namespace {
struct Parser {
  const std::string& t;
  size_t i = 0;
  explicit Parser(const std::string& text) : t(text) {}
  void ws() { while (i < t.size() && (t[i] == ' ' || t[i] == '\n' || t[i] == '\r' || t[i] == '\t')) i++; }
  Json value() {
    ws();
    if (i >= t.size()) throw std::runtime_error("json: unexpected end");
    char c = t[i];
    Json v;
    if (c == '{') {
      v.kind = Json::OBJ; i++; ws();
      if (t[i] == '}') { i++; return v; }
      for (;;) {
        ws();
        std::string k = str();
        ws(); if (t[i] != ':') throw std::runtime_error("json: expected :"); i++;
        v.o[k] = value();
        ws();
        if (t[i] == ',') { i++; continue; }
        if (t[i] == '}') { i++; return v; }
        throw std::runtime_error("json: expected , or }");
      }
    }
    if (c == '[') {
      v.kind = Json::ARR; i++; ws();
      if (t[i] == ']') { i++; return v; }
      for (;;) {
        v.a.push_back(value());
        ws();
        if (t[i] == ',') { i++; continue; }
        if (t[i] == ']') { i++; return v; }
        throw std::runtime_error("json: expected , or ]");
      }
    }
    if (c == '"') { v.kind = Json::STR; v.s = str(); return v; }
    if (t.compare(i, 4, "true") == 0) { i += 4; v.kind = Json::BOOL; v.b = true; return v; }
    if (t.compare(i, 5, "false") == 0) { i += 5; v.kind = Json::BOOL; return v; }
    if (t.compare(i, 4, "null") == 0) { i += 4; return v; }
    size_t end;
    v.n = std::stod(t.substr(i, 40), &end);
    v.kind = Json::NUM;
    i += end;
    return v;
  }
  std::string str() {
    if (t[i] != '"') throw std::runtime_error("json: expected string");
    i++;
    std::string s;
    while (t[i] != '"') {
      if (t[i] == '\\') { i++; char e = t[i]; s += e == 'n' ? '\n' : e == 't' ? '\t' : e; if (e == 'u') i += 4; i++; continue; }
      s += t[i++];
    }
    i++;
    return s;
  }
};
}  // namespace

Json parseJson(const std::string& text) { Parser p(text); return p.value(); }

Weights loadWeights(const std::string& file) {
  FILE* f = std::fopen(file.c_str(), "rb");
  if (!f) throw std::runtime_error("weights: can't read " + file + " (make it with scripts/ml/weights.js export)");
  std::vector<char> buf;
  char chunk[1 << 16];
  size_t n;
  while ((n = std::fread(chunk, 1, sizeof chunk, f)) > 0) buf.insert(buf.end(), chunk, chunk + n);
  std::fclose(f);
  if (buf.size() < 12 || std::memcmp(buf.data(), "LCMW", 4) != 0) throw std::runtime_error("weights: " + file + " is not an .lcmw file");
  uint32_t hlen;
  std::memcpy(&hlen, buf.data() + 8, 4);
  Json h = parseJson(std::string(buf.data() + 12, hlen));
  Weights w;
  w.featureVersion = int(h["featureVersion"].num(0));
  w.featureSize = int(h["featureSize"].num(0));
  w.meta = h["meta"];
  size_t at = 12 + hlen;
  auto read = [&](const Json& dims, std::vector<Layer>& out) {
    for (auto& l : dims.a) {
      Layer L;
      L.rows = int(l["rows"].num(0));
      L.cols = int(l["cols"].num(0));
      L.w.resize(size_t(L.rows) * L.cols);
      L.b.resize(L.rows);
      if (at + 4 * (L.w.size() + L.b.size()) > buf.size()) throw std::runtime_error("weights: " + file + " is too short");
      std::memcpy(L.w.data(), buf.data() + at, 4 * L.w.size()); at += 4 * L.w.size();
      std::memcpy(L.b.data(), buf.data() + at, 4 * L.b.size()); at += 4 * L.b.size();
      out.push_back(std::move(L));
    }
  };
  read(h["layers"], w.layers);
  // Version 2: a stacked model's reader follows the move network.
  if (h.has("reader")) {
    w.readerVersion = int(h["readerVersion"].num(0));
    read(h["reader"]["layers"], w.reader);
  }
  if (at != buf.size()) throw std::runtime_error("weights: " + file + " has the wrong size");
  return w;
}

Mlp::Mlp(const Weights& w) : w_(w) {
  const Layer& first = w_.layers[0];
  inputs_ = first.cols;
  outputs_ = w_.layers.back().rows;
  widest_ = 0;
  for (auto& l : w_.layers) widest_ = std::max(widest_, l.rows);
  firstT_.resize(size_t(first.rows) * first.cols);
  for (int r = 0; r < first.rows; r++)
    for (int c = 0; c < first.cols; c++) firstT_[size_t(c) * first.rows + r] = first.w[size_t(r) * first.cols + c];
  wT_.resize(w_.layers.size());
  for (size_t k = 1; k < w_.layers.size(); k++) {
    const Layer& l = w_.layers[k];
    wT_[k].resize(size_t(l.rows) * l.cols);
    for (int r = 0; r < l.rows; r++)
      for (int c = 0; c < l.cols; c++) wT_[k][size_t(c) * l.rows + r] = l.w[size_t(r) * l.cols + c];
  }
  bufA_.assign(widest_, 0);
  bufB_.assign(widest_, 0);
  acc_.assign(widest_, 0);
  facc_.assign(widest_, 0);
  out_.assign(outputs_, 0);
}

const std::vector<double>& Mlp::forward(const float* x) const {
  const Layer& first = w_.layers[0];
  const int rows = first.rows;
  float* out = bufA_.data();
#ifdef LCM_EXACT
  for (int r = 0; r < rows; r++) out[r] = first.b[r];
  for (int c = 0; c < first.cols; c++) {
    if (x[c] == 0) continue;
    const float* col = firstT_.data() + size_t(c) * rows;
    // JS: out[r] += firstT[...] * v, the sum in double, the store in float32.
    double v = x[c];
    for (int r = 0; r < rows; r++) out[r] = float(double(out[r]) + double(col[r]) * v);
  }
#else
  int nnz = 0, changed = 0;
  bool have = !lastX_.empty() && sinceFull_ < 32;
  for (int c = 0; c < first.cols; c++) { nnz += x[c] != 0; if (have) changed += x[c] != lastX_[c]; }
  float* pre = lastPre_.data();
  if (have && changed * 2 < nnz) {
    // The previous answer, plus the columns that changed.
    for (int c = 0; c < first.cols; c++) {
      float d = x[c] - lastX_[c];
      if (d == 0) continue;
      const float* col = firstT_.data() + size_t(c) * rows;
      for (int r = 0; r < rows; r++) pre[r] += col[r] * d;
    }
    sinceFull_++;
  } else {
    lastX_.resize(first.cols);
    lastPre_.resize(rows);
    pre = lastPre_.data();
    for (int r = 0; r < rows; r++) pre[r] = first.b[r];
    for (int c = 0; c < first.cols; c++) {
      const float v = x[c];
      if (v == 0) continue;
      const float* col = firstT_.data() + size_t(c) * rows;
      for (int r = 0; r < rows; r++) pre[r] += col[r] * v;
    }
    sinceFull_ = 0;
  }
  std::memcpy(lastX_.data(), x, sizeof(float) * first.cols);
  std::memcpy(out, pre, sizeof(float) * rows);
#endif
  if (w_.layers.size() > 1) for (int r = 0; r < rows; r++) if (out[r] < 0) out[r] = 0;
  const float* input = out;
  for (size_t k = 1; k < w_.layers.size(); k++) {
    const Layer& l = w_.layers[k];
    float* o = k % 2 ? bufB_.data() : bufA_.data();
    bool last = k == w_.layers.size() - 1;
    // All rows at once, column by column; a zero input (half of them after
    // ReLU) adds nothing, in either mode, so it's skipped.
#ifdef LCM_EXACT
    double* s = acc_.data();
    for (int r = 0; r < l.rows; r++) s[r] = l.b[r];
    for (int c = 0; c < l.cols; c++) {
      if (input[c] == 0) continue;
      double in = input[c];
      const float* col = wT_[k].data() + size_t(c) * l.rows;
      for (int r = 0; r < l.rows; r++) s[r] = s[r] + double(col[r]) * in;
    }
    for (int r = 0; r < l.rows; r++) o[r] = float(last || s[r] > 0 ? s[r] : 0);
#else
    float* s = facc_.data();
    for (int r = 0; r < l.rows; r++) s[r] = l.b[r];
    for (int c = 0; c < l.cols; c++) {
      const float in = input[c];
      if (in == 0) continue;
      const float* col = wT_[k].data() + size_t(c) * l.rows;
      for (int r = 0; r < l.rows; r++) s[r] += col[r] * in;
    }
    for (int r = 0; r < l.rows; r++) o[r] = last || s[r] > 0 ? s[r] : 0;
#endif
    input = o;
  }
  for (int r = 0; r < outputs_; r++) out_[r] = input[r];
  return out_;
}

void Mlp::forwardBatch(const float* const* xs, int n, std::vector<double>* outs) const {
#ifdef LCM_EXACT
  for (int k = 0; k < n; k++) outs[k] = forward(xs[k]);
#else
  const Layer& first = w_.layers[0];
  const int rows = first.rows;
  if (w_.layers.size() < 2) { for (int k = 0; k < n; k++) outs[k] = forward(xs[k]); return; }
  // The first layer for each (incremental against the one before), then the
  // later layers for all n together: s[k][r] += col[r] * in[k][c].
  batchIn_.resize(size_t(n) * widest_);
  for (int k = 0; k < n; k++) {
    // forward() leaves the first layer's activation in bufA_; run just that part.
    float* dst = batchIn_.data() + size_t(k) * widest_;
    const float* x = xs[k];
    int nnz = 0, changed = 0;
    bool have = !lastX_.empty() && sinceFull_ < 32;
    for (int c = 0; c < first.cols; c++) { nnz += x[c] != 0; if (have) changed += x[c] != lastX_[c]; }
    float* pre;
    if (have && changed * 2 < nnz) {
      pre = lastPre_.data();
      for (int c = 0; c < first.cols; c++) {
        float d = x[c] - lastX_[c];
        if (d == 0) continue;
        const float* col = firstT_.data() + size_t(c) * rows;
        for (int r = 0; r < rows; r++) pre[r] += col[r] * d;
      }
      sinceFull_++;
    } else {
      lastX_.resize(first.cols);
      lastPre_.resize(rows);
      pre = lastPre_.data();
      for (int r = 0; r < rows; r++) pre[r] = first.b[r];
      for (int c = 0; c < first.cols; c++) {
        const float v = x[c];
        if (v == 0) continue;
        const float* col = firstT_.data() + size_t(c) * rows;
        for (int r = 0; r < rows; r++) pre[r] += col[r] * v;
      }
      sinceFull_ = 0;
    }
    std::memcpy(lastX_.data(), x, sizeof(float) * first.cols);
    for (int r = 0; r < rows; r++) dst[r] = pre[r] > 0 ? pre[r] : 0;
  }
  int inRows = rows;
  for (size_t L = 1; L < w_.layers.size(); L++) {
    const Layer& l = w_.layers[L];
    bool last = L == w_.layers.size() - 1;
    batchAcc_.resize(size_t(n) * widest_);
    for (int k = 0; k < n; k++) {
      float* s = batchAcc_.data() + size_t(k) * widest_;
      for (int r = 0; r < l.rows; r++) s[r] = l.b[r];
    }
    for (int c = 0; c < l.cols; c++) {
      const float* col = wT_[L].data() + size_t(c) * l.rows;
      for (int k = 0; k < n; k++) {
        const float in = batchIn_[size_t(k) * widest_ + c];
        if (in == 0) continue;
        float* s = batchAcc_.data() + size_t(k) * widest_;
        for (int r = 0; r < l.rows; r++) s[r] += col[r] * in;
      }
    }
    for (int k = 0; k < n; k++) {
      float* s = batchAcc_.data() + size_t(k) * widest_;
      float* d = batchIn_.data() + size_t(k) * widest_;
      for (int r = 0; r < l.rows; r++) d[r] = last || s[r] > 0 ? s[r] : 0;
    }
    inRows = l.rows;
  }
  for (int k = 0; k < n; k++) {
    outs[k].resize(outputs_);
    const float* d = batchIn_.data() + size_t(k) * widest_;
    for (int r = 0; r < outputs_; r++) outs[k][r] = d[r];
  }
  (void)inRows;
#endif
}

}  // namespace lcm
