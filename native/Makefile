# The native simulator (lcm-sim). make, or npm run native:build.
# -ffp-contract=off: no fused multiply-adds, so every float sum rounds as the JS's does.
CXX ?= clang++
CXXFLAGS ?= -O3 -std=c++17 -ffp-contract=off -fno-fast-math -Wall -Wno-sign-compare
SRC := $(wildcard src/*.cpp)
OBJ := $(patsubst src/%.cpp,build/%.o,$(SRC))

build/lcm-sim: $(OBJ)
	$(CXX) $(CXXFLAGS) -o $@ $(OBJ)

build/%.o: src/%.cpp $(wildcard src/*.h)
	@mkdir -p build
	$(CXX) $(CXXFLAGS) -c -o $@ $<

clean:
	rm -rf build

.PHONY: clean
