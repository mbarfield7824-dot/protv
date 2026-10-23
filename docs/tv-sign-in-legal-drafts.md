# Draft privacy and terms wording: sign-in on TVs

**Draft for owner (and counsel) review. Not published.** Prepared 2026-10-23
for Roku on-device sign-in (Roku certification 2.2). Replace bracketed items.

## Privacy policy: additions

### Signing in on a TV

> You can sign in to PROtv, or create a free account, directly on a
> supported TV app such as PROtv for Roku. You type your email address and
> password with the TV's on-screen or voice keyboard. The TV sends them over
> an encrypted connection to PROtv, which checks them with our
> authentication provider (Google Firebase) and signs the TV in. PROtv does
> not store your password on the TV or on PROtv's servers; it is held by our
> authentication provider in protected form.
>
> **Your Roku account email.** When you choose Sign in or Create account on
> Roku, Roku may ask whether you want to share the email address on your Roku
> account with PROtv. If you agree, Roku gives us that email address only to
> fill in the sign-in form, and you can change it before continuing. If you
> decline, you type your email instead. We do not receive other Roku account
> details for this purpose.
>
> **Staying signed in.** After you sign in, the TV keeps a sign-in token in
> the PROtv app's private storage on that TV, so you stay signed in after
> restarting. Signing out on the TV deletes it. You can also end every
> session by changing your password.
>
> **Watching as a guest.** Without signing in, a TV keeps your recent watch
> progress (up to 50 titles) only on that TV so you can resume. It is not sent
> to PROtv and is replaced by your account's progress when you sign in.

### Account data (update to the existing "information we use" section)

> When you sign in, PROtv stores your My List and your watch progress
> (Continue Watching: the title, your position and when you last watched) with
> your account so they stay in sync between the web and your TVs.

### Security and abuse prevention

> To protect accounts, PROtv limits repeated sign-in, sign-up and password
> reset attempts. For this we keep short-lived counters keyed by a one-way
> hash of the email address and of the network address. We do not keep the
> email or address itself for this purpose, and the counters expire within
> about an hour.

### Your choices and rights

> You can ask us to access or delete your account data by emailing
> support@watchprotv.com. [Self-service deletion: see the account deletion
> plan; add the link here once it exists.] We keep account data while your
> account is open and delete it [within N days] after deletion, except where
> we must keep records for legal reasons.

### Children

> PROtv is not directed to children under 13, and we do not knowingly collect
> personal information from them. If you believe a child has created an
> account, contact support@watchprotv.com and we will delete it.

### Who we are

> PROtv is operated by Prophecy Entertainment LLC, [postal address]. Contact:
> support@watchprotv.com.

## Terms of use: additions

> **Accounts on TVs.** You may sign in to or create your PROtv account in a
> supported TV app. You are responsible for activity on devices where you are
> signed in; sign out on shared TVs. A TV sign-in gives access to viewing
> features (such as My List and Continue Watching) only; account management,
> creator tools and administrative features are available only on
> watchprotv.com.
>
> **Creating an account on a TV** has the same terms as creating one on
> watchprotv.com. We send a verification email to the address you enter.

## Roku listing notes

- Answer **Yes** to the sign-in question; give the reviewer a dedicated
  non-admin test account (email and password) in the submission notes.
- The app asks for the Roku account email through Roku's own request screen
  (getUserData); only email is requested.
