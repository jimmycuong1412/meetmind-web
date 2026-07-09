# Manual Test Checklist

Run before every release. Chrome ≥ 124 with WebGPU.

## Capture targets
For each of: **MS Teams web (primary)**, Google Meet, Zoom web, YouTube (control):
- [ ] Start captures tab audio (segments appear within ~10 s of speech)
- [ ] Tab audio remains audible to the user (no mute)
- [ ] Mic toggle mixes local voice into the transcript
- [ ] Stop finalizes; transcript retained; copy + download work

## Pipeline
- [ ] First run: model download progress shown; interrupt (kill network) → restart resumes without redownloading completed files
- [ ] Insight card appears within ~90 s of continuous speech; JSON parsed into title/summary/action items
- [ ] Silence for a full tick interval → no duplicate/empty insight
- [ ] Closing the meeting tab mid-session → session stops gracefully, content retained

## Failure modes
- [ ] `--disable-features=WebGPU` → unsupported screen (no crash, no start button)
- [ ] Malformed model output (unplug… not injectable — covered by unit tests) — N/A manual

## Troubleshooting

- [ ] If the STT worker fails loading `sherpa/*`, or the offscreen document's
      audio worklet fails to load, on first manual run: re-add a
      `web_accessible_resources` entry for those paths in `manifest.config.ts`
      (removed as same-origin-only per the final whole-branch review) and file
      it as a finding.

## Results

**Initial run: PENDING** — to be executed by a human before first release (this
build has had no live browser verification; see README's verification note).

No checklist items above have been executed against a live browser or a real
meeting on MS Teams web, Google Meet, Zoom web, or YouTube. This section will be
updated with a dated pass/fail record, including the Teams-web results (the
release-blocking primary target), once a human runs the checklist.
