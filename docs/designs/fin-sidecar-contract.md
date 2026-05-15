# Contract: financial side-file (JSON v1) + `merge_financials.py` CLI

Status: **FROZEN** 2026-05-15 — do not change after WT-B/WT-C start consuming it.
Source of decision: `/plan-eng-review` of `docs/plans/financial-analyzer-standalone-command.md`
(decision A2: YAML → stdlib JSON; PyYAML is absent in `web-scrape` and base).

This file is the single interface contract shared by three work items:

- **WT-A** — `analyst-deal/scripts/merge_financials.py` (this PR): *reads* the side-file, *implements* the CLI.
- **WT-B** — `analyst-deal/commands/financial-analyzer.md`: *invokes* the CLI; owns where the side-file is written (`.fin-cache/<sha8(abs_folder)>/<YYYYMMDD>.json`, Codex #13) and the `--extract-only` short-circuit (Codex #7).
- **WT-C** — `analyst-deal/agents/financial-analyzer.md` Step 4.5: *writes* the side-file in this JSON shape (replaces `yaml.safe_dump`); adds the anti-fabrication line (Codex #15).

WT-C must land atomically with the `portfolio-tracking` Step 5.5.2 rewire — splitting them
leaves `portfolio-tracking` broken in the user's env (YAML path already fails today).

---

## 1. JSON side-file schema v1

One file per reporting period. UTF-8, written with
`json.dump(obj, f, ensure_ascii=False, indent=2)`.

```json
{
  "_meta": {
    "schema": "fin-sidecar/v1",
    "company": "矽昌通信",
    "quarter": "2025Q4",
    "period_date": "2025-12-31",
    "unit": "万元"
  },
  "items": {
    "货币资金": 1234.50,
    "应收账款净额": null,
    "一、营业总收入": 5678.90,
    "流动资产合计": 9999.00,
    "毛利率": 32.1
  }
}
```

- `items` — flat object. **Key = 合并报表行项原文, verbatim** (Chinese punctuation,
  `（）`, `：`, Roman/Arabic numerals, leading `一、` all preserved 1:1 — parent matches
  the historical table's first-column label by exact string).
- `items` value — 万元, float, 2 decimals; or JSON `null` when the line item could not
  be located. **`null` ⇒ the cell is skipped, never written as `"None"`/`""`/`0`.**
- `items` includes detail + subtotal (`*合计`/`*小计`) + ratio (`*率`) rows; the merge
  script decides which to write (subtotals/ratios are left to Excel formulas).
- `_meta.period_date` — `YYYY-MM-DD`. The merge script cross-checks this against `--date`
  and emits a `NOTE:` if they differ (not fatal — supports legitimate manual reruns).
- `_meta.schema` — version tag. The script requires the top-level object to contain an
  `items` object; otherwise it exits with a clean `ERR:` (no traceback).

No YAML fallback. No flat-dict fallback. A file missing `items` is a hard, clean error.

## 2. `merge_financials.py` CLI signature (frozen)

```
python3 analyst-deal/scripts/merge_financials.py \
    --target  <path to historical .xlsx OR .csv>   # required
    --json    <path to one period's side-file>      # required
    --date    <YYYY-MM-DD>                           # required, the reporting period
```

- Must run inside conda env `web-scrape` (openpyxl present there; see `analyst-deal/CLAUDE.md`).
- `--target` dispatch by extension, case-insensitive: `.xlsx` → openpyxl branch;
  `.csv` → stdlib-csv branch; `.xls`/unknown → clean `ERR:` (no silent guess).
- Exit `0` on OK / INSERT / OVERWRITE. Any failure → message on stderr prefixed
  `ERR:` (or `FATAL:` for the locked-file case) and `sys.exit(1)` — **never a Python
  traceback** (malformed JSON, missing sheet, no datetime anchor, bad `--date`,
  unknown extension, locked xlsx all go through this path).
- stdout summary lines (`OK:` / `INSERT:` / `OVERWRITE:` / `NOTE:` / `Missing labels:`)
  are passed through verbatim by the command layer.

## 3. Column placement (decision OV1 — replaces the old abort rule)

The old Step 5.5.2 aborted when `TARGET < latest`. That silently broke backfill
(historical table already has a later column, an earlier period arrives). Replaced by
**insert-in-order**:

1. Collect every row-1 cell that is a date → `(column_index, date)`, in column order.
2. **Exact match** (`date == TARGET`): overwrite that column — clear data rows first,
   then rewrite. Idempotent. If two columns equal TARGET, the leftmost (smallest column
   index) is chosen — deterministic.
3. **Else, some existing column is later than TARGET**: pick the one with the *smallest*
   date among those later than TARGET, and `insert_cols` immediately before it. The new
   column lands at that index; existing later columns (incl. formula columns) shift right.
4. **Else (TARGET newer than every existing column)**: append at `latest_col + 1`
   (`insert_cols` there). This preserves the pre-extraction quarterly-append behavior of
   `portfolio-tracking` byte-for-byte (regression test #17).

xlsx: row-1 anchor cells are `datetime` objects (openpyxl). csv: row-0 header cells are
strings parsed via `datetime.strptime(cell, "%Y-%m-%d")`; the label column ("项目"/"科目")
does not parse and is simply not an anchor.

## 4. Row classification (verbatim from Step 5.5.2 — do not edit constants)

`SILENT_IGNORE` (structural labels, not counted as missing), `SKIP_EXACT`
(subtotals/derived left to formulas), suffix rule `*合计`/`*小计`/`*率` → skip,
else → write by exact first-column-label match against `items`. A label present in the
sheet but absent from `items` is reported as **missing** (label drift), never silent.

## 5. CSV branch parity (decision A4)

stdlib `csv` only, mutate the target csv in place, **same `classify()` + same value
pipeline as the xlsx branch**. csv has no formulas, so skipped subtotal/ratio rows stay
empty (command Output tells the analyst to backfill or convert to xlsx). Read with
`encoding="utf-8-sig"` (tolerates BOM + plain UTF-8), write back `utf-8-sig` (round-trips
and keeps Excel-readable Chinese). Parity is enforced by test #6: same side-file →
identical detail-row values in xlsx and csv.
