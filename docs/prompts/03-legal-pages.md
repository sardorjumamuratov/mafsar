# 03 — Terms, refund policy, and a pricing section (Paddle domain review)

**Depends on:** nothing.

**Touches:** new `server/src/legal.ts`, `server/src/app.ts`,
`server/src/privacy.ts`, `landing/index.html`, `src/ui/views/you.js`, and new
`server/tests/legal.test.ts`.

> ## ⚠ Owner: fill this in before handing the prompt to an agent
>
> | Value | Fill in |
> |---|---|
> | Legal name: the registered business, or your full legal name as a sole proprietor | `FILL_IN_LEGAL_NAME` |
> | Country whose law governs the Terms | `FILL_IN_COUNTRY` |
>
> Replace both `FILL_IN_…` strings in the `SELLER` block in Step 2a with the
> real values.
>
> **Agent:** if either value still reads `FILL_IN_…`, stop and ask the owner.
> Never invent a legal name or a jurisdiction.
>
> These pages are a sensible starting template, **not legal advice**. The owner
> should have them reviewed.

## Why

Paddle takes payments on Mafsar's behalf as the merchant of record, but only after
its domain review. That review checks the site
([Paddle: Domain review](https://www.paddle.com/help/start/account-verification/what-is-domain-verification))
for:

- **Terms and Conditions, a Refund Policy and a Privacy Policy**, "clearly
  accessible via navigation on your website".
- **The company name, or the sole proprietor's brand,** in the Terms.
- **Pricing details** and a clear description of the product.
- **HTTPS.**

Today the server only has `/privacy`, and the landing page shows no prices.

---

## Step 1 — Write the tests (they should fail)

Create `server/tests/legal.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { openDB, migrate } from "../src/db.js";
import { createApp } from "../src/app.js";
import { SELLER } from "../src/legal.js";
import { PLANS } from "../src/billing/core.js";

// Paddle's domain review checks these pages exist, link to each other from the
// site's navigation, and name the seller. The pricing assertions keep the
// public page in step with the limits the server actually enforces.

async function app() {
  const db = openDB(":memory:");
  await migrate(db);
  return createApp(db);
}
const file = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const landing = () => file("../../landing/index.html");

describe("seller details", () => {
  it("are filled in (never ship a placeholder legal name)", () => {
    expect(SELLER.legalName).not.toMatch(/FILL_IN|TODO|\{\{/);
    expect(SELLER.country).not.toMatch(/FILL_IN|TODO|\{\{/);
    expect(SELLER.legalName.trim().length).toBeGreaterThan(2);
    expect(SELLER.supportEmail).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});

describe("GET /terms", () => {
  it("serves the terms, naming the seller and Paddle as merchant of record", async () => {
    const res = await (await app()).request("/terms");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain(SELLER.legalName);
    expect(html).toContain("Merchant of Record");
    expect(html).toContain('href="/refund"');
    expect(html).toContain('href="/privacy"');
    expect(html).toContain("Last updated");
  });
});

describe("GET /refund", () => {
  it("serves the refund policy with its 14-day window", async () => {
    const res = await (await app()).request("/refund");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("14 days");
    expect(html).toContain(SELLER.legalName);
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });
});

describe("GET /privacy", () => {
  it("links to the other two legal pages", async () => {
    const html = await (await (await app()).request("/privacy")).text();
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/refund"');
  });
});

describe("landing page", () => {
  it("links all three legal pages from the footer navigation", () => {
    const footer = landing().split('<footer class="site-foot">')[1] ?? "";
    expect(footer).toContain('href="/terms"');
    expect(footer).toContain('href="/refund"');
    expect(footer).toMatch(/href="[^"]*\/privacy"/);
  });

  it("shows pricing that matches the limits the server enforces", () => {
    const html = landing();
    const plans = [...html.matchAll(
      /data-plan="(\w+)" data-price="([^"]*)" data-window="(\w*)" data-set="(\w+)" data-coding="(\w+)" data-practice="(\w+)"/g
    )].map((m) => ({ plan: m[1], price: m[2], window: m[3], set: m[4], coding: m[5], practice: m[6] }));
    expect(plans.map((p) => p.plan)).toEqual(["free", "plus", "pro"]);
    const show = (n: number | null) => (n === null ? "unlimited" : String(n));
    for (const p of plans) {
      const limits = PLANS[p.plan];
      expect(p.window).toBe(limits.window ?? "");
      expect(p.set).toBe(show(limits.set));
      expect(p.coding).toBe(show(limits.coding));
      expect(p.practice).toBe(show(limits.practice));
    }
  });

  it("shows the same prices as the extension's upgrade screen", () => {
    const html = landing();
    const price = (plan: string) => html.match(new RegExp(`data-plan="${plan}" data-price="([^"]+)"`))?.[1];
    expect(file("../../src/ui/views/you.js")).toContain(`Plus ${price("plus")}, Pro ${price("pro")}`);
  });
});

