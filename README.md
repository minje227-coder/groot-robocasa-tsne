# RoboCasa t-SNE Pages

Static GitHub Pages site for RoboCasa temporal t-SNE outputs.

URLs:

- Repo: `https://github.com/minje227-coder/groot-robocasa-tsne`
- Pages: `https://minje227-coder.github.io/groot-robocasa-tsne/`

Top-level families:

- `baseline/`
- `MGD/`
- `RKD/`

Published temporal viewer:

- `baseline_checkpoint_60000`: raw, processed, action
- `baseline_checkpoint_120000`: raw, processed, action
- `mgd_seed44_phase2`: processed, action
- `mgd_seed44_phase3`: processed, action
- `rkd_v2a_phase2`: processed, action
- `rkd_v2a_phase3`: processed, action

All runs use the same temporal sample manifest:

- 26 RoboCasa `my_atomic26` tasks
- 251 task descriptions
- 32 anchor timesteps per description
- 8,032 t-SNE points per feature

Raw feature caches (`*.npz`) stay in the working tree for later analysis but are
excluded from git.

Validate before pushing:

```bash
python3 scripts/validate_site.py .
```
