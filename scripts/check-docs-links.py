#!/usr/bin/env python3
"""Check internal Markdown document links for the Docsify knowledge base.

Rules:
- Only checks local Markdown document links under docs/.
- Ignores external URLs, anchors-only links, protocol links and static asset links.
- Requires internal document links to be root-absolute, e.g. /03-database/mysql/.
  This avoids Docsify resolving links relative to the current article and producing 404 routes.
"""

from __future__ import annotations

import os
import re
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")


def split_href(raw: str) -> str:
    raw = raw.strip()
    match = re.match(r"([^\s]+)(\s+[\"'][^\"']*[\"'])$", raw)
    return match.group(1) if match else raw


def is_external(href: str) -> bool:
    return (
        not href
        or href.startswith("#")
        or href.startswith("//")
        or re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*:", href) is not None
    )


def candidates(rel: str) -> list[Path]:
    rel = rel.lstrip("/")
    if rel in ("", "."):
        return [Path("README.md")]

    out = [Path(rel)]
    if rel.endswith("/"):
        out.append(Path(rel) / "README.md")
    else:
        out.append(Path(rel + ".md"))
        out.append(Path(rel) / "README.md")
    return out


def is_document_like(path: str) -> bool:
    if not path:
        return False
    name = Path(path).name
    return path.endswith(".md") or path.endswith("/") or "." not in name


def main() -> int:
    if not DOCS.exists():
        print(f"docs directory not found: {DOCS}", file=sys.stderr)
        return 2

    files = list(DOCS.rglob("*.md"))
    broken: list[tuple[str, str, str, list[str]]] = []
    non_absolute: list[tuple[str, str]] = []
    total = 0

    for file in files:
        source = file.relative_to(DOCS).as_posix()
        text = file.read_text(encoding="utf-8", errors="ignore")

        for match in LINK_RE.finditer(text):
            href = split_href(match.group(1))
            if is_external(href):
                continue

            parts = urllib.parse.urlsplit(href)
            path = urllib.parse.unquote(parts.path)
            if not is_document_like(path):
                continue

            total += 1
            if not path.startswith("/"):
                non_absolute.append((source, href))
                rel = os.path.normpath(
                    (file.parent.relative_to(DOCS) / path).as_posix()
                ).replace("\\", "/")
            else:
                rel = path.lstrip("/")

            cands = candidates(rel)
            if not any((DOCS / candidate).exists() for candidate in cands):
                broken.append(
                    (source, href, rel, [candidate.as_posix() for candidate in cands])
                )

    print(f"md files: {len(files)}")
    print(f"internal doc links: {total}")
    print(f"non-absolute internal doc links: {len(non_absolute)}")
    for source, href in non_absolute[:80]:
        print(f"NONABS | {source} | {href}")

    print(f"broken internal doc links: {len(broken)}")
    for source, href, rel, cands in broken[:120]:
        print(f"BROKEN | {source} | {href} | {rel} | cands={','.join(cands)}")

    return 1 if non_absolute or broken else 0


if __name__ == "__main__":
    raise SystemExit(main())
