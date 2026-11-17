#!/usr/bin/env python3
"""Inspect and validate a Claude Code prototype ZIP."""
from __future__ import annotations
import argparse, json, sys, zipfile

REQUIRED = {
    'README.md', 'PRFAQ.md', 'VALIDATED_USE_CASE.md', 'TECHNICAL_REQUIREMENTS.md',
    'COMPONENT_MAP.json', 'AGENT_KIT_ROUTING.json', 'KANBAN.json', 'EVIDENCE.json',
    'VISUAL_ANNOTATIONS.json', 'CONVERSATION.json', 'BACKLOG.json',
    'PACKAGE_MANIFEST.json', 'CLAUDE_CODE_PROMPT.md',
    'PRD.md', 'TRD.md', 'SPEC_TRACE.json', 'SPEC_DIFF.md',
}
TRACE_TYPES = {'conversation', 'evidence', 'annotation', 'inference', 'backlog', 'execution'}

def read(z: zipfile.ZipFile, name: str) -> str:
    return z.read(name).decode('utf-8')

def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('zip_path')
    args = parser.parse_args()
    with zipfile.ZipFile(args.zip_path) as z:
        names = {name.rstrip('/') for name in z.namelist()}
        missing = sorted(REQUIRED - names)
        if missing:
            print(json.dumps({'ok': False, 'missing': missing}, indent=2))
            return 1
        annotations = json.loads(read(z, 'VISUAL_ANNOTATIONS.json'))
        prompt = read(z, 'CLAUDE_CODE_PROMPT.md')
        required_prompt_phrases = [
            'thinnest production-minded pilot', 'PRFAQ.md', 'shadcn/ui',
            'Agent Kit', 'human-in-the-loop', 'KANBAN.json', 'working vertical slice',
        ]
        prompt_missing = [phrase for phrase in required_prompt_phrases if phrase not in prompt]
        annotation_errors = []
        for index, item in enumerate(annotations):
            if not isinstance(item, dict):
                annotation_errors.append(f'{index}: not an object')
                continue
            for field in ('target', 'note', 'shape'):
                if not item.get(field): annotation_errors.append(f'{index}: missing {field}')
            if item.get('shape') not in {'object', 'circle', 'full-screen'}:
                annotation_errors.append(f"{index}: invalid shape {item.get('shape')}")
        # Session-scoped provenance: every edge has the team's shape, and annotation edges exist exactly
        # when a real annotation was made (no seeded demo traces in a real export).
        trace = json.loads(read(z, 'SPEC_TRACE.json'))
        trace_errors = []
        if not isinstance(trace, list):
            trace_errors.append('SPEC_TRACE.json is not an array')
            trace = []
        for index, edge in enumerate(trace):
            if not isinstance(edge, dict):
                trace_errors.append(f'{index}: not an object'); continue
            for field in ('section', 'label', 'detail', 'type'):
                if not isinstance(edge.get(field), str) or not edge.get(field):
                    trace_errors.append(f'{index}: missing {field}')
            if edge.get('type') not in TRACE_TYPES:
                trace_errors.append(f"{index}: invalid type {edge.get('type')}")
        annotation_edges = [e for e in trace if isinstance(e, dict) and e.get('type') == 'annotation']
        if annotation_edges and not annotations:
            trace_errors.append('annotation edges without any visual annotation (seeded provenance)')
        if annotations and not annotation_edges:
            trace_errors.append('visual annotations without an annotation edge')
        result = {
            'ok': not prompt_missing and not annotation_errors and not trace_errors,
            'required_files': len(REQUIRED),
            'visual_annotations': len(annotations),
            'prompt_missing': prompt_missing,
            'annotation_errors': annotation_errors,
            'trace_edges': len(trace),
            'trace_types': {t: sum(1 for e in trace if isinstance(e, dict) and e.get('type') == t) for t in sorted(TRACE_TYPES)},
            'trace_errors': trace_errors,
        }
        print(json.dumps(result, indent=2))
        return 0 if result['ok'] else 1

if __name__ == '__main__':
    sys.exit(main())
