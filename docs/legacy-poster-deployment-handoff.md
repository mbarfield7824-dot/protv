# PROtv legacy portrait poster assets — deployment handoff

Status: **Original ZIP review completed; owner subsequently approved revised artwork and requested implementation on 2026-10-21.**

The original montage-derived ZIP described below is superseded by the approved local revision in
`public/assets/legacy-posters/20261021/`. See [the implementation and rollback instructions](legacy-poster-implementation.md).
50 Classic Cartoons is a complete original vector rebuild, not the unfinished overlay in the original ZIP.
The other nine retain their acknowledged montage-detail limitations with cleaned borders and framing.
The dated history below is retained for provenance; it is not a claim that the original ZIP passed quality review.

The user-approved cinematic collage has been cut into ten separate JPEG preview assets at 900×1350 pixels, packaged in `protv_legacy_posters_review.zip`. These are **upscaled crops of the original generated montage**, not native 900×1350 image generations; image sharpness must be checked on Fire TV before deployment.

This GitHub branch deliberately contains only the reproducible manifest and integration instructions; binary poster JPEGs are delivered in the companion ZIP in the ChatGPT conversation, as the connected GitHub text/file interface cannot directly read image-gen attachments.

## Exact catalog mapping

| Catalog document ID | Filename |
|---|---|
| `1l1uGB4v8CaUr9p4TTGv` | `the-duke-is-tops.jpg` |
| `1uuUM2H0SzmcKeOpIe3V` | `50-classic-cartoons.jpg` |
| `2OTfk1MA9SNAJcXQajCl` | `the-battle-of-midway.jpg` |
| `3NAU6BldsmCNs9wjM08a` | `the-little-shop-of-horrors.jpg` |
| `6h3blkiA6LTeLv66jj1v` | `murder-in-harlem.jpg` |
| `9P2whdYluJRAJeI6cOuh` | `woman-on-the-run.jpg` |
| `aFRblRPxcp3LEm1lf4ye` | `jungle-book-1942.jpg` |
| `aIZ4FeTCPjuTlycMgxiK` | `angel-and-the-badman.jpg` |
| `APlVZLmiQPIczS9uEbEd` | `the-plow-that-broke-the-plains.jpg` |
| `B2MDEH2b25NknMQMEhoM` | `plan-9-from-outer-space.jpg` |

## Local VS Code handoff

1. Extract the ZIP and verify all ten JPEGs and `manifest.json`. **Do not** use the montage itself as a poster.
2. Inspect film-title matching, logos, image clarity and originality. The 50 Classic Cartoons graphic intentionally uses generic abstract ornament rather than copied trademarked cartoon characters.
3. Check each `videos` record ID is a verified legacy catalog record, not creator-supplied content. Report any uncertainty, then stop.
4. Preserve existing `posterUrl` / `thumbnailUrl` / `heroImageUrl` values in a durable rollback record. Stage the images in a controlled assets path or Firebase storage staging location; avoid hotlinking.
5. Commit assets to this **feature** branch (or an isolated poster-assets branch), run image validation and prepare a dry-run catalog update; **no production write until a separately approved review**. Map new poster URLs to `posterUrl` while leaving creators untouched.
6. Test website and Fire TV portrait rails from safe staging. If quality is inadequate because the collage was small, stop and request individually rendered native-resolution posters instead.

Do not merge, deploy, rewrite original submissions, or alter the signed TV release APK as part of asset staging.
