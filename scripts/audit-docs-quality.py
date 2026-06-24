#!/usr/bin/env python3
from pathlib import Path
import re, json
from collections import Counter

root = Path('docs')
files = sorted(root.rglob('*.md'))
issues = []

source_patterns = [
    r'(?im)^source\s*[:：]', r'(?im)^原文链接\s*[:：]', r'(?im)^转载\s*[:：]',
    r'(?im)^出处\s*[:：]', r'(?im)^作者\s*[:：]', r'本文整理自', r'原文地址', r'转载请注明'
]
patch_patterns = ['这篇文章的主题是 **','面试复习补充','面试复习强化','interview-renovation','<!-- 面试复习补充 -->']
placeholder_patterns = ['TODO','待补充','建设中','Coming soon','待完善']
interview_signals = ['面试','高频问题','标准回答','核心概念','实战场景','易错点','追问','排查思路','生产实践','复习']

for p in files:
    s = p.read_text(encoding='utf-8', errors='ignore')
    text = s.strip()
    lines = s.splitlines()
    nonempty = [l for l in lines if l.strip()]
    headings = re.findall(r'(?m)^#{1,6}\s+(.+)$', s)
    flags = []
    is_readme = p.name.lower() == 'readme.md'
    is_nav = p.name in {'sidebar.md','_coverpage.md','_404.md'} or str(p).startswith('docs/_')

    if any(re.search(pat, s) for pat in source_patterns):
        flags.append('source_trace')
    if any(pat in s for pat in patch_patterns):
        flags.append('patch_marker')
    if any(pat in s for pat in placeholder_patterns):
        flags.append('placeholder')
    if '\ufffd' in s or '��' in s:
        flags.append('mojibake')

    has_interview = any(sig in s for sig in interview_signals)
    if not is_readme and not is_nav:
        if len(text) < 500:
            flags.append('too_short_article')
        if not has_interview:
            flags.append('no_interview_signal')
        # only one H1 and no H2 usually means raw note rather than structured article
        if len(re.findall(r'(?m)^##\s+', s)) == 0 and len(text) > 500:
            flags.append('no_h2_structure')
    if is_readme:
        # README can naturally contain many navigation links; only flag it when it lacks
        # interview-oriented guidance, not merely because it is link-heavy.
        has_readme_guidance = all(sig in s for sig in ['面试复习重点', '建议掌握程度', '面试表达模板'])
        if not has_readme_guidance:
            flags.append('readme_catalog_or_no_interview')
        if len(text) < 80:
            flags.append('thin_readme')

    if flags:
        issues.append({
            'path': str(p), 'chars': len(text), 'flags': flags, 'headings': headings[:8]
        })

counter = Counter(f for it in issues for f in it['flags'])
report = {
    'total_markdown': len(files),
    'issue_files': len(issues),
    'issue_counts': dict(counter),
    'issues': issues,
}
Path('reports').mkdir(exist_ok=True)
Path('reports/docs-quality-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
Path('reports/docs-quality-audit-summary.txt').write_text(
    '\n'.join([
        f'total_markdown={len(files)}',
        f'issue_files={len(issues)}',
        *[f'{k}={v}' for k, v in sorted(counter.items())],
    ]) + '\n', encoding='utf-8'
)
print(Path('reports/docs-quality-audit-summary.txt').read_text(encoding='utf-8'))
