# Annotation Repair Demo

The sample app includes a deliberate visual issue for Agent Desktop Harness visual handoff demos.

## Broken Mode

Run the app and open:

```text
http://127.0.0.1:5179/?demoBug=overlap
```

This mode preloads a saved message and details panel, then renders an orange `Overlapping badge` over the saved message/details area. The overlap is intentional and harmless. It gives a human a clear region to mark with the annotation UI.

## Fixed Mode

Open:

```text
http://127.0.0.1:5179/?demoBug=fixed
```

This mode shows the same saved message and details content, but the badge is moved away from the content area.

## Expected Fix

For a real repair task, use `visual-handoff.md` and the referenced screenshot/crop to make a minimal targeted change. A correct fix should move the overlapping badge away from the saved message/details area, or prevent it from appearing over user content.

Do not rewrite unrelated UI. Preserve the normal sample app behavior when `demoBug` is not present.

## Verification

1. Capture a screenshot in `?demoBug=overlap` mode.
2. Annotate the overlap area and save the note.
3. Read `visual-handoff.md`.
4. Apply the targeted style or component fix.
5. Rerun the app.
6. Capture a new screenshot and compare before/after evidence.

The repository also provides a non-interactive demo:

```sh
pnpm smoke:annotation-repair
```

That smoke uses `?demoBug=overlap` and `?demoBug=fixed` to prove the handoff pipeline. It does not claim that an autonomous repair agent edited code during the smoke.
