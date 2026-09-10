# Smart Science Paper Marking — runtime

Everything needed to run the app. Nothing else.

    index.html          the app
    vercel.json         Singapore region, 60s function limit
    package.json

    api/_shared.js      guard() — origin check, rate limit, length caps
    api/mark.js         marks an answer. Needs ANTHROPIC_API_KEY
    api/derive.js       writes a mark scheme for an unseen question
    api/read.js         reads the printed question off a photograph
    api/twin.js         generates extra practice from the context library
    api/questions.js    the question list, without the answers
    api/help.js         answers questions about the app

    marking-prompt.js   the marking rules
    science-kb.js       247 model answers
    context-library.js  approved everyday situations for generated practice
    misconceptions.js   42 common mix-ups
    syllabus-p3p5.js    P3-P6 topics and their exclusions

    chin-*.png liz-*.png cat-*.png   the three buddies

## Deploy

1. Push all of this to the repo, keeping `api` as a folder.
2. Vercel: framework preset **Other**, no build command.
3. Environment variables: `ANTHROPIC_API_KEY`, and `ALLOWED_ORIGIN`
   set to the deployed URL.

## Note

`context-library.js` is required by `api/twin.js`. Without it the twin
endpoint fails at import time — practice generation stops working.

The design files, specs and source documents live separately and are not
needed to run the app.

## Members only

Access is for people whose Stripe payment has completed, or whom the admin lets
in for free. A member signs in with a one-time link sent to their registered
email; the browser then holds a signed session and sends it with every call.
The lock is **off** until both `ACCESS_LOCK=on` and `SESSION_SECRET` are set,
so the app keeps working while the pieces are configured.

    api/access.js          session check · redeem a link · request a new link
    api/stripe-webhook.js  Stripe → grant on paid checkout, revoke on refund or
                           cancelled subscription. Signature verified.
    api/admin.js           grant · revoke · resend · list, behind ADMIN_KEY
    admin.html             a small page for the admin to do the above

Environment variables, in Vercel:

    ACCESS_LOCK            on   (anything else leaves the app open)
    SESSION_SECRET         long random string, e.g. `openssl rand -base64 48`
    ADMIN_KEY              long random string, at least 16 characters
    STRIPE_WEBHOOK_SECRET  from the webhook endpoint in the Stripe dashboard
    RESEND_API_KEY         from resend.com; MAIL_FROM must be on a verified domain
    MAIL_FROM              e.g. Science Marking <hello@yourdomain.com>
    APP_URL                https://smart-science-paper-marking-app.vercel.app
    KV_REST_API_URL        set by the Upstash for Redis integration
    KV_REST_API_TOKEN      set by the Upstash for Redis integration

Stripe: add a webhook endpoint pointing at `/api/stripe-webhook` and send it
`checkout.session.completed`, `customer.subscription.deleted` and
`charge.refunded`. The Payment Link on the website must collect an email
address, which it does by default.

Testing before turning the lock on: leave `ACCESS_LOCK` unset, open
`/admin.html`, grant yourself access and check the email arrives. Then set
`ACCESS_LOCK=on` and redeploy.

## Session reports

While the lock is on, everything a member does in one sitting is recorded
against their account — questions added, pages photographed, answers written,
what the app showed back — and mailed to the registered email and the guardian's
email when the window closes or an hour passes with nothing done. Records expire
after 48 hours.

    api/log.js         POST: one event per action, the photographed pages, and "end".
                       GET with CRON_SECRET: the sweep that mails any session quiet
                       for an hour. vercel.json runs it daily; any scheduler can call
                       it more often with an `x-cron-key: <CRON_SECRET>` header.

The guardian email is set on admin.html when granting access, or from the app's
progress screen by someone holding the device's parent code.

    CRON_SECRET        long random string, at least 16 characters

## Speak instead of typing

Every box a pupil types into has a "Say it instead" button. It uses the
browser's own speech recognition (Chrome, Edge, Safari), pinned to English, and
appends the spoken words to the box. No audio reaches the server; whatever is
submitted is ordinary text, so marking and the session record are unchanged.

## The lab (members only)

`lab.html` is the experiment library: every activity in the Primary 4 book,
rewritten in our own words, with predict, test and explain steps. Records live in
`labs-p4.js`; `api/lab.js` serves them without model answers and marks the
written steps (actions list, get, mark). Both sit behind the same member
session as everything else. `labs/observation-a` and `labs/observation-b` are
reserved for the observation-skills work.

Three rules for the lab:

- Vercel's Hobby plan allows 12 serverless functions. `api/` holds 11. Add a
  new action to an existing route rather than a new file.
- Every activity carries `cc21` and `skills` tags in the skillset-map
  vocabulary, and moves soon → review → ready. "review" shows only on a device
  unlocked with the parent code, so each animation is looked over first.
- No school is named anywhere — records, pages, simulations, questions, answers.
