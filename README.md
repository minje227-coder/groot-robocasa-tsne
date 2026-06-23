# RoboCasa t-SNE Pages

Static GitHub Pages site for RoboCasa frame-level t-SNE outputs.

URLs:

- Repo: `https://github.com/minje227-coder/groot-robocasa-tsne`
- Pages: `https://minje227-coder.github.io/groot-robocasa-tsne/`

Top-level families:

- `baseline/`
- `MGD/`
- `RKD/`
- `MGRKD/`

Published frame viewer:

- `baseline_checkpoint_60000_frame`: raw, processed, action
- `baseline_checkpoint_120000_frame`: raw, processed, action
- `rkd_v2_1_a_phase2_frame`: raw, processed, action
- `rkd_v2_1_a_phase3_frame`: raw, processed, action
- `rkd_v2_1_da_phase2_frame`: raw, processed, action
- `rkd_v2_1_da_phase3_frame`: raw, processed, action
- `mgrkd_distance_angle_flatten_action_encoder_phase2_frame`: raw, processed, action

All runs use the same frame sample manifest:

- 26 RoboCasa `my_atomic26` tasks
- description-balanced random frame sampling
- shared manifest `f0367e9630`
- 7,680 t-SNE points per feature

Raw feature caches (`*.npz`) stay in the working tree for later analysis but are
excluded from git.

Plan:

- [Temporal t-SNE analysis plan](TEMPORAL_TSNE_PLAN.md)

Validate before pushing:

```bash
python3 scripts/validate_site.py .
```
