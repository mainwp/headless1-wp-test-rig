# Headless WordPress test rig

A deliberately small decoupled front end for a WordPress site, built to answer
one question: **what does a site-management dashboard get wrong when the public
site is no longer served by WordPress?**

Next.js 16 (App Router) + WPGraphQL. No Faust, no Apollo, no codegen. Every
request to WordPress goes through one 150-line file so you can see exactly what
is being asked for and what came back.

## What's in here

```
src/lib/wp.ts                  every WordPress call, in one place
src/app/page.tsx               post listing, ISR, renders its own timestamp
src/app/posts/[slug]/page.tsx  single post, ISR
src/app/api/revalidate/        on-demand cache busting (the piece that matters)
src/app/api/debug/             is WordPress reachable? what was the last error?
wordpress/mu-plugins/          the two files that make WordPress headless
```

Two details worth knowing before you start:

- **Every page prints the time it was rendered.** In a headless setup the gap
  between "the dashboard says the update applied" and "a visitor sees it" is the
  interesting failure, and it is invisible unless you make it visible.
- **Nothing throws when WordPress is unreachable.** You get an empty page and a
  logged error at `/api/debug`. A rig that hard-crashes when the backend is
  behind basic auth tells you less than one that reports why.

---

## Step 1 — WordPress side

On whichever test site you pick as the backend:

1. Confirm the MainWP Child connection works **before** changing anything. You
   want a known-good baseline.
2. Install **WPGraphQL** (free, wordpress.org). Confirm `https://your-site.com/graphql`
   responds — a bare GET returns a GraphQL error message, which is success.
3. Leave the WordPress URL exactly where it is. Most guides tell you to migrate
   WordPress to `cms.example.com` first. You do not need to, and it costs an
   afternoon of search-replace. Give the *front end* a new subdomain instead.

Don't install the mu-plugins yet — that's Step 4.

---

## Step 2 — Get the front end running

Two paths. **Path A needs nothing installed on your machine.** Pick that one
unless you want to poke at the code.

### Path A — no local setup at all

1. Create an empty repo on GitHub.
2. Push this folder to it (or upload the zip contents through the GitHub web UI —
   "Add file" → "Upload files" — it accepts a drag of the whole directory).
3. Go to vercel.com → **Add New** → **Project** → import the repo.
4. In the import screen, add the environment variables from `.env.example`:

   | Variable | Value |
   |---|---|
   | `WORDPRESS_API_URL` | `https://your-wp-site.com/graphql` |
   | `NEXT_PUBLIC_SITE_URL` | the Vercel URL, filled in after the first deploy |
   | `REVALIDATE_SECRET` | any long random string |
   | `NEXT_PUBLIC_REVALIDATE_SECONDS` | `600` while testing |

5. Deploy. You get a live URL in about a minute.

That's a working headless front end with zero local tooling. If you later want
to edit the code without installing anything, press `.` on the GitHub repo page
to open github.dev, or open a Codespace — both run in the browser.

**On Cloudflare instead of Vercel:** Workers runs Next.js through the OpenNext
adapter (`npx @opennextjs/cloudflare@latest`), and it works, but it is one more
moving part between you and the thing you are actually testing. Get the Vercel
version green first, then port it if you want everything under your own
Cloudflare account.

### Path B — locally on Omarchy

Omarchy is Arch-based and ships `mise`, so:

```bash
mise use -g node@22
node -v        # expect v22.x
```

If `mise` isn't there, `sudo pacman -S nodejs npm` gives you a recent enough Node.

Then:

```bash
cd headless-test
cp .env.example .env.local
$EDITOR .env.local          # set WORDPRESS_API_URL at minimum
npm install
npm run dev
```

Open `http://localhost:3000`, and `http://localhost:3000/api/debug` to confirm
it is really talking to WordPress.

