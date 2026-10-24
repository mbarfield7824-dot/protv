# PROtv Privacy Policy — full replacement draft (review copy 2)

**DRAFT for owner and counsel review. Not published. Not legal advice.**
Revised 2026-10-23 after checking each statement against the production code
(see REVIEW.md for the source of every fact). Replaces the text of
watchprotv.com/privacy (frontend/src/pages/Privacy.jsx, effective
September 16, 2026) once approved. **[Bracketed]** items are owner or counsel
decisions; REVIEW.md lists them with a recommendation for each.

---

**Effective [date of publication]**

PROtv ("PROtv", "we", "us") is a free streaming service operated by Prophecy
Entertainment LLC, [postal address]. This policy explains what information we
collect on watchprotv.com and in PROtv apps on TVs (such as PROtv for Roku),
how we use it, and the choices you have. Questions:
support@watchprotv.com.

## Information we collect

**Account information.** When you create an account we keep your email
address and, on the website, the display name you choose. Your password is
handled by our authentication provider, Google Firebase, in protected form;
PROtv does not store it. We send a verification email when you create an
account.

**My List and watch progress.** When you are signed in we store your My List
and your watch progress (the title, your position and when you last watched)
with your account, so Continue Watching stays in sync between the website and
your TVs.

**Watching as a guest on a TV.** Without signing in, a PROtv TV app keeps your
recent watch progress (up to 50 titles) only on that TV so you can resume. It
is not sent to PROtv, and it is replaced by your account's progress when you
sign in.

**Signing in on a TV.** You can sign in, create a free account or reset your
password directly in a PROtv TV app, typing with the TV's on-screen or voice
keyboard. The TV sends your email and password over an encrypted connection to
PROtv, which checks them with Firebase and signs the TV in. The TV keeps a
sign-in token in the app's private storage so you stay signed in after
restarting; signing out on the TV deletes it.

**Activating a TV with a code.** Some PROtv TV apps show a short code that you
enter at watchprotv.com/activate while signed in. This links that TV to your
account.

**Your Roku account email.** When you choose Sign in or Create account on
Roku, Roku may ask whether to share the email address on your Roku account
with PROtv. If you agree, it is used only to fill in the sign-in form, and you
can change it before continuing. If you decline, you type your email instead.
We do not receive other Roku account details for this purpose.

**Safety reports and messages.** If you report content or contact us, we keep
what you send, such as your email address, the content you are reporting and
your description, to review and respond.

**Creators.** If you submit work through PROtv Creators, we keep the
information you provide for the submission and the agreement you sign
through our e-signature provider.

**Security and abuse prevention.** To protect accounts we limit repeated
sign-in, sign-up and password-reset attempts using short-lived counters keyed
by a one-way hash of the email address and of the network address. We do not
keep the email or network address itself for this purpose, and the counters
expire within about an hour.

**Usage and device information.** Our hosting, video and app platforms receive
standard technical data needed to deliver the service, such as network
address, device, browser or app type, and playback quality. On the website:

- **Vercel Analytics** measures page visits in aggregate.
- **Mux**, our video provider, measures playback quality (for example start
  time, buffering and errors) together with the title being watched.

**Advertising on the website.** watchprotv.com shows ads from **Google
AdSense**, which may use cookies or similar technologies to show and measure
ads, including personalized ads where permitted. The website can also play
video ads before a title, using Google's IMA technology and an ad network
[name the network if video ads are switched on; they are off today]. Learn
about and manage Google's ad personalization at
https://adssettings.google.com. **The PROtv Roku app shows no ads.**

## How we use information

To operate PROtv; sign you in and keep you signed in; sync My List and
Continue Watching; secure accounts and prevent abuse; review reports and
answer messages; understand and improve performance; and show ads on the
website. **We do not sell personal information for money.**
[Counsel: advertising cookies on the website may count as "sharing" or "sale"
under some US state laws; see REVIEW.md decision 4.]

## Service providers

Providers process information on our behalf only to deliver their services:
Google Firebase (sign-in, email verification and password-reset emails,
database, file storage), Vercel (hosting and analytics), Mux (video delivery
and playback quality), Google (AdSense and, if enabled, video ads), and our
e-signature provider for creator agreements. Roku operates the Roku platform
under its own privacy policy.

## Retention and deletion

We keep account data while your account is open. To access or delete your
account and its data, email support@watchprotv.com from your account's email
address. The PROtv TV app shows this on its Account screen. We delete account
data within [30] days of a verified request, except records we must keep for
legal reasons. Safety reports and creator records are kept [for as long as
needed to handle them and meet legal obligations]. [Add the self-service
deletion link once it exists; see docs/account-deletion-plan.md.]

## Children

PROtv is not directed to children under 13, and we do not knowingly collect
personal information from them. If you believe a child has created an
account, contact support@watchprotv.com and we will delete it.

## Your rights

Depending on where you live, you may have rights to access, correct, delete or
get a copy of your information, and to opt out of certain processing. Contact
support@watchprotv.com and we will respond as applicable law requires.

## Changes

We will post changes here with a new effective date.