describe("extension upgrade screen", () => {
  it("links the terms and refund policy next to the prices", () => {
    const you = file("../../src/ui/views/you.js");
    expect(you).toContain("/terms");
    expect(you).toContain("/refund");
  });
});
```

Run it and confirm it fails:

```bash
cd server && npx vitest run tests/legal.test.ts
```

---

## Step 2 — Implement

### 2a. Create `server/src/legal.ts`

Set `updated` to today's date, written like `September 14, 2026`.

```ts
// Terms and refund policy, served at GET /terms and GET /refund. Paddle's domain
// review requires Terms, a Refund Policy and a Privacy Policy reachable from the
// site's navigation, with the seller's name in the Terms. Kept beside
// privacy.ts so all three deploy with the backend at stable URLs.

export const SELLER = {
  /** Registered business name, or the sole proprietor's legal name. Paddle checks the Terms show it. */
  legalName: "FILL_IN_LEGAL_NAME",
  /** Country whose law governs the Terms. */
  country: "FILL_IN_COUNTRY",
  supportEmail: "sardoralien@gmail.com",
  updated: "FILL_IN_TODAY",
};

const escHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

/** Shared by all three legal pages: Paddle wants them reachable from each other. */
export const LEGAL_NAV =
  '<nav class="legal-nav" aria-label="Legal"><a href="/">Mafsar</a> · <a href="/terms">Terms</a> · <a href="/refund">Refund policy</a> · <a href="/privacy">Privacy policy</a></nav>';

function legalPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mafsar — ${title}</title>
<style>
  body { font: 16px/1.6 -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 19px; margin-top: 32px; }
  p, li { color: #333; }
  .updated { color: #777; font-size: 14px; margin-bottom: 32px; }
  .legal-nav { font-size: 14px; margin-bottom: 24px; }
  a { color: #0b6e77; }
</style>
</head>
<body>
${LEGAL_NAV}
<h1>Mafsar — ${title}</h1>
<p class="updated">Last updated: ${escHtml(SELLER.updated)}</p>
${body}
</body>
</html>
`;
}

const name = escHtml(SELLER.legalName);
const country = escHtml(SELLER.country);
const email = escHtml(SELLER.supportEmail);
const mail = `<a href="mailto:${email}">${email}</a>`;

export const TERMS_HTML = legalPage("Terms of Service", `
<p>These terms govern your use of Mafsar: the browser extension, its website and
its backend service (together, "Mafsar"). Mafsar is operated by
<strong>${name}</strong> ("we", "us"). By creating an account or using Mafsar you
agree to these terms. If you don't agree, don't use Mafsar.</p>

<h2>1. The service</h2>
<p>Mafsar turns content you choose to capture (AI chat answers, web pages,
selections) into flashcards, quizzes and spaced-repetition reviews. Study
material is generated by third-party AI models, as described in our
<a href="/privacy">Privacy Policy</a>.</p>

<h2>2. Your account</h2>
<ul>
  <li>You need a free account to use Mafsar. Give accurate information and keep
  your password secret. You're responsible for activity on your account.</li>
  <li>An account is for one person. Don't share it, and don't create several
  accounts to get around usage limits.</li>
  <li>You must be at least 13 years old, and old enough to consent to data
  processing in your country.</li>
</ul>

<h2>3. Acceptable use</h2>
<p>Don't use Mafsar to break the law or infringe anyone's rights. Don't try to
disrupt, overload or gain unauthorised access to the service. Don't access the API
other than through the extension, or resell access to it.</p>

<h2>4. Your content</h2>
<p>You keep ownership of what you capture and create. You give us permission to
store and process it only as needed to run Mafsar for you, including sending it
to AI providers to generate study material. You're responsible for having the
right to capture and use the content you save.</p>

<h2>5. AI-generated material</h2>
<p>Flashcards, quizzes, grades and feedback are generated automatically and can be
wrong or incomplete. Check anything important against a reliable source. Nothing
Mafsar generates is professional advice (medical, legal, financial or
otherwise).</p>

<h2>6. Plans, payment and cancellation</h2>
<p>Mafsar offers a free plan and paid subscriptions. Current plans, limits and
prices are shown on our <a href="/#pricing">pricing section</a> and in the
extension.</p>
<p>Our order process is conducted by our online reseller Paddle.com. Paddle.com is
the Merchant of Record for all our orders. Paddle provides all customer service
inquiries and handles returns.</p>
<ul>
  <li>Subscriptions renew automatically each billing period until you cancel.</li>
  <li>You can cancel at any time from the extension (You tab → Manage
  subscription). You keep paid features until the end of the period you've paid
  for.</li>
  <li>Prices exclude taxes, which Paddle calculates at checkout. If we change a
  price, we'll tell you at least 30 days before it applies to your
  subscription.</li>
</ul>

<h2>7. Refunds</h2>
<p>See our <a href="/refund">Refund Policy</a>.</p>

<h2>8. Changes to the service</h2>
<p>We may change, add or remove features and usage limits. If a change
significantly reduces what a paid plan includes, we'll tell you in advance, and
you may cancel and request a refund for the unused part of your current
period.</p>

<h2>9. Ending your use</h2>
<p>You can delete your account at any time. We may suspend or close accounts that
break these terms, and where we reasonably can, we'll tell you why first.</p>

<h2>10. Disclaimer and liability</h2>
<p>Mafsar is provided "as is", without warranties of any kind, to the extent the
law allows. To the extent the law allows, our total liability to you for any claim
is limited to the amount you paid us in the 12 months before the claim. Nothing in
these terms limits rights you have under consumer-protection law that can't be
waived.</p>

<h2>11. Governing law</h2>
<p>These terms are governed by the laws of ${country}, without depriving you of
the protection of mandatory consumer laws in the country where you live.</p>

<h2>12. Changes to these terms</h2>
<p>If we change these terms, we'll update the date above. For material changes,
we'll give notice before they take effect.</p>

<h2>13. Contact</h2>
<p>${name} · ${mail}</p>
`);

export const REFUND_HTML = legalPage("Refund Policy", `
<p>Mafsar's paid plans are sold through Paddle.com, our Merchant of Record, on
behalf of <strong>${name}</strong>. This policy explains when you can get your
money back.</p>

<h2>14-day refunds</h2>
<p>If you're not happy, you can get a <strong>full refund of any subscription
charge</strong>, whether a first payment or a renewal, if you ask within
<strong>14 days</strong> of that charge. You don't need to give a reason.</p>

<h2>How to request a refund</h2>
<ul>
  <li>Use the link in your Paddle receipt email, or find your order at
  <a href="https://paddle.net">paddle.net</a>; or</li>
  <li>Email ${mail} from your account's email address, with your receipt or order
  number.</li>
</ul>
<p>Refunds go back to your original payment method. How long they take to appear
depends on your bank or card provider.</p>

<h2>After 14 days</h2>
<p>After 14 days, charges aren't refundable, except where the law requires
otherwise or where section 8 of our <a href="/terms">Terms</a> applies. You can
cancel at any time to stop future renewals, and you keep paid features until the
end of the period you've paid for.</p>

<h2>Consumer rights</h2>
<p>If you live in the EU, the UK or another country that gives consumers a right
to withdraw from online purchases, this policy doesn't reduce that right.</p>

<h2>Free plan</h2>
<p>The free plan is never charged.</p>

<p>See also our <a href="/privacy">Privacy Policy</a>.</p>
`);
```

### 2b. `server/src/app.ts`

Add `TERMS_HTML` and `REFUND_HTML` to the imports:

```ts
import { TERMS_HTML, REFUND_HTML } from "./legal.js";
```

Find:

```ts
  app.get("/privacy", (c) => c.html(PRIVACY_HTML));
```

Replace with:

```ts
  app.get("/privacy", (c) => c.html(PRIVACY_HTML));
  // Paddle's domain review requires both, reachable from the site's navigation.
  app.get("/terms", (c) => c.html(TERMS_HTML));
  app.get("/refund", (c) => c.html(REFUND_HTML));
```

### 2c. `server/src/privacy.ts`: link the other legal pages

Add at the top of the file, after the header comment:

```ts
import { LEGAL_NAV } from "./legal.js";
```

In the `<style>` block, add this line just before `</style>`:

```css
  .legal-nav { font-size: 14px; margin-bottom: 24px; }
```

Find `<h1>Mafsar — Privacy Policy</h1>` and put `${LEGAL_NAV}` on its own line
directly above it. `PRIVACY_HTML` is already a template literal, so the
interpolation works. Change nothing else in this file.

### 2d. `landing/index.html`: pricing section

**CSS.** Inside the page's `<style>` block, insert this immediately before the line
that starts `/* --- privacy`:

```css
/* --- pricing --------------------------------------------------- */
.pricing { padding-block: var(--s7); border-top: 1px solid var(--line); }
.plans { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s4); margin-top: var(--s4); }
.plan { border: 1px solid var(--line); border-radius: 14px; padding: var(--s4); display: flex; flex-direction: column; gap: var(--s3); }
.plan h3 { margin: 0; color: var(--ink); }
.plan .price { margin: 0; font-size: 2rem; font-weight: 700; color: var(--ink); }
.plan .price span { font-size: 1rem; font-weight: 500; opacity: .7; }
.plan ul { margin: 0; padding-left: 1.1rem; display: flex; flex-direction: column; gap: .35rem; }
.plans-note { margin-top: var(--s4); font-size: .9rem; opacity: .8; }
@media (max-width: 760px) { .plans { grid-template-columns: minmax(0, 1fr); } }
```

**Section.** Find the comment `<!-- Privacy -->` and insert this immediately above
it. Keep the attribute order on each `<article>` exactly as written: the test
reads them in that order.

```html
  <!-- Pricing -->
  <section class="pricing" id="pricing" aria-labelledby="pricing-title">
    <div class="wrap">
      <p class="eyebrow">Pricing</p>
      <h2 id="pricing-title">Start free, upgrade when you study more</h2>
      <div class="plans">
        <article class="plan" data-plan="free" data-price="$0" data-window="month" data-set="3" data-coding="3" data-practice="10">
          <h3>Free</h3>
          <p class="price">$0</p>
          <ul>
            <li>3 study sets generated per month</li>
            <li>3 coding exercises per month</li>
            <li>10 practice gradings per month</li>
          </ul>
        </article>
        <article class="plan" data-plan="plus" data-price="$2/month" data-window="day" data-set="10" data-coding="10" data-practice="10">
          <h3>Plus</h3>
          <p class="price">$2<span>/month</span></p>
          <ul>
            <li>10 study sets generated per day</li>
            <li>10 coding exercises per day</li>
            <li>10 practice gradings per day</li>
            <li>Backup export and restore</li>
          </ul>
        </article>
        <article class="plan" data-plan="pro" data-price="$6/month" data-window="" data-set="unlimited" data-coding="unlimited" data-practice="unlimited">
          <h3>Pro</h3>
          <p class="price">$6<span>/month</span></p>
          <ul>
            <li>Unlimited study set generation</li>
            <li>Unlimited coding exercises and practice gradings</li>
            <li>Backup export and restore</li>
          </ul>
        </article>
      </div>
      <p class="plans-note">Prices in USD. Taxes are calculated at checkout by Paddle, our reseller. Cancel any time. <a href="/refund">Refund policy</a> · <a href="/terms">Terms of Service</a></p>
    </div>
  </section>

```

**Footer.** In `<footer class="site-foot">`, find:

```html
      <a href="https://mafsar-production.up.railway.app/privacy" target="_blank" rel="noopener">Privacy policy</a>
```

Replace with:

```html
      <a href="/#pricing">Pricing</a>
      <a href="/terms">Terms</a>
      <a href="/refund">Refund policy</a>
      <a href="https://mafsar-production.up.railway.app/privacy" target="_blank" rel="noopener">Privacy policy</a>
```

### 2e. `src/ui/views/you.js`: link the terms beside the prices

Find the text `Plus $2/month, Pro $6/month</div>`. It closes the `PLAN_COPY`
template literal. Replace it with:

```js
Plus $2/month, Pro $6/month · <a href="${esc(LANDING_BASE)}/terms" target="_blank" rel="noopener">Terms</a> · <a href="${esc(LANDING_BASE)}/refund" target="_blank" rel="noopener">Refunds</a></div>
```

If `you.js` doesn't already import `LANDING_BASE`, add
`import { LANDING_BASE } from "../../config.js";`. Check that `esc` is imported
from `../core.js` (it is today).

---

## Verification

```bash
cd server && npx vitest run && npx tsc --noEmit
```

```bash
for f in tests/*.test.mjs; do node "$f" > /dev/null || echo "FAIL $f"; done
```

```bash
node tools/build.mjs
```

Then start the server locally (`cd server && npm run dev`) and open these, and
say in your report whether each renders and links correctly:

- `http://localhost:8787/terms`
- `http://localhost:8787/refund`
- `http://localhost:8787/privacy`
- `http://localhost:8787/#pricing`, checked at a phone width as well

## Report

- Diffs, and the test output (failing first, then passing).
- Whether `PLANS` has any environment overrides set in production. You can't see
  Railway, so say so. The owner must check that `FREE_*` and `PLUS_*` variables in
  Railway don't contradict the pricing section.

---

## For the owner, after deploying

1. Open `/terms`, `/refund` and `/privacy` on the production domain and read them
   once, as the seller.
2. In Paddle, submit `mafsar-production.up.railway.app` for **domain review**.
3. If Railway sets any `FREE_*` or `PLUS_*` limit overrides, update the pricing
   section to match. Otherwise the page advertises limits the server doesn't use.
