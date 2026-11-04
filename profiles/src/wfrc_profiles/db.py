"""DuckDB connection with the spatial extension, used for all spatial and tabular processing."""
from __future__ import annotations

from pathlib import Path

import duckdb

from .paths import RAW
from .util import write_if_changed

WARN_BYTES = 10 * 1024 * 1024   # keep every tracked file well under GitHub's 50 MB warning
FAIL_BYTES = 40 * 1024 * 1024


def connect() -> duckdb.DuckDBPyConnection:
    con = duckdb.connect()
    try:
        con.execute("INSTALL spatial")
        con.execute("LOAD spatial")
    except duckdb.Error as e:
        raise RuntimeError(
            f"Could not load the DuckDB spatial extension for duckdb {duckdb.__version__}: {e}\n"
            "If a Windows Application Control policy blocks it, use the duckdb version pinned in pyproject.toml."
        ) from e
    return con


def sql_path(path: Path) -> str:
    """Forward-slash path for use inside a SQL string literal."""
    return str(path).replace("\\", "/").replace("'", "''")


def write_parquet(con: duckdb.DuckDBPyConnection, query: str, dest: Path, order_by: str, **options) -> bool:
    """COPY a query to parquet (GeoParquet when it has geometry columns), but only touch `dest` if the
    bytes change, so unchanged data leaves no git diff. Returns True if the file was written."""
    tmp = RAW / "_tmp" / dest.name
    tmp.parent.mkdir(parents=True, exist_ok=True)
    opts = "".join(f", {k} {v}" for k, v in options.items())
    con.execute(f"COPY (SELECT * FROM ({query}) ORDER BY {order_by}) TO '{sql_path(tmp)}' "
                f"(FORMAT parquet, COMPRESSION zstd{opts})")
    data = tmp.read_bytes()
    tmp.unlink()
    if len(data) > FAIL_BYTES:
        raise RuntimeError(f"{dest.name} is {len(data) / 1e6:.1f} MB, over the {FAIL_BYTES / 1e6:.0f} MB limit; split it")
    if len(data) > WARN_BYTES:
        print(f"warning: {dest.name} is {len(data) / 1e6:.1f} MB; consider splitting it")
    return write_if_changed(dest, data)
