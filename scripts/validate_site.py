#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


EXPECTED_SEQUENCES = 251
EXPECTED_POINTS = 8032


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def fail(errors: list[str], message: str) -> None:
    errors.append(message)


def load_expected_counts(root: Path, catalog: dict, run: dict, manifest: dict) -> tuple[int, int]:
    """Return expected sequence and point counts for temporal or shared-frame runs."""
    manifest_id = run.get("manifest_id") or manifest.get("manifest_id")
    if catalog.get("version") == 2 and manifest_id:
        shared_path = root / "data" / "official_manifest.json"
        if shared_path.exists():
            shared = load_json(shared_path)
            if shared.get("manifest_id") not in (None, manifest_id):
                return EXPECTED_SEQUENCES, EXPECTED_POINTS
            n_sequences = len(shared.get("sequences", []))
            return n_sequences, n_sequences
    return EXPECTED_SEQUENCES, EXPECTED_POINTS


def validate(root: Path) -> list[str]:
    errors: list[str] = []
    catalog_path = root / "data" / "catalog.json"
    if not catalog_path.exists():
        return [f"missing {catalog_path}"]

    catalog = load_json(catalog_path)
    runs = catalog.get("runs", [])
    seen_ids: set[str] = set()
    for run in runs:
        run_id = run.get("id")
        if not run_id:
            fail(errors, "catalog run without id")
            continue
        if run_id in seen_ids:
            fail(errors, f"duplicate run id: {run_id}")
        seen_ids.add(run_id)

        run_dir = root / run.get("path", "")
        manifest_path = run_dir / "manifest.json"
        if not manifest_path.exists():
            fail(errors, f"{run_id}: missing manifest.json")
            continue

        manifest = load_json(manifest_path)
        seq_path = run_dir / manifest.get("sequences_file", "sequences.json")
        if not seq_path.exists():
            fail(errors, f"{run_id}: missing sequences file")
            continue
        sequences = load_json(seq_path).get("sequences", [])
        expected_sequences, expected_points = load_expected_counts(root, catalog, run, manifest)
        if len(sequences) != expected_sequences:
            fail(errors, f"{run_id}: sequences={len(sequences)} expected={expected_sequences}")

        checked_videos = 0
        for seq in sequences:
            for rel_video in seq.get("videos", {}).values():
                checked_videos += 1
                if not (root / rel_video).exists():
                    fail(errors, f"{run_id}: missing video {rel_video}")
        if checked_videos == 0:
            fail(errors, f"{run_id}: no video paths in sequences")

        for feature in manifest.get("features", []):
            points_file = manifest.get("points_files", {}).get(feature)
            if not points_file:
                fail(errors, f"{run_id}: no points file for feature {feature}")
                continue
            points_path = run_dir / points_file
            if not points_path.exists():
                fail(errors, f"{run_id}: missing {points_file}")
                continue
            payload = load_json(points_path)
            n_points = len(payload.get("points", []))
            if n_points != expected_points:
                fail(errors, f"{run_id}/{feature}: points={n_points} expected={expected_points}")

    return errors


def main() -> int:
    root = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
    errors = validate(root)
    if errors:
        print("VALIDATION FAILED")
        for error in errors:
            print(f"- {error}")
        return 1
    print("VALIDATION PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
