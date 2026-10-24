# PROtv Privacy Policy — full replacement draft

**DRAFT for owner and counsel review. Not published. Not legal advice.**
Prepared 2026-10-23 for the Roku 1.0.0 submission. Replaces the text of
watchprotv.com/privacy (frontend/src/pages/Privacy.jsx, effective
September 16, 2026) once approved. Items in [brackets] need an owner decision
or fact that is not in the project records.

---

**Effective [date of publication]**

PROtv ("PROtv", "we", "us") is a free streaming service operated by Prophecy
Entertainment LLC, [postal address]. This policy explains what information we
collect on watchprotv.com and in PROtv apps on TVs (such as PROtv for Roku),
how we use it, and your choices. Contact: support@watchprotv.com.

## Information we collect

**Account information.** When you create an account we keep your email
address and, on the website, the display name you choose. Your password is
handled by our authentication provider (Google Firebase) in protected form;
PROtv does not store it.

**Viewing features.** When you are signed in we store your My List and your
watch progress (the title, your position and when you last watched) with your
account, so Continue Watching stays in sync between the website and your TVs.

**Watching as a guest on a TV.** Without signing in, a PROtv TV app keeps your
recent watch progress (up to 50 titles) only on that TV so you can resume. It
is not sent to PROtv and is replaced by your account's progress when you sign
in.

**Signing in on a TV.** You can sign in, create a free account or reset your
password directly in a PROtv TV app, typing with the TV's on-screen or voice
keyboard. The TV sends your email and password over an encrypted connection
to PROtv, which checks them with Firebase and signs the TV in. The TV keeps a
sign-in token in the app's private storage so you stay signed in after
restarting; signing out on the TV deletes it.

**Your Roku account email.** When you choose Sign in or Create account on
Roku, Roku may ask whether to share the email address on your Roku account
with PROtv. If you agree, it is used only to fill in the sign-in form and you
can change it before continuing. If you decline, you type your email instead.
We do not receive other Roku account details for this purpose.

**Security and abuse prevention.** To protect accounts we limit repeated
sign-in, sign-up and password-reset attempts using short-lived counters keyed
by a one-way hash of the email address and of the network address. We do not
keep the email or network address itself for this purpose, and the counters
expire within about an hour.

**Creators.** If you submit work through PROtv Creators, we keep the
information you provide for the submission and the agreement you sign through
our e-signature provider. [Owner: confirm retention period for creator
records.]

**Technical information.** Our hosting, video and app platforms receive
standard technical data needed to deliver the service, such as network
address, device and app type, and playback quality information.

**Advertising on the website.** watchprotv.com shows ads served by Google
AdSense, which may use cookies or similar technologies to show and measure
ads, including personalized ads where permitted. You can manage personalized
ads at https://adssettings.google.com. [Owner: confirm current AdSense
settings and any consent banner used in regions that require one.] The PROtv
Roku app shows no ads.

## How we use information

To operate PROtv, sign you in and keep you signed in, sync My List and
Continue Watching, secure accounts and prevent abuse, provide support, and
improve the service. **We do not sell personal information** and do not share
it for cross-context behavioral advertising except as described for Google
AdSense on the website.

## Service providers

We rely on providers that process information only to deliver their services
to us: Google Firebase (authentication and database), Vercel (hosting), Mux
(video streaming), Google AdSense (website ads), and our e-signature provider
for creator agreements. [Owner: confirm the list is complete, including any
email or analytics provider.]

## Retention and deletion

We keep account data while your account is open. To access or delete your
account and its data, email support@watchprotv.com from your account's email
address (the PROtv TV app shows this on its Account screen). We delete
account data within [30] days of a verified request, except records we must
keep for legal reasons. [Add the self-service deletion link once it exists;
see docs/account-deletion-plan.md.]

## Children

PROtv is not directed to children under 13, and we do not knowingly collect
personal information from them. If you believe a child has created an
account, contact support@watchprotv.com and we will delete it.

## Your rights

Depending on where you live, you may have rights to access, correct, delete
or obtain a copy of your information, and to opt out of certain processing.
Contact support@watchprotv.com; we will respond as required by applicable law.

## Changes

We will post changes here with a new effective date.
