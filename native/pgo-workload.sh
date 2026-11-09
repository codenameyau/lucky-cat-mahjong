#!/bin/sh
# The workload make pgo trains the layout on: the benchmark table and a
# round's data, from the models the simulator has already converted.
set -e
SIM="$1"
DIR="$(cd "$(dirname "$0")" && pwd)"
NC="nc:$DIR/build/neural-cat.lcmw"
LC=$(ls -S "$DIR"/build/cache/*.lcmw | head -1)
"$SIM" speed --agents "lc:$LC,$NC,jorge-yau,$NC" --deals 300 --seed 917000000
"$SIM" generate --weights "$LC" --seed 918000000 --from 0 --to 200 --learners 1 --pool "$NC,jorge-yau,$NC" --returns --oracle --sample 0.5 > /dev/null
"$SIM" speed --agents jorge-yau,jorge-yau,jorge-yau,jorge-yau --deals 100 --seed 919000000
