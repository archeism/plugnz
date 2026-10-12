#!/usr/bin/env python3
"""Derive an opt-in nested-userns test profile from an explicit Docker baseline.

This changes no Docker daemon, host sysctl, AppArmor profile or native Codex policy.
Supply only a credential-free container's effective linux.seccomp JSON (or the
matching Docker default profile). The output is selected for one disposable
container with --security-opt seccomp=<output>. It preserves every baseline
rule and adds the three groups exercised by the retained no-model probe.
"""
import argparse
import hashlib
import json
from pathlib import Path


def derive(baseline):
    if baseline.get('defaultAction') != 'SCMP_ACT_ERRNO':
        raise ValueError('Expected a restrictive Docker baseline with defaultAction SCMP_ACT_ERRNO')
    groups = baseline.get('syscalls')
    if not isinstance(groups, list) or not any('clone' in group.get('names', []) for group in groups):
        raise ValueError('Expected an explicit Docker syscall baseline, including clone policy')
    profile = json.loads(json.dumps(baseline))
    namespace_flags = 0x10000000 | 0x00020000 | 0x20000000 | 0x40000000 | 0x08000000 | 0x04000000
    additions = [
        {'names': ['unshare'], 'action': 'SCMP_ACT_ALLOW', 'args': [
            {'index': 0, 'value': (~namespace_flags) & 0xffffffff, 'valueTwo': 0, 'op': 'SCMP_CMP_MASKED_EQ'}]},
        {'names': ['clone'], 'action': 'SCMP_ACT_ALLOW', 'args': [
            {'index': 0, 'value': 0x10000000, 'valueTwo': 0x10000000, 'op': 'SCMP_CMP_MASKED_EQ'}]},
        {'names': ['mount', 'umount2', 'pivot_root'], 'action': 'SCMP_ACT_ALLOW'},
    ]
    profile['syscalls'].extend(additions)
    return profile, additions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-profile', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit('Refusing to overwrite an existing profile')
    baseline_bytes = args.base_profile.read_bytes()
    profile, additions = derive(json.loads(baseline_bytes))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(profile, indent=2))
    receipt = {
        'baseline_sha256': hashlib.sha256(baseline_bytes).hexdigest(),
        'output_sha256': hashlib.sha256(args.output.read_bytes()).hexdigest(),
        'added_groups': additions,
        'baseline_rules_preserved': True,
        'scope': 'Select only for an owned disposable container. Keep UID1000, cap-drop ALL, no-new-privileges, read-only outer root, native read-only sandbox and resource/network limits. This does not disable seccomp.',
        'apparmor_qualification': 'The verified host also required apparmor=unconfined for that container only. This helper neither selects nor changes AppArmor. Do not claim unchanged Docker defaults.',
    }
    args.output.with_suffix(args.output.suffix + '.receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
    print(json.dumps(receipt))


if __name__ == '__main__':
    main()
