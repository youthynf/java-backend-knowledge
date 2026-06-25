#!/usr/bin/env python3
"""Audit documentation quality for the knowledge base.

The audit focuses on real article pages under docs/. README/catalog pages and
Docsify special pages are treated differently to avoid false positives.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Dict, List

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
REPORT_DIR = ROOT / "reports"
JSON_REPORT = REPORT_DIR / "docs-quality-audit.json"
SUMMARY_REPORT = REPORT_DIR / "docs-quality-audit-summary.txt"

SPECIAL_PAGES = {"_404.md", "_coverpage.md", "_navbar.md", "_sidebar.md"}

GENERIC_TEMPLATE_PATTERNS = [
    "这道题属于 **",
    "这类题的面试核心不是“知道名词”",
    "答题时建议用“三段式”",
    "能否先给定义，再讲原理、场景、代价",
    "<!-- interview-review-enhanced -->",
    "<!-- interview-detail-2026-06-24 -->",
    "## 面试版详细讲解",
    "## 面试复习版",
    "补上“标准回答 + 追问 + 易错点”",
    "你可以按这个结构回答：先说定位，再讲原理",
]

PATCH_MARKER_PATTERNS = [
    "<!--",
    "patch",
    "generated",
    "auto-enhanced",
]

MOJIBAKE_PATTERNS = ["Ã", "Â", "�", "å", "ç", "é" ]

INTERVIEW_SIGNALS = [
    "面试", "追问", "标准回答", "易错", "实战", "场景", "排查", "线上", "核心概念",
    "原理", "优化", "为什么", "区别", "边界", "总结", "案例", "问题",
]

SOURCE_TRACE_RE = re.compile(r"(^|\n)\s*(来源[:：]|原文链接[:：]|转载自[:：])")
PLACEHOLDER_RE = re.compile(r"(?i)(?<![A-Za-z])xxx(?![A-Za-z])|\bTBD\b|TODO|待补充|待完善")
H2_RE = re.compile(r"^##\s+", re.M)


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def is_special(path: Path) -> bool:
    return path.name in SPECIAL_PAGES


def is_readme(path: Path) -> bool:
    return path.name.lower() == "readme.md"


def is_favorites(path: Path) -> bool:
    return "docs/favorites/" in rel(path)


def title_of(text: str, path: Path) -> str:
    for line in text.splitlines():
        if line.startswith("# "):
            return line[2:].strip()
    return path.stem


def add_issue(issues: List[Dict], path: Path, typ: str, detail: str, line: int | None = None, match: str | None = None):
    item = {"type": typ, "path": rel(path), "detail": detail}
    if line is not None:
        item["line"] = line
    if match:
        item["match"] = match
    issues.append(item)


def audit_file(path: Path, issues: List[Dict]):
    text = path.read_text(encoding="utf-8", errors="replace")
    stripped = text.strip()
    lines = text.splitlines()

    if is_special(path):
        # Docsify special pages are not knowledge articles.
        return

    # Universal critical checks.
    for pat in GENERIC_TEMPLATE_PATTERNS:
        idx = text.find(pat)
        if idx != -1:
            line = text[:idx].count("\n") + 1
            add_issue(issues, path, "generic_template", "泛化面试模板或生成标记残留", line, pat)

    for i, line in enumerate(lines, 1):
        if PLACEHOLDER_RE.search(line):
            add_issue(issues, path, "placeholder", "占位符/TODO 残留", i, line.strip())
        if any(pat in line for pat in MOJIBAKE_PATTERNS):
            add_issue(issues, path, "mojibake", "疑似乱码", i, line.strip())
        if "<!--" in line and any(k in line.lower() for k in PATCH_MARKER_PATTERNS):
            add_issue(issues, path, "patch_marker", "补丁/生成注释残留", i, line.strip())

    if SOURCE_TRACE_RE.search(text) and not is_favorites(path):
        m = SOURCE_TRACE_RE.search(text)
        add_issue(issues, path, "source_trace", "非收藏页存在来源/转载痕迹", text[:m.start()].count("\n") + 1 if m else None)

    if is_readme(path):
        # README is catalog/navigation. It should be useful, but not forced into an interview article shape.
        if len(stripped) < 120 and stripped.count("-") + stripped.count("*") < 3:
            add_issue(issues, path, "thin_readme", "README 过短，缺少模块导航或说明")
        return

    # Real article checks.
    h2_count = len(H2_RE.findall(text))
    if len(stripped) < 900:
        add_issue(issues, path, "thin_article", "文章过短，可能只有目录/片段")
    if h2_count < 2:
        add_issue(issues, path, "weak_structure", "二级标题少，结构不完整")
    if not any(sig in text for sig in INTERVIEW_SIGNALS):
        add_issue(issues, path, "article_no_interview_signal", "缺少面试/实战/排查导向内容")


def main():
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(DOCS.rglob("*.md"))
    issues: List[Dict] = []
    for path in files:
        audit_file(path, issues)

    by_type = Counter(i["type"] for i in issues)
    issue_files = len({i["path"] for i in issues})
    report = {
        "total_markdown": len(files),
        "issue_count": len(issues),
        "issue_files": issue_files,
        "by_type": dict(sorted(by_type.items())),
        "issues": issues,
    }
    JSON_REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")

    lines = [
        "# 文档质量审计摘要",
        "",
        f"- total_markdown: {len(files)}",
        f"- issue_files: {issue_files}",
        f"- issue_count: {len(issues)}",
        "",
        "## 按类型统计",
    ]
    for typ, count in sorted(by_type.items()):
        lines.append(f"- {typ}: {count}")
    lines += ["", "## 问题明细"]
    for item in issues:
        loc = f"{item['path']}:{item.get('line', '')}".rstrip(":")
        extra = item.get("match") or item.get("detail", "")
        lines.append(f"- [{item['type']}] {loc} — {extra}")
    SUMMARY_REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    print(f"total_markdown={len(files)} issue_files={issue_files} issue_count={len(issues)}")
    for typ, count in sorted(by_type.items()):
        print(f"{typ}={count}")


if __name__ == "__main__":
    main()
