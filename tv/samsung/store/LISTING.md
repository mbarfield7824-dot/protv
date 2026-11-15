# Samsung Apps TV Seller Office — PROtv listing draft (owner review)

Nothing has been entered in Seller Office or submitted. Items marked **OWNER** need the owner.

## App

- **Name:** PROtv
- **Publisher / seller:** Prophecy Entertainment LLC (**OWNER**: Seller Office partner account)
- **Package ID / App ID:** `PROtvTizen` / `PROtvTizen.PROtv` (fixed once uploaded)
- **Version:** 1.0.0
- **Category (recommended):** Video
- **Price:** Free to watch at launch. Version 1.0.0 shows no ads and has no in-app purchases. Do **not** describe
  PROtv as ad-free: future versions may add ad-supported viewing and an optional subscription (each needs a
  listing, privacy-policy and, for purchases, Samsung Checkout update first).
- **Supported TVs (declare):** Samsung Smart TVs with **Tizen 4.0 or later (2018 models and newer)**,
  1920x1080 UI. Final model years depend on the emulator/TV pass in `CERTIFICATION-CHECKLIST.md`.
- **Countries (recommended):** United States first. The Samsung catalog contains only worldwide-cleared
  titles (`docs/samsung-rights-2026-11-14.md`), so more countries are rights-safe; adding them is an
  **OWNER** decision (language, support coverage, privacy law).
- **Age rating (recommended):** the questionnaire answer that covers horror and crime thrillers
  (The Lost Camp, CAESAR III, Curtain Call): a teen/mature rating is the conservative choice. **OWNER** answers.

## Short description

Free movies and original films from independent creators. Sign in with your phone to sync My List and Continue Watching.

## Description

PROtv is a free streaming service from Prophecy Entertainment LLC, built around original work from
independent filmmakers and open-licensed cinema.

Watch PROtv Creator originals — thrillers, crime dramas, horror and Black Cinema — alongside celebrated
open movies such as Big Buck Bunny, Sintel and Tears of Steel. New titles are added as they are cleared
for Samsung TVs.

Sign in with your phone or computer — no typing passwords with the remote — to keep My List and Continue
Watching in sync with watchprotv.com. No account? Watch as a guest; your progress stays on your TV.

Filmmakers can submit their work at watchprotv.com/creators.

## URLs and contacts

- Privacy policy: https://watchprotv.com/privacy (**publish the updated policy first**, as for Roku)
- Terms: https://watchprotv.com/terms
- Support: support@watchprotv.com, https://watchprotv.com/contact
- Support phone, administrative and technical contacts: **OWNER**

## Artwork

Seller Office asks for icons at 1920x1080 and 512x423, a 1920x1080 background, four screenshots
(JPEG < 500 KB, 1280x720 or 1920x1080) and an App UI Description file (`store/APP-UI-DESCRIPTION.md`, to be
copied into Samsung's template).

- App icon 512x423 PNG: `store/app-icon-512x423.png` (same file as `app/icon.png`).
- App icon 1920x1080 PNG: `store/app-icon-1920x1080.png`; background 1920x1080 PNG:
  `store/background-1920x1080.png` (both from `tools/art-1080.html`, `node tools/render-art.mjs --seller`).
- Screenshots 1920x1080 JPEG: `store/screenshots/01-home.jpg`, `02-rows.jpg`, `03-details.jpg`,
  `04-search.jpg`, `05-categories.jpg`. These are **browser-preview captures of the real app with live
  production data**, not TV captures. Re-capture on the emulator/TV before submission if Samsung
  requires device captures; they show only Samsung-cleared titles.

## Reviewer account and activation instructions (for the "Test information" field)

**OWNER**: create a dedicated PROtv reviewer account (email + password) on watchprotv.com. Do not reuse
a personal or admin account (TV sessions are restricted from admin routes, but keep it separate).

> PROtv can be used without an account. To test sign-in: open PROtv > Account (left menu) >
> "Sign in with phone or computer". The TV shows an 8-character code. On any phone or computer, open
> https://watchprotv.com/activate, sign in with the reviewer account below, and enter the code. The TV
> signs in within a few seconds. My List: open any title > "My List". Continue Watching: play a title for
> 30 seconds, press Back; it appears first on Home. Sign out: Account > Sign out.
> Reviewer email: **OWNER**  Password: **OWNER**

## Before submitting (blocking)

1. Deploy the backend Samsung rule (the release app shows no titles until then).
2. Sign the package with the Samsung distributor certificate (Tizen Studio profile `PROtv`). The current
   distributor certificate is a DUID-bound public-level certificate listing only the emulator DUID. Confirm in
   Seller Office which signed package it expects at upload (not verified from Samsung docs). Every future
   update must be signed with the **same author certificate**, so back up
   `C:\Users\Owner\SamsungCertificate\PROtv` (author.p12 + password) offline before submitting.
3. Pass `CERTIFICATION-CHECKLIST.md` on the emulator (done 2026-11-15, see results) and at least one
   physical TV (not done).
4. Account sign-in, My List and progress sync against production (not testable on the isolated backend).
5. Owner approval to submit. **Do not submit without it.**
