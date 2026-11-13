"""Hand-results CSV -> Parquet, with typed columns (integers nullable, flags as
booleans-as-int8, text as strings). Usage: python to-parquet.py IN.csv OUT.parquet"""
import sys
import pyarrow as pa, pyarrow.csv as pc, pyarrow.parquet as pq

INT32 = ["game_seed", "hand_in_game", "round", "dealer_seat", "dealer_repeat", "winner_seat", "payer_seat",
         "faan", "base_points", "winner_points", "claimed_melds", "winner_discards", "wall_left", "pattern_count"]
INT8 = ["winner_is_dealer", "limit", "concealed"]
STR = ["table", "seat0_strategy", "seat1_strategy", "seat2_strategy", "seat3_strategy", "result", "winner_strategy",
       "how", "payer_strategy", "winning_tile", "patterns", "full_hand"]
types = {**{c: pa.int32() for c in INT32}, **{c: pa.int8() for c in INT8}, **{c: pa.string() for c in STR}}
t = pc.read_csv(sys.argv[1], convert_options=pc.ConvertOptions(column_types=types, strings_can_be_null=True,
                quoted_strings_can_be_null=False, null_values=[""]))
pq.write_table(t, sys.argv[2], compression="zstd", row_group_size=200_000)
print(sys.argv[2], t.num_rows, "rows")
