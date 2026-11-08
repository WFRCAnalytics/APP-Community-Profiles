"""Regenerate web/src/lib/state-fixture.json: Utah's ACS estimates for every table the chart specs and indicators read,
by vintage. spec-sums.test.ts checks each spec against it, so a table layout change cannot silently break a chart.

    uv run python web/scripts/state-fixture.py
"""
import json
import re
from pathlib import Path

import duckdb

root = Path(__file__).resolve().parents[2]
src = (root / "web/src/lib/specs.ts").read_text(encoding="utf-8") + (root / "web/src/lib/indicators.ts").read_text(encoding="utf-8")
tables = sorted(set(re.findall(r'"([BC]\d{5})"', src)))
con = duckdb.connect()
out: dict[str, dict[str, float]] = {}
for topic_dir in sorted((root / "data/acs").iterdir()):
    rows = con.execute(
        f"SELECT vintage, variable, estimate FROM read_parquet('{(topic_dir / 'state.parquet').as_posix()}') "
        f"WHERE geo_id = '49' AND estimate IS NOT NULL AND left(variable, 6) IN ({', '.join(repr(t) for t in tables)})"
    ).fetchall()
    for vintage, variable, estimate in rows:
        out.setdefault(str(vintage), {})[variable] = estimate
(root / "web/src/lib/state-fixture.json").write_text(json.dumps(out, separators=(",", ":"), sort_keys=True), encoding="utf-8")
print(f"{len(tables)} tables, {sum(len(v) for v in out.values())} values")
