// Array.prototype.sort as node's V8 does it:
// TimSort, which for fewer than 64 elements is one run (the first ascending
// or strictly descending stretch, reversed if descending) extended by binary
// insertion. The foundation's discard comparators aren't always consistent
// (a < b, b < c, c < a can all hold), so only the same algorithm, calling the
// comparator on the same pairs in the same order, gives the same order.
#pragma once
#include <vector>
#include <stdexcept>
#include <cmath>
#include <algorithm>

namespace lcm { namespace js {

// cmp(a, b) returns the comparator's number: < 0 puts a first. NaN counts as 0.
template <class T, class Cmp> void sort(std::vector<T>& v, Cmp cmp) {
  const int n = int(v.size());
  if (n < 2) return;
  if (n >= 64) throw std::runtime_error("js::sort: only arrays under 64 elements are ported");
  auto compare = [&](const T& a, const T& b) -> double {
    double r = double(cmp(a, b));
    return std::isnan(r) ? 0.0 : r;
  };
  // Measured against node's V8 (60,000 random inconsistent comparators, 0
  // mismatches): under 8 elements it is binary insertion from the second
  // element, with no run counted; from 8, the first run, then binary insertion.
  int runLength = 1;
  if (n >= 8) {
    runLength = 2;
    double order = compare(v[1], v[0]);
    bool descending = order < 0;
    for (int idx = 2; idx < n; idx++) {
      order = compare(v[idx], v[idx - 1]);
      if (descending) { if (order >= 0) break; }
      else { if (order < 0) break; }
      runLength++;
    }
    if (descending) std::reverse(v.begin(), v.begin() + runLength);
  }
  // BinaryInsertionSort(0, runLength, n)
  for (int start = runLength; start < n; start++) {
    int left = 0, right = start;
    T pivot = v[start];
    while (left < right) {
      int mid = left + ((right - left) >> 1);
      double order = compare(pivot, v[mid]);
      if (order < 0) right = mid; else left = mid + 1;
    }
    for (int p = start; p > left; p--) v[p] = v[p - 1];
    v[left] = pivot;
  }
}

}}  // namespace lcm::js
