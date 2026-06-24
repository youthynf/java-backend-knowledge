#!/usr/bin/env python3
"""Audit markdown articles for interview-review renovation progress."""
from __future__ import annotations

import csv
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = ROOT / "article-audit.csv"

EXCLUDE_NAMES = {
    "README.md",
    "sidebar.md",
    "_coverpage.md",
    "_404.md",
}

REQUIRED = [
    ("has_core_concept", ["核心概念"]),
    ("has_interviewer_focus", ["面试官想考什么", "面试官想考察什么"]),
    ("has_standard_answer", ["标准回答"]),
    ("has_followups", ["深挖追问", "追问"]),
    ("has_scenario_or_code", ["实战场景", "代码示例", "场景", "```"]),
    ("has_pitfalls_or_summary", ["易错点", "总结", "常见误区"]),
]


def is_article(path: Path) -> bool:
    rel = path.relative_to(DOCS)
    if path.name in EXCLUDE_NAMES:
        return False
    if any(part.startswith("_") for part in rel.parts):
        return False
    return True


def first_h1(text: str) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return ""


def contains_any(text: str, needles: list[str]) -> bool:
    return any(n in text for n in needles)


def main() -> None:
    files = sorted(DOCS.rglob("*.md"))
    rows = []
    for path in files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        rel = path.relative_to(ROOT).as_posix()
        article = is_article(path)
        h1 = first_h1(text)
        wordish_len = len(re.sub(r"\s+", "", text))
        row = {
            "path": rel,
            "is_article": article,
            "title": h1,
            "has_h1": bool(h1),
            "chars_no_space": wordish_len,
            "too_short_lt_800": article and wordish_len < 800,
        }
        missing = []
        for key, needles in REQUIRED:
            ok = contains_any(text, needles)
            row[key] = ok
            if article and not ok:
                missing.append(key)
        row["missing_count"] = len(missing) if article else ""
        row["missing_fields"] = ";".join(missing)
        rows.append(row)

    fieldnames = [
        "path",
        "is_article",
        "title",
        "has_h1",
        "chars_no_space",
        "too_short_lt_800",
        *[k for k, _ in REQUIRED],
        "missing_count",
        "missing_fields",
    ]
    with OUT.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    article_rows = [r for r in rows if r["is_article"]]
    done = [r for r in article_rows if r["missing_count"] == 0 and not r["too_short_lt_800"] and r["has_h1"]]
    print(f"total_markdown={len(rows)}")
    print(f"article_markdown={len(article_rows)}")
    print(f"quality_pass={len(done)}")
    print(f"need_work={len(article_rows) - len(done)}")
    print(f"report={OUT}")

    # Print top missing directories for quick planning.
    by_top = {}
    for r in article_rows:
        top = r["path"].split("/")[1] if "/" in r["path"] else r["path"]
        stat = by_top.setdefault(top, {"total": 0, "pass": 0})
        stat["total"] += 1
        if r in done:
            stat["pass"] += 1
    print("\nby_top_dir:")
    for top, stat in sorted(by_top.items()):
        print(f"{top}: pass={stat['pass']}, total={stat['total']}, need={stat['total']-stat['pass']}")


if __name__ == "__main__":
    main()
