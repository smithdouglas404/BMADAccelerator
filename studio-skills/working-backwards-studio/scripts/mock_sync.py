#!/usr/bin/env python3
"""Project Studio backlog items into deterministic Git and Linear mock states."""
from __future__ import annotations
import argparse, json, hashlib
from pathlib import Path


def stable_id(prefix: str, source_id: str) -> str:
    return f"{prefix}_{hashlib.sha1(source_id.encode()).hexdigest()[:10]}"

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('backlog_json', help='JSON file containing the Studio backlog array')
    parser.add_argument('--state', default='mock-sync-state.json')
    parser.add_argument('--spec-diffs', help='Optional JSON array of spec diffs: {id, file, summary, from, to}')
    args = parser.parse_args()
    backlog = json.loads(Path(args.backlog_json).read_text())
    state_path = Path(args.state)
    previous = json.loads(state_path.read_text()) if state_path.exists() else {'git': {}, 'linear': {}}
    git, linear = dict(previous.get('git', {})), dict(previous.get('linear', {}))
    for item in backlog:
        source_id = item['id']
        title = item.get('title', 'Untitled signal')
        capability = item.get('group') or 'Unsorted signal'
        git_id = stable_id('git', source_id)
        linear_id = stable_id('lin', source_id)
        git[git_id] = {
            'sourceId': source_id,
            'branch': 'studio/' + source_id,
            'packagePath': f'prototype/backlog/{source_id}.json',
            'title': title,
            'trace': f"Studio backlog → {capability}",
        }
        linear[linear_id] = {
            'sourceId': source_id,
            'project': capability,
            'issueType': 'epic' if item.get('kind') == 'epic' else 'story',
            'title': title,
            'description': item.get('note', ''),
            'studioTrace': f"Studio backlog → {source_id}",
        }
    spec_diffs = json.loads(Path(args.spec_diffs).read_text()) if args.spec_diffs else []
    for diff in spec_diffs:
        source_id = diff['id']
        git[stable_id('git', source_id)] = {
            'sourceId': source_id,
            'branch': 'studio/spec/' + source_id,
            'packagePath': f"prototype/spec/{diff.get('file', 'PRD.md')}",
            'title': diff.get('summary', source_id),
            'trace': f"Studio spec diff → {diff.get('from', '')} → {diff.get('to', '')}",
        }
        linear[stable_id('lin', source_id)] = {
            'sourceId': source_id,
            'project': 'Specification',
            'issueType': 'spec-change',
            'title': diff.get('summary', source_id),
            'description': f"{diff.get('file', '')}: {diff.get('from', '')} → {diff.get('to', '')}",
            'studioTrace': f"Studio spec → {source_id}",
        }
    state = {'git': git, 'linear': linear}
    state_path.write_text(json.dumps(state, indent=2) + '\n')
    print(json.dumps({
        'ok': True,
        'studioItems': len(backlog),
        'specDiffs': len(spec_diffs),
        'gitRecords': len(git),
        'linearRecords': len(linear),
        'idempotent': previous == state if previous.get('git') or previous.get('linear') else False,
        'statePath': str(state_path),
        'git': list(git.values()),
        'linear': list(linear.values()),
    }, indent=2))

if __name__ == '__main__':
    main()