One caveat: running the front end on localhost is fine for checking that the
GraphQL queries work, but it is **not** a headless setup. MainWP can't reach
localhost, so none of the interesting tests are possible until it's deployed on
a public URL. Treat local as an optional detour.

---

## Step 3 — Point a subdomain at it

In Cloudflare DNS, add `front.your-domain.com` as a CNAME to the Vercel target
(Vercel gives you the exact record when you add the domain in project settings).

Set `NEXT_PUBLIC_SITE_URL` to that subdomain and redeploy.

At this point you have a WordPress site *and* a separate front end. **You are not
headless yet** — and this is the state most "headless WordPress" tutorials leave
you in. Every front-end-facing check in MainWP would still pass, because
WordPress is still happily serving its own theme.

---

## Step 4 — Actually go headless

Copy both files from `wordpress/mu-plugins/` into `wp-content/mu-plugins/` on the
backend. No activation step — mu-plugins load automatically.

Then in `wp-config.php`, above the "stop editing" line:

```php
define( 'HEADLESS_PUBLIC_URL',        'https://front.your-domain.com' );
define( 'HEADLESS_REVALIDATE_URL',    'https://front.your-domain.com/api/revalidate' );
define( 'HEADLESS_REVALIDATE_SECRET', 'the-same-string-as-REVALIDATE_SECRET' );
```

`headless-redirect.php` sends public front-end traffic to the front end.
`headless-revalidate.php` pings the front end when content changes, so the
public site stops serving a stale build.

### The one thing to read before you install it

The redirect plugin refuses to touch any request that isn't a plain GET, and
bails out on anything carrying MainWP parameters. That is not defensive
boilerplate — it is the whole reason the Child connection survives. The MainWP
Child plugin answers on the site root, so a naive `template_redirect` that
redirects everything will 302 the dashboard's POST and break the connection.

That is worth knowing because **a real-world headless plugin may well do exactly
that.** If you want to see the failure mode for yourself, comment out the
`REQUEST_METHOD` guard in `headless_rig_request_is_exempt()` and watch what
MainWP reports. It's a more useful five minutes than any of the happy-path
tests.

---

## Step 5 — The test matrix

Add the site to MainWP and work through it. Sort what you find into three
buckets, because they need different fixes:

**Wrong** — feature points at the WordPress URL when it should point at the
public one. A Public URL field fixes these.

- Uptime monitoring
- SSL certificate checks
- Page speed / Lighthouse
- Broken Links Checker
- SEO extension
- Client Reports screenshots, "Visit site" links
- Sitemap-driven tooling

**Meaningless** — feature operates on something no visitor touches anymore.
A Public URL field does *not* fix these; they probably need hiding.

- Cache Control (the real cache is now ISR/CDN on the front end)
- Maintenance / optimization
- Anything measuring WordPress front-end performance

**Silently stale** — feature reports success but the public site hasn't changed.

- Publish or edit a post through MainWP, then load the front end. With
  `NEXT_PUBLIC_REVALIDATE_SECONDS=600` you have ten minutes of watching the
  dashboard say "done" while visitors see the old version.
- Then install `headless-revalidate.php` and repeat. The gap closes.
- Now do the same for a **plugin update** run. The mu-plugin hooks
  `upgrader_process_complete`, but ask whether that is really the dashboard's
  job or the site's.

**Connection** — run these separately, they're the most likely real-world
blocker and have nothing to do with the front end:

- Put HTTP basic auth on the WordPress host. Does the Child still connect?
- Put Cloudflare Access in front of `/wp-admin`. Does it?
- Restrict `/wp-json` or the root POST endpoint by IP. Does it?

## Notes

- `wp-content/uploads` is served by the web server, not WordPress, so images keep
  working through the redirect. Media URLs will still point at the WordPress
  host — that's normal, and it's also a thing MainWP-side tooling may assume.
- The redirect exempts logged-in users, so you can always view the WordPress
  front end yourself when something looks wrong.
- Redirects are 302, not 301, so nothing gets cached while you're still changing
  your mind.
