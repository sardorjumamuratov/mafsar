# Store listing copy

Everything the Firefox (AMO) and Chrome Web Store submission forms ask for.
Kept in the repo because `dist/` is gitignored and gets cleaned by builds.

Build the packages first:

```bash
node tools/build.mjs
```

- Firefox upload → `dist/mafsar-firefox-<version>.zip`
- Chrome upload → `dist/mafsar-chrome-<version>.zip`
- Screenshots → `dist/screenshots/` (regenerate with the harness; see below)

## Form answers

| Field | Value |
|---|---|
| Name | Mafsar — AI Chat to Quiz |
| Category | Education (alt: Productivity) |
| License | All Rights Reserved (see [LICENSE](../LICENSE)) |
| Privacy policy | Yes — text below; also live at `/privacy` |
| Uses minifier/bundler/template engine? | **No** — see build note below |
| Support email | sardoralien@gmail.com |

## Summary (short)

Turn your AI chat learning sessions into flashcards, quizzes, and
spaced-repetition reviews so you don't forget what you learned.

## Description

Mafsar captures what you learn — from ChatGPT, Claude, Gemini, an article, or
any page you select — and turns it into study material automatically.

- Save any page or chat with one right-click.
- Get flashcards and a multiple-choice quiz generated from the content.
- Review on a spaced-repetition schedule (SM-2) so material resurfaces right
  before you'd forget it.
- Set an exam date and Mafsar works backwards into a daily target.
- See which concepts you keep missing.
- Works offline; sign in to sync across devices.

## Notes to Reviewer

```
Test account (sign in on the first-launch screen, or the "You" tab):
  Email:    amo-reviewer@mafsar.app
  Password: MafsarReview!2026

An account is required because flashcard generation runs server-side.

To test: sign in, open any article or AI chat, then right-click -> "Save page
to Mafsar". Flashcards and a quiz are generated within ~10 seconds and appear
under the "Sets" tab.

Build note: no minifier, bundler, or transpiler is used. All JavaScript in this
package is byte-identical to the public source at
https://github.com/sardorjumamuratov/mafsar

A small script (tools/build.mjs) produces the package. Its only effect on
content is removing three Chrome-only manifest keys that Firefox does not
support: side_panel, background.service_worker, and the sidePanel permission.
No code is generated or transformed.
```

## Privacy policy (paste into the AMO text area)

```
Mafsar collects only what it needs to generate and sync your study material.
The full policy is also published at:
https://mafsar-production.up.railway.app/privacy

WHAT WE COLLECT

* Account info: if you register, your email address and a bcrypt-hashed
  password. We never store your password in plain text.
* Study content: page or chat text you explicitly capture, the flashcards and
  quiz questions generated from it, your review history (grades, intervals),
  exam dates, and study-set titles.
* Usage metadata: timestamps of when sets and cards were created or reviewed,
  used only to schedule spaced-repetition reviews and compute your streak.

Mafsar works fully offline using your browser's local storage. An account is
only required for automatic flashcard/quiz generation and cross-device sync.

HOW CAPTURED TEXT IS PROCESSED

When you capture a page, chat, or selection and ask Mafsar to generate
flashcards or a quiz, that text is sent to our backend, which forwards it to a
third-party AI model provider solely to generate study material. That text is
not used to train models, and it is never shared for advertising or analytics.

WHAT WE DO NOT COLLECT

Mafsar only ever reads content you explicitly choose to capture, by clicking
"Save to Mafsar" or using the right-click menu. It does not monitor your
browsing, read pages in the background, or collect anything from sites you
have not acted on. There are no analytics or tracking scripts in the extension.

WHERE DATA IS STORED

Account and synced study data is stored in a hosted SQLite database (Turso),
accessed by our backend hosted on Railway. All data is transmitted over HTTPS.
If you never create an account, your data stays only in your browser's local
storage and is never sent to us.

WHAT WE NEVER DO

* We do not sell or share your data with advertisers.
* We do not run analytics or tracking in the extension.
* We do not read your AI chats or browsing activity outside content you
  explicitly capture.

DATA DELETION

You can delete individual study sets and cards at any time from the extension.
To delete your account and all associated server-side data, email
sardoralien@gmail.com from the account's registered address and we will remove
it within 7 days.

CHILDREN'S PRIVACY

Mafsar is not directed at children under 13, and we do not knowingly collect
data from them.

CONTACT

Questions about this policy or your data: sardoralien@gmail.com
```

## Chrome Web Store — extra fields

CWS asks for things AMO doesn't. The Privacy tab is where submissions usually
stall: every permission needs its own written justification.

**Single purpose**

```
Mafsar turns learning material the user explicitly saves — AI chat
conversations, articles, or selected text — into flashcards and quizzes, and
schedules them for spaced-repetition review.
```

**Permission justifications** (one per permission; CWS rejects vague answers)

| Permission | Justification |
|---|---|
| `storage` | Stores the user's study sets, flashcards, review schedule and settings locally so the extension works offline. |
| `activeTab` | Reads the text of the current tab only when the user explicitly clicks "Save to Mafsar" or the right-click menu item. No background access. |
| `scripting` | Injects a one-off text-extraction function into the active tab in response to that same user action, to read the article or conversation being saved. |
| `sidePanel` | The entire study interface (flashcards, review, quizzes) is rendered in Chrome's side panel. |
| `contextMenus` | Adds the "Save page to Mafsar" and "Save selection to Mafsar" right-click items, the primary way users capture content. |
| `alarms` | Schedules the optional daily study reminder at the time the user chooses. |
| `notifications` | Shows the daily reminder and confirms how many flashcards were generated after a capture. |
| Host: `chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com` | Content scripts add a "Save to Mafsar" button and read the conversation on those pages when the user clicks it. |
| Host: `mafsar-production.up.railway.app` | The extension's own backend — handles sign-in, flashcard generation, and cross-device sync. |

**Remote code** — answer **No**. The extension calls a web API but never
loads or executes remotely-hosted code; all JavaScript ships in the package.

**Data usage disclosures** — tick: *Personally identifiable information*
(email, for the account) and *User activity / website content* (only pages the
user explicitly captures). Then certify all three statements: data is not sold
to third parties, not used outside the single purpose, and not used to
determine creditworthiness or for lending.

**Assets**

| Asset | Size | File |
|---|---|---|
| Store icon | 128×128 | `icons/icon128.png` |
| Screenshots (1–5) | 1280×800 | `dist/screenshots/light-*.png` |
| Small promo tile (optional) | 440×280 | `dist/screenshots/promo-440x280.png` |

## Data collection permissions

Declared in `manifest.json` under `browser_specific_settings.gecko`. The AMO
form asks the same question separately — the answers must match:

| Declared | Why |
|---|---|
| `authenticationInfo` | Account email + password for sign-in |
| `personallyIdentifyingInfo` | Email address stored on the account |
| `websiteContent` | Page/chat text the user explicitly captures |
