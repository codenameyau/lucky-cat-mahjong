# The native simulator. make (or npm run native:build) builds both:
#   build/lcm-sim        fast: what training, screens and judgments run. Float
#                        math is free to use SIMD and fused multiply-adds, so a
#                        decision between two moves tied to the last bit can go
#                        the other way (statistically the same play).
#   build/lcm-sim-exact  bit-exact with the JS (LCM_EXACT): no fused multiply-
#                        adds, V8's fdlibm, float32 stores where the JS has them.
#                        scripts/ml/native.js parity diffs it against the JS,
#                        action by action: the bug detector.
# make predefines CXX as g++, so ?= alone never applies: the exact build needs clang.
ifeq ($(origin CXX),default)
CXX := clang++
endif
SRC := $(wildcard src/*.cpp)
HDR := $(wildcard src/*.h src/*.inc)
# -mcpu=native is the Apple Silicon spelling; x86-64 takes -march=native.
ARCH_FLAG := $(if $(filter x86_64 amd64 AMD64,$(shell uname -m)),-march=native,-mcpu=native)
# Windows (llvm-mingw's clang): link the C++ runtime in, so the builds run
# without its DLLs on the PATH.
LINK_FLAGS := $(if $(filter Windows_NT,$(OS)),-static,)
FAST_FLAGS ?= -O3 -std=c++17 $(ARCH_FLAG) -flto -ffp-contract=fast -fno-math-errno -fno-trapping-math -Wall -Wno-sign-compare
EXACT_FLAGS ?= -O3 -std=c++17 -ffp-contract=off -fno-fast-math -DLCM_EXACT -Wall -Wno-sign-compare
OUT ?= build

all: $(OUT)/lcm-sim $(OUT)/lcm-sim-exact

$(OUT)/lcm-sim: $(patsubst src/%.cpp,$(OUT)/fast/%.o,$(SRC))
	$(CXX) $(FAST_FLAGS) $(LINK_FLAGS) -o $@ $^

$(OUT)/lcm-sim-exact: $(patsubst src/%.cpp,$(OUT)/exact/%.o,$(SRC))
	$(CXX) $(EXACT_FLAGS) $(LINK_FLAGS) -o $@ $^

$(OUT)/fast/%.o: src/%.cpp $(HDR)
	@mkdir -p $(OUT)/fast
	$(CXX) $(FAST_FLAGS) -c -o $@ $<

$(OUT)/exact/%.o: src/%.cpp $(HDR)
	@mkdir -p $(OUT)/exact
	$(CXX) $(EXACT_FLAGS) -c -o $@ $<

# Profile-guided: build an instrumented copy, play a representative workload
# (the benchmark table, and a round's data with the oracle), then rebuild the
# fast build laid out for what it actually runs.
PGO_WORKLOAD ?= ./pgo-workload.sh
PROFDATA ?= $(if $(filter Darwin,$(shell uname -s)),xcrun llvm-profdata,llvm-profdata)
pgo:
	$(MAKE) OUT=$(OUT)/pgo-gen FAST_FLAGS="$(FAST_FLAGS) -fprofile-instr-generate" $(OUT)/pgo-gen/lcm-sim
	rm -f $(OUT)/pgo/*.profraw; mkdir -p $(OUT)/pgo
	LLVM_PROFILE_FILE=$(abspath $(OUT))/pgo/%p.profraw $(PGO_WORKLOAD) $(abspath $(OUT))/pgo-gen/lcm-sim
	$(PROFDATA) merge -o $(OUT)/pgo/lcm.profdata $(OUT)/pgo/*.profraw
	rm -rf $(OUT)/fast $(OUT)/lcm-sim
	$(MAKE) FAST_FLAGS="$(FAST_FLAGS) -fprofile-instr-use=$(abspath $(OUT))/pgo/lcm.profdata -Wno-profile-instr-out-of-date -Wno-profile-instr-unprofiled" $(OUT)/lcm-sim

clean:
	rm -rf $(OUT)

.PHONY: all clean pgo
