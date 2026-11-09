#include "model.h"
#include <cstdio>
#include <cstring>
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
  for (auto& l : h["layers"].a) {
    Layer L;
    L.rows = int(l["rows"].num(0));
    L.cols = int(l["cols"].num(0));
    L.w.resize(size_t(L.rows) * L.cols);
    L.b.resize(L.rows);
    std::memcpy(L.w.data(), buf.data() + at, 4 * L.w.size()); at += 4 * L.w.size();
    std::memcpy(L.b.data(), buf.data() + at, 4 * L.b.size()); at += 4 * L.b.size();
    w.layers.push_back(std::move(L));
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
  out_.assign(outputs_, 0);
  cache_.resize(size_t(1) << CACHE_BITS);
}

const std::vector<double>& Mlp::forward(const float* x) const {
  uint64_t h = 0x9E3779B97F4A7C15ull;
  const uint32_t* bits = reinterpret_cast<const uint32_t*>(x);
  for (int i = 0; i < inputs_; i++) h = (h ^ bits[i]) * 0x100000001B3ull + (h >> 27);
  h |= 1;
  CacheEntry& e = cache_[(h * 0xBF58476D1CE4E5B9ull) >> (64 - CACHE_BITS)];
  if (e.hash == h && std::memcmp(e.x.data(), x, sizeof(float) * inputs_) == 0) return e.out;
  const std::vector<double>& out = compute(x);
  e.hash = h;
  e.x.assign(x, x + inputs_);
  e.out = out;
  return e.out;
}

const std::vector<double>& Mlp::compute(const float* x) const {
  const Layer& first = w_.layers[0];
  const int rows = first.rows;
  float* out = bufA_.data();
  for (int r = 0; r < rows; r++) out[r] = first.b[r];
  for (int c = 0; c < first.cols; c++) {
    double v = x[c];
    if (v == 0) continue;
    const float* col = firstT_.data() + size_t(c) * rows;
    // JS: out[r] += firstT[...] * v, the sum in double, the store in float32.
    for (int r = 0; r < rows; r++) out[r] = float(double(out[r]) + double(col[r]) * v);
  }
  if (w_.layers.size() > 1) for (int r = 0; r < rows; r++) if (out[r] < 0) out[r] = 0;
  const float* input = out;
  for (size_t k = 1; k < w_.layers.size(); k++) {
    const Layer& l = w_.layers[k];
    float* o = k % 2 ? bufB_.data() : bufA_.data();
    bool last = k == w_.layers.size() - 1;
    // Each row's sum in the JS's order (b, then column 0, 1, ...), all rows at once.
    double* s = acc_.data();
    for (int r = 0; r < l.rows; r++) s[r] = l.b[r];
    for (int c = 0; c < l.cols; c++) {
      double in = input[c];
      const float* col = wT_[k].data() + size_t(c) * l.rows;
      for (int r = 0; r < l.rows; r++) s[r] = s[r] + double(col[r]) * in;
    }
    for (int r = 0; r < l.rows; r++) o[r] = float(last || s[r] > 0 ? s[r] : 0);
    input = o;
  }
  for (int r = 0; r < outputs_; r++) out_[r] = input[r];
  return out_;
}

}  // namespace lcm
