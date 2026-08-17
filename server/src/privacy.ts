// Static privacy policy page, served at GET /privacy. Required by the Chrome
// Web Store and Firefox Add-ons listings — kept here (not a separate static
// host) so it deploys with the backend and always has a stable URL.

export const PRIVACY_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Mafsar — Privacy Policy</title>
<style>
  body { font: 16px/1.6 -apple-system, Segoe UI, Roboto, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; }
  h1 { font-size: 28px; margin-bottom: 4px; }
  h2 { font-size: 19px; margin-top: 32px; }
  p, li { color: #333; }
  .updated { color: #777; font-size: 14px; margin-bottom: 32px; }
  a { color: #0b6e77; }
  code { background: #f2f2f2; padding: 1px 5px; border-radius: 4px; font-size: 14px; }
</style>
</head>
<body>
<h1>Mafsar — Privacy Policy</h1>
<p class="updated">Last updated: August 17, 2026</p>

<p>Mafsar is a browser extension that turns your learning sessions (AI chats,
articles, or any page you capture) into flashcards, quizzes, and
spaced-repetition study material. This page explains what data the extension
and its backend collect, how it's used, and how to delete it.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Account info:</strong> if you register, your email address and a
  bcrypt-hashed password. We never store your password in plain text.</li>
  <li><strong>Study content:</strong> captured page/chat text, generated
  flashcards and quiz questions, review history (grades, intervals), exam
  dates, and study-set titles.</li>
  <li><strong>Usage metadata:</strong> timestamps of when sets and cards were
  created or reviewed, used only to schedule spaced-repetition reviews and
  compute your study streak.</li>
</ul>
<p>By default, Mafsar works fully offline using your browser's local storage.
An account is only needed if you want automatic flashcard/quiz generation or
to sync data across devices.</p>

<h2>How captured text is processed</h2>
<p>When you capture a page, chat, or selection and ask Mafsar to generate
flashcards or a quiz, that text is sent to our backend, which forwards it to a
third-party AI model provider (currently Google Gemini, Groq, or Anthropic,
depending on server configuration) solely to generate study material. That
text is not used to train models, and we do not share it for advertising or
analytics.</p>

<h2>Where data is stored</h2>
<p>Account and synced study data is stored in a hosted SQLite database (Turso)
accessed by our backend (hosted on Railway). Data is transmitted over HTTPS.
If you never create an account, your data stays only in your browser's local
storage and is never sent to us.</p>

<h2>What we don't do</h2>
<ul>
  <li>We don't sell or share your data with advertisers.</li>
  <li>We don't run analytics or tracking scripts in the extension.</li>
  <li>We don't read your AI chats or browsing activity outside of content you
  explicitly choose to capture.</li>
</ul>

<h2>Data deletion</h2>
<p>You can delete individual study sets and cards at any time from the
extension. To delete your account and all associated server-side data, email
<a href="mailto:sardoralien@gmail.com">sardoralien@gmail.com</a> from the
account's registered address and we'll remove it within 7 days.</p>

<h2>Children's privacy</h2>
<p>Mafsar is not directed at children under 13, and we do not knowingly
collect data from them.</p>

<h2>Changes to this policy</h2>
<p>If this policy changes, the "Last updated" date above will change. Material
changes will be reflected here before taking effect.</p>

<h2>Contact</h2>
<p>Questions about this policy or your data:
<a href="mailto:sardoralien@gmail.com">sardoralien@gmail.com</a></p>
</body>
</html>
`;
