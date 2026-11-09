# The native simulator. make (or npm run native:build) builds both:
#   build/lcm-sim        fast: what training, screens and judgments run. Float
#                        math is free to use SIMD and fused multiply-adds, so a
#                        decision between two moves tied to the last bit can go
#                        the other way (statistically the same play).
#   build/lcm-sim-exact  bit-exact with the JS (LCM_EXACT): no fused multiply-
#                        adds, V8's fdlibm, float32 stores where the JS has them.
#                        scripts/ml/native.js parity diffs it against the JS,
#                        action by action: the bug detector.
CXX ?= clang++
SRC := $(wildcard src/*.cpp)
HDR := $(wildcard src/*.h src/*.inc)
FAST_FLAGS ?= -O3 -std=c++17 -mcpu=native -flto -ffp-contract=fast -fno-math-errno -fno-trapping-math -Wall -Wno-sign-compare
EXACT_FLAGS ?= -O3 -std=c++17 -ffp-contract=off -fno-fast-math -DLCM_EXACT -Wall -Wno-sign-compare
OUT ?= build

all: $(OUT)/lcm-sim $(OUT)/lcm-sim-exact

$(OUT)/lcm-sim: $(patsubst src/%.cpp,$(OUT)/fast/%.o,$(SRC))
	$(CXX) $(FAST_FLAGS) -o $@ $^

$(OUT)/lcm-sim-exact: $(patsubst src/%.cpp,$(OUT)/exact/%.o,$(SRC))
	$(CXX) $(EXACT_FLAGS) -o $@ $^

$(OUT)/fast/%.o: src/%.cpp $(HDR)
	@mkdir -p $(OUT)/fast
	$(CXX) $(FAST_FLAGS) -c -o $@ $<

$(OUT)/exact/%.o: src/%.cpp $(HDR)
	@mkdir -p $(OUT)/exact
	$(CXX) $(EXACT_FLAGS) -c -o $@ $<

clean:
	rm -rf $(OUT)

.PHONY: all clean
