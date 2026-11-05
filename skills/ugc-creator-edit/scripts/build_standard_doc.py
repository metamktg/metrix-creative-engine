#!/usr/bin/env python3
"""Compose the engine's readable review resource from its skill references."""
from pathlib import Path
import argparse
import sys


def rendered_standard(skill_root: Path) -> str:
    parts = [
        '# Evergreen UGC/video production and review standard\n\n'
        'This repository standard is composed from the UGC skill references. '
        'It governs production and presentation eligibility, not provider permissions or spending authority. '
        'Python 3.10 or later runs the local evidence helpers. '
        'Edit the source references, then rebuild this document with '
        '`python skills/ugc-creator-edit/scripts/build_standard_doc.py --out docs/UGC_PRODUCTION_STANDARD.md`.\n'
    ]
    for name in ('production-standard.md', 'review-gates.md'):
        text = (skill_root / 'references' / name).read_text(encoding='utf-8').strip()
        # Retain the full contract while nesting its headings in this document.
        text = '\n'.join('#' + line if line.startswith('#') else line for line in text.splitlines())
        for target in ('production-standard.md', 'review-gates.md', 'production-records.md'):
            text = text.replace('](' + target + ')', '](../skills/ugc-creator-edit/references/' + target + ')')
        text = text.replace('`templates/review-manifest.json`', '`skills/ugc-creator-edit/templates/review-manifest.json`')
        parts.append(text)
    return '\n\n'.join(parts).rstrip() + '\n'


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    rendered = rendered_standard(Path(__file__).resolve().parents[1])
    if args.check:
        if not args.out.is_file() or args.out.read_text(encoding='utf-8') != rendered:
            print('FAIL: production standard resource differs from its skill references.', file=sys.stderr)
            return 1
        print('PASS: production standard resource matches skill references.')
        return 0
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(rendered, encoding='utf-8')
    print('Wrote production standard resource.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
