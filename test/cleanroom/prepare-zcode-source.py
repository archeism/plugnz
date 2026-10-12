#!/usr/bin/env python3
"""Create an exact committed-source-only ZCode build context; never read a worktree."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import subprocess
import tarfile

PIN = "aac4755666d09fdcd70272fcf063c077a639015f"

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path, help="Verified official ZCode Git clone containing the pinned commit")
    parser.add_argument("--out", required=True, type=Path, help="New empty Docker build context directory")
    args = parser.parse_args()
    repository = args.repo.resolve()
    target = args.out.resolve()
    origin = subprocess.check_output(["git", "-C", str(repository), "remote", "get-url", "origin"], text=True, stderr=subprocess.PIPE, timeout=15).strip()
    if re.fullmatch(r"(?:https://github\.com/|ssh://git@github\.com/|git@github\.com:)zai-org/zcode(?:\.git)?/?", origin, re.IGNORECASE) is None:
        raise SystemExit("Source clone must have the official zai-org/ZCode origin")
    resolved = subprocess.check_output(["git", "-C", str(repository), "rev-parse", "--verify", PIN + "^{commit}"], text=True, timeout=15).strip()
    if resolved != PIN:
        raise SystemExit("Pinned commit is unavailable")
    target.mkdir(parents=True, exist_ok=False)
    archive = target / "source.tar.gz"
    command = ["git", "-C", str(repository), "archive", "--format=tar.gz", "--prefix=source/", PIN]
    with archive.open("wb") as output:
        subprocess.run(command, stdout=output, check=True, timeout=120)
    with tarfile.open(archive, "r:gz") as contents:
        first = contents.next()
        if first is None or first.name != "source" or contents.pax_headers.get("comment") != PIN:
            raise SystemExit("Git archive prefix or embedded commit metadata mismatch")
    with archive.open("rb") as input_file:
        digest = hashlib.file_digest(input_file, "sha256").hexdigest()
    (target / "SOURCE-ARCHIVE-SHA256").write_text(digest + "  source.tar.gz\n")
    provenance = {"pin": PIN, "source_repository": "https://github.com/zai-org/ZCode", "origin_verified": True, "acquisition": "git archive exact verified official commit; no worktree, node_modules, or runtime copied", "archive_command": ["git", "archive", "--format=tar.gz", "--prefix=source/", PIN], "sha256": digest, "bytes": archive.stat().st_size, "git_pax_commit": PIN}
    (target / "provenance.json").write_text(json.dumps(provenance, indent=2) + "\n")
    print(json.dumps({"context": str(target), **provenance}, indent=2))

if __name__ == "__main__":
    main()
