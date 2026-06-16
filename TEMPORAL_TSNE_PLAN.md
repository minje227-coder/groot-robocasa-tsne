# RoboCasa Temporal t-SNE Plan

This repo hosts a shared GitHub Pages viewer for temporal RoboCasa t-SNE outputs.
The goal is to inspect task-level and description-level representation differences
across baseline, MGD, and RKD runs without committing heavy feature caches.

## Objective

Analyze why only specific RoboCasa tasks improve under auxiliary losses by looking
at the representation geometry of each task and each natural-language description.

The viewer is intended to support:

- task-level cluster shape comparison
- description-level compactness and separability inspection
- temporal trajectory inspection across an episode
- run and feature comparison with one common browser UI
- point-to-video lookup for qualitative debugging

## Dataset Scope

- Task set: `my_atomic26`
- Tasks: 26
- Descriptions: 251
- Sampling seed: 42
- Anchor timesteps per description: 32
- Points per feature: 8,032
- Cameras per sequence:
  - `agentview_left`
  - `agentview_right`
  - `eye_in_hand`

All tasks are included. The previous task exclusion behavior is disabled for this
temporal export.

## Runs And Features

Baseline runs include raw VLM features because the baseline checkpoints are the
reference points for later raw-backbone comparisons.

| Family | Run | Features |
| --- | --- | --- |
| baseline | `baseline_checkpoint_60000` | `raw`, `processed`, `action` |
| baseline | `baseline_checkpoint_120000` | `raw`, `processed`, `action` |
| MGD | `mgd_seed44_phase2` | `processed`, `action` |
| MGD | `mgd_seed44_phase3` | `processed`, `action` |
| RKD | `rkd_v2a_phase2` | `processed`, `action` |
| RKD | `rkd_v2a_phase3` | `processed`, `action` |

MGD and RKD do not export raw VLM features for now because the raw VLM backbone is
not expected to change across those runs. Raw features can be added later if a new
comparison needs them.

## Storage Layout

The repo uses one common viewer and run-specific data folders.

```text
/
  index.html
  assets/
    app.js
    styles.css
    videos/<manifest_id>/seq_XXXX/*.mp4
  data/
    catalog.json
    manifests/<manifest_id>.json
  runs/
    <run_id>/
      manifest.json
      sequences.json
      points_<feature>.json
      features_<feature>.npz   # local only, ignored by git
```

Committed to git:

- static viewer files
- lightweight JSON manifests and t-SNE point files
- compressed MP4 clips used by the browser viewer

Ignored by git:

- `*.npz` feature caches
- logs
- temporary catalog lock files

## Viewer Design

The root page is the only real viewer. Family folders such as `baseline/`, `MGD/`,
and `RKD/` are redirect entrypoints into the same viewer.

Expected interaction:

- selecting a family loads the matching runs
- selecting a run loads available feature tabs
- selecting a feature draws all task-description temporal trajectories
- play and pause animate through the 32 sampled timesteps
- clicking a point selects the sequence, timestep, task, and description
- the side panel loads the corresponding video and seeks to the selected frame
- camera buttons switch between the three recorded camera views

This keeps the Pages site maintainable: new runs only need new JSON/video data and
an updated catalog, not a copied HTML app.

## Analysis Plan

Use the viewer first for qualitative diagnosis:

- identify tasks whose trajectories become more compact after MGD or RKD
- identify tasks whose descriptions separate cleanly versus overlap
- compare `processed` and `action` spaces to see where task geometry changes
- inspect whether improvements happen at early, middle, or late episode timesteps
- click outlier points and verify whether the video state matches the expected
  task phase

After the visual pass, add offline metrics using the saved JSON/NPZ artifacts:

- within-description compactness
- between-description separability inside each task
- task-level separability across the full task set
- temporal smoothness of each trajectory
- nearest-neighbor task or description confusion
- correlation with task success-rate deltas

The main hypothesis to test is whether task-specific performance gains come from
better geometric organization in the processed/action representations, rather than
from a manually chosen task-family heuristic.

## Validation

Before pushing viewer/data changes:

```bash
python3 scripts/validate_site.py .
```

The validator checks that the catalog, run manifests, sequence counts, point
counts, and referenced video files are present.
