// Math as V8 does it (fdlibm built the way node's V8 is: clang, multiply-adds fused), so every float the bots compute is the JS's to the bit.
// Math.pow: the C library's pow gives V8's results (checked on a million
// inputs). Math.exp and Math.log: V8 uses fdlibm's (src/base/ieee754.cc),
// which differ from the C library's in the last bit, so they are ported here.
#pragma once
#include <cstdint>
#include <cstring>
#include <cmath>
#include <limits>

namespace lcm { namespace js {

inline uint32_t hiWord(double x) { uint64_t b; std::memcpy(&b, &x, 8); return uint32_t(b >> 32); }
inline uint32_t loWord(double x) { uint64_t b; std::memcpy(&b, &x, 8); return uint32_t(b); }
inline double fromWords(uint32_t hi, uint32_t lo) { uint64_t b = (uint64_t(hi) << 32) | lo; double x; std::memcpy(&x, &b, 8); return x; }
inline double setHigh(double x, uint32_t hi) { return fromWords(hi, loWord(x)); }

inline double exp(double x) {
#pragma clang fp contract(on)
  static const double one = 1.0, halF[2] = {0.5, -0.5}, o_threshold = 7.09782712893383973096e+02,
      u_threshold = -7.45133219101941108420e+02, ln2HI[2] = {6.93147180369123816490e-01, -6.93147180369123816490e-01},
      ln2LO[2] = {1.90821492927058770002e-10, -1.90821492927058770002e-10}, invln2 = 1.44269504088896338700e+00,
      P1 = 1.66666666666666019037e-01, P2 = -2.77777777770155933842e-03, P3 = 6.61375632143793436117e-05,
      P4 = -1.65339022054652515390e-06, P5 = 4.13813679705723846039e-08, E = 2.718281828459045;
  static volatile double huge = 1.0e+300, twom1000 = 9.33263618503218878990e-302, two1023 = 8.988465674311579539e307;
  double y, hi = 0.0, lo = 0.0, c, t, twopk;
  int32_t k = 0, xsb;
  uint32_t hx = hiWord(x);
  xsb = (hx >> 31) & 1;
  hx &= 0x7fffffff;
  if (hx >= 0x40862E42) {
    if (hx >= 0x7ff00000) {
      uint32_t lx = loWord(x);
      if (((hx & 0xfffff) | lx) != 0) return x + x;
      return (xsb == 0) ? x : 0.0;
    }
    if (x > o_threshold) return huge * huge;
    if (x < u_threshold) return twom1000 * twom1000;
  }
  if (hx > 0x3fd62e42) {
    if (hx < 0x3FF0A2B2) {
      if (x == 1.0) return E;
      hi = x - ln2HI[xsb];
      lo = ln2LO[xsb];
      k = 1 - xsb - xsb;
    } else {
      k = static_cast<int>(invln2 * x + halF[xsb]);
      t = k;
      hi = x - t * ln2HI[0];
      lo = t * ln2LO[0];
    }
    x = hi - lo;
  } else if (hx < 0x3e300000) {
    if (huge + x > one) return one + x;
  } else {
    k = 0;
  }
  t = x * x;
  if (k >= -1021) twopk = fromWords(uint32_t(0x3ff00000 + (k << 20)), 0);
  else twopk = fromWords(uint32_t(0x3ff00000 + ((k + 1000) << 20)), 0);
  c = x - t * (P1 + t * (P2 + t * (P3 + t * (P4 + t * P5))));
  if (k == 0) return one - ((x * c) / (c - 2.0) - x);
  y = one - ((lo - (x * c) / (2.0 - c)) - hi);
  if (k >= -1021) {
    if (k == 1024) return y * 2.0 * two1023;
    return y * twopk;
  }
  return y * twopk * twom1000;
}

inline double log(double x) {
#pragma clang fp contract(on)
  static const double ln2_hi = 6.93147180369123816490e-01, ln2_lo = 1.90821492927058770002e-10,
      two54 = 1.80143985094819840000e+16, Lg1 = 6.666666666666735130e-01, Lg2 = 3.999999999940941908e-01,
      Lg3 = 2.857142874366239149e-01, Lg4 = 2.222219843214978396e-01, Lg5 = 1.818357216161805012e-01,
      Lg6 = 1.531383769920937332e-01, Lg7 = 1.479819860511658591e-01;
  static const double zero = 0.0;
  static volatile double vzero = 0.0;
  double hfsq, f, s, z, R, w, t1, t2, dk;
  int32_t k, hx, i, j;
  uint32_t lx;
  hx = int32_t(hiWord(x));
  lx = loWord(x);
  k = 0;
  if (hx < 0x00100000) {
    if (((hx & 0x7fffffff) | lx) == 0) return -two54 / vzero;
    if (hx < 0) return (x - x) / zero;
    k -= 54;
    x *= two54;
    hx = int32_t(hiWord(x));
  }
  if (hx >= 0x7ff00000) return x + x;
  k += (hx >> 20) - 1023;
  hx &= 0x000fffff;
  i = (hx + 0x95f64) & 0x100000;
  x = setHigh(x, uint32_t(hx | (i ^ 0x3ff00000)));
  k += (i >> 20);
  f = x - 1.0;
  if ((0x000fffff & (2 + hx)) < 3) {
    if (f == zero) {
      if (k == 0) return zero;
      dk = static_cast<double>(k);
      return dk * ln2_hi + dk * ln2_lo;
    }
    R = f * f * (0.5 - 0.33333333333333333 * f);
    if (k == 0) return f - R;
    dk = static_cast<double>(k);
    return dk * ln2_hi - ((R - dk * ln2_lo) - f);
  }
  s = f / (2.0 + f);
  dk = static_cast<double>(k);
  z = s * s;
  i = hx - 0x6147a;
  w = z * z;
  j = 0x6b851 - hx;
  t1 = w * (Lg2 + w * (Lg4 + w * Lg6));
  t2 = z * (Lg1 + w * (Lg3 + w * (Lg5 + w * Lg7)));
  i |= j;
  R = t2 + t1;
  if (i > 0) {
    hfsq = 0.5 * f * f;
    if (k == 0) return f - (hfsq - s * (hfsq + R));
    return dk * ln2_hi - ((hfsq - (s * (hfsq + R) + dk * ln2_lo)) - f);
  }
  if (k == 0) return f - s * (f - R);
  return dk * ln2_hi - ((s * (f - R) - dk * ln2_lo) - f);
}

inline double pow(double x, double y) { return std::pow(x, y); }

// JS Math.round: the nearest integer, halves up.
inline double round(double x) { return std::floor(x + 0.5); }

}}  // namespace lcm::js
