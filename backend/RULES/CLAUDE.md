# CLAUDE.md

Guidance for Claude Code working in this repo.

## Overview

Computer vision for detecting/classifying electrical components inside industrial PSS
cabinets. Targets Jetson edge devices (Orin NX/AGX, JetPack 6.2 / L4T R36) with native
cameras and TensorRT local inference. Unit tests cover coordinate math, focus/crop logic, and CHARM OCR matching (`tests/`).
Validate end-to-end by running the live demo and inspecting detections.

## Commands

```bash
uv sync                          # base; add --group {upload,model-build,dev} as needed
uv run pytest                    # unit tests (coordinate math, focus/crop, CHARM OCR)
./scripts/jetson_sync.sh         # Jetson camera + inference (system cv2)

uv run pss-live-demo             # live camera + inference overlay (OpenCV)
uv run pss-phone-demo            # mobile web demo (FastAPI/WebSocket)
uv run pss-tune-camera           # exposure/gain sliders
uv run pss-upload-dataset        # batch upload to Roboflow

uv run pss-model {fetch,build,activate,list}        # TRT engine lifecycle
uv run pss-inference-profile {list,use}             # swap inference presets

./scripts/inference_server.sh {start,stop}          # PSS TRT Docker container
curl -s http://localhost:9001/health
```

## Architecture

- `config.py` — single config layer. Loads `.env`, then `tuning/<CAMERA_TYPE>.env`, then
  `tuning/inference/<INFERENCE_PROFILE>.env` (later wins). All settings via typed getters.
  Copy `example.env`→`.env`, set `ROBOFLOW_API_KEY`. Key vars: `CAMERA_TYPE`
  (`ar0234`/`imx477`/`imx519`/`usb`), `INFERENCE_API_URL` (default `:9001`), `CONFIDENCE`,
  `INFERENCE_PROFILE`, `INFERENCE_WIDTH/HEIGHT` (must match model manifest).
- `camera/factory.py` → backend per `CAMERA_TYPE` (V4L2 / GStreamer / USB).
- `client/factory.py` → PSS TRT HTTP client (`http_pss.py`, posts BGR frames to `/v1/infer`).
  Protocol in `pss_protocol.py`; interface in `client/base.py`.
- `apps/live_demo.py` — camera → letterbox → inference (bg thread) → overlay. Keys: `s` save,
  `o` CHARM OCR, `c` clear OCR, `q` quit. `apps/phone_demo.py` — browser version (TLS in `.certs/`).
- `ocr/` + `charm_match.py` — OCRs CHARM boxes, fuzzy-matches `tuning/charm_names.txt`,
  relabels by class. `OCR_BACKEND` = `rapidocr` (local `rapidocr` 3.x, default) or `zai` (cloud).
  Model tunables: `OCR_REC_LANG`, `OCR_REC_VERSION`, `OCR_MODEL_TYPE`, `OCR_USE_CUDA` (default on Jetson aarch64). Other
  tunables prefixed `CHARM_*` in `config.py`.
- `model_runtime/` — `fetch`→`build`→`activate` (symlinks `models/active/`), `manifest.json`
  metadata. `models/` gitignored except `manifest.schema.json`.

The PSS TRT inference container runs separately — see `deploy/README.md`. Jetson bring-up:
`docs/jetson/QUICKSTART.md`.

## Git & versioning

SemVer in `pyproject.toml` (currently **1.2.1**); annotated tags `vX.Y.Z` on `main` only.
Work on **`develop`**; branch `feature/*`/`fix/*`/`chore/*` from there. Conventional Commits.
Roboflow `--version N` is an ML artifact version, not the app version. `CHANGELOG.md` follows
Keep a Changelog (`[Unreleased]` on `develop`). Full workflow:
vault `agents/PSS Cabinet Detection/git workflow and versioning.md`.

## Obsidian vault (`../../notes/`)

Work log and cross-session context, alongside this repo (not in git). All AI-generated content
goes in `../../notes/agents/` only — never in `00_Home/`–`99_Inbox/` (human-maintained), and the
main vault must not link into `agents/`. Session notes follow
`97_Templates/agent_session.md`, saved under `agents/` with readable filenames.
Editing main vault notes requires explicit ask; follow `agents/Main vault voice.md`.

## Session start

Before any work, read:
- `../../notes/agents/README.md`
- `../../notes/agents/cursor-plans/INDEX.md`

These give current status and active work context.

## Autonomy

Proceed without asking for: edits to Python source files, docs, tests, scripts.

Before pushing to main, ensure documentation (README, version references) is up to date.

Ask before:
- Modifying `.env`, `tuning/`, or `tuning/inference/` files
- Editing model manifests or `models/` contents
- Editing Docker / deploy configs (`deploy/`)
- Running `pss-model build` (slow, resource-intensive)
- Any `git push` or branch operations beyond local commits

## Hard limits

- Never push directly to `main`; always use `develop` or a `feature/*`/`fix/*`/`chore/*` branch
- Never commit `.env` or any file containing secrets/API keys
- Never start or stop the inference container (`inference_server.sh`) without asking
- Never modify `tuning/` files without explicit confirmation
- Never add Claude as a co-author in git commits
