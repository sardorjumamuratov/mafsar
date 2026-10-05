// The sign-in screen (the "Redesign the Sign-in screen" prompt): one 24px edge,
// one filled button per state, sentence-case labels, Geist everywhere but the
// wordmark, and inline errors instead of toasts. The logic is pure and tested
// here; the pixel positions are measured in the harness.
// Run: node tests/signin.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { validateAuth, authErrorMessage, MODES } from "../src/ui/auth-form.js";

const root = path.join(import.meta.dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");
// Tests are queued and run one after another, awaited, so an async test that
// fails is reported as a failure (a bare try/catch around an async function
// would call it "ok" and let the rejection surface later).
let failures = 0;
const queue = [];
const test = (name, fn) => queue.push([name, fn]);

// --- validation -------------------------------------------------------------
test("a bad email is refused first, under the email field", () => {
  for (const email of ["", "   ", "nobody", "a@b", "a b@c.de", "@c.de"]) {
    assert.deepEqual(validateAuth("login", email, "longenough"), { field: "email", message: "Enter a valid email." }, email);
  }
});

test("a good email passes, whitespace around it is ignored", () => {
  assert.equal(validateAuth("login", "  me@example.com ", "longenough"), null);
  assert.equal(validateAuth("register", "me@example.com", "12345678"), null);
});

test("a short password is refused in both modes (the server's schema needs 8)", () => {
  for (const mode of ["login", "register"]) {
    assert.deepEqual(validateAuth(mode, "me@example.com", "1234567"), { field: "password", message: "Use at least 8 characters." });
  }
});

test("an empty password in sign-in mode asks for it, not for 8 characters", () => {
  assert.deepEqual(validateAuth("login", "me@example.com", ""), { field: "password", message: "Enter your password." });
  assert.deepEqual(validateAuth("register", "me@example.com", ""), { field: "password", message: "Use at least 8 characters." });
});

// --- server errors, in words --------------------------------------------------
const err = (code, serverMessage) => Object.assign(new Error(code), { code, serverMessage });

test("server codes never reach the screen raw", () => {
  assert.deepEqual(authErrorMessage(err("invalid_credentials"), "login"), { field: "password", message: "Wrong email or password." });
  assert.deepEqual(authErrorMessage(err("email_taken"), "register"), { field: "email", message: "An account with this email already exists. Try signing in." });
  for (const code of ["validation", "rate_limited", "signup_limit", "unauthorized", "something_new"]) {
    const m = authErrorMessage(err(code), "login").message;
    assert.doesNotMatch(m, /^[a-z_]+$/, `${code} showed as "${m}"`);
  }
});

test("a rate limit shows the server's own sentence when it sent one", () => {
  const m = authErrorMessage(err("rate_limited", "Too many failed sign-ins for this email. Try again in a few minutes."), "login");
  assert.equal(m.message, "Too many failed sign-ins for this email. Try again in a few minutes.");
});

test("offline and timeouts say so", () => {
  assert.match(authErrorMessage(new Error("Failed to fetch"), "login").message, /offline|connection/i);
  const timeout = new Error("The request timed out. Check your connection and try again.");
  assert.equal(authErrorMessage(timeout, "login").message, timeout.message);
});

test("the two modes only differ in their labels", () => {
  assert.equal(MODES.login.button, "Sign in");
  assert.equal(MODES.register.button, "Create account");
  assert.equal(MODES.login.placeholder, "Your password");
  assert.equal(MODES.register.placeholder, "At least 8 characters");
  assert.deepEqual([MODES.login.question, MODES.login.switchLabel], ["New to Mafsar?", "Create account"]);
  assert.deepEqual([MODES.register.question, MODES.register.switchLabel], ["Have an account?", "Sign in"]);
  assert.equal(MODES.login.forgot, true);
  assert.equal(MODES.register.forgot, false);
});

// --- Cancel really cancels ------------------------------------------------------
// Cancel used to be checked only between polls, so pressing it while Google's
// request was still starting did nothing, and the Google tab opened anyway.
global.chrome = { storage: { local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb(), remove: (k, cb) => cb && cb() } }, runtime: { getManifest: () => ({ version: "0.0.0" }) } };
const { googleSignIn } = await import("../src/sync/auth.js");

async function cancelDuringStart(honoursAbort) {
  const ac = new AbortController();
  let tabOpened = false;
  const realFetch = global.fetch;
  global.fetch = (url, opts = {}) => new Promise((resolve, reject) => {
    // The start request answers a little later; a real fetch also stops when aborted.
    const t = setTimeout(() => resolve(new Response(JSON.stringify({ authUrl: "https://accounts.example/x", pollId: "p", pollToken: "t" }), { status: 200 })), 60);
    if (honoursAbort) opts.signal?.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("The operation was aborted."), { name: "AbortError" })); });
  });
  try {
    const run = googleSignIn({ onTab: () => { tabOpened = true; }, cancelSignal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    const err = await run.then(() => null, (e) => e);
    return { err, tabOpened };
  } finally { global.fetch = realFetch; }
}

test("Cancel while the request is starting stops it and opens no tab", async () => {
  const { err, tabOpened } = await cancelDuringStart(true);
  assert.ok(err, "should reject");
  assert.equal(tabOpened, false);
  assert.ok(err.name === "AbortError" || err.message === "cancelled", err.message);
});

test("even if the request answers anyway, a cancelled sign-in opens no tab", async () => {
  const { err, tabOpened } = await cancelDuringStart(false);
  assert.equal(tabOpened, false);
  assert.equal(err?.message, "cancelled");
});

test("the screen treats an aborted request as the learner's own Cancel, not an error", () => {
  const you2 = read("src/ui/views/you.js");
  const catchBlock = you2.slice(you2.indexOf("export async function authGoogle"), you2.indexOf("export async function afterSignIn"));
  assert.match(catchBlock, /e\.name !== ['"]AbortError['"]/);
});

// --- the markup and its styles ------------------------------------------------
const you = read("src/ui/views/you.js");
const css = read("src/ui/panel.css");
const gate = you.slice(you.indexOf("// ===== SIGN-IN SCREEN"), you.indexOf("export async function afterSignIn"));
const rule = (sel) => { const m = css.match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}")); return m ? m[1].replace(/\s+/g, " ") : ""; };

test("the gate section exists", () => assert.ok(gate.length > 1000));

test("copy: tagline, footer, wordmark halves", () => {
  assert.match(gate, /Turn your AI chats into flashcards, quizzes and spaced-repetition review\./);
  assert.match(gate, /Your sets sync across devices through your account\./);
  assert.match(gate, /Maf<span>sar<\/span>/);
});

test("labels are sentence case, with no uppercase styling", () => {
  assert.match(gate, />Email</);
  assert.match(gate, />Password</);
  assert.doesNotMatch(gate, />EMAIL<|>PASSWORD</);
  assert.doesNotMatch(rule(".signin-label"), /uppercase/);
});

test("no old card, buttons or toasts on the gate", () => {
  assert.doesNotMatch(gate, /class="block"|btn-ghost|btn-primary|btn-block|or-divider/);
  assert.doesNotMatch(gate, /toast\(/, "form errors are inline, never toasts");
});

test("exactly one filled button, and it is the submit", () => {
  assert.equal((gate.match(/class="signin-primary"/g) || []).length, 1);
  assert.match(gate, /<button type="submit" class="signin-primary"/);
});

test("layout: 24px edge, top-anchored block at 180px with a 32px gap", () => {
  assert.match(rule(".signin"), /padding: 0 24px 28px/);
  assert.match(rule(".signin-main"), /flex: 1/);
  assert.match(rule(".signin-main"), /justify-content: flex-start/);
  assert.match(rule(".signin-main"), /padding-top: 180px/);
  assert.match(rule(".signin-main"), /gap: 32px/);
  assert.match(rule(".signin-auth"), /gap: 20px/);
  assert.match(rule(".signin-form"), /gap: 14px/);
});

test("the Google button, inputs and primary button have the specified boxes", () => {
  assert.match(rule(".signin-google"), /height: 50px/);
  assert.match(rule(".signin-google"), /border-radius: 14px/);
  assert.match(rule(".signin-input"), /height: 48px/);
  assert.match(rule(".signin-input"), /border-radius: 12px/);
  assert.match(rule(".signin-input"), /border: 0/);
  assert.match(rule(".signin-input"), /box-shadow: inset 0 0 0 1px var\(--border-control\)/);
  assert.match(rule(".signin-input:focus"), /inset 0 0 0 1px var\(--accent\)/);
  assert.match(rule('.signin-input[aria-invalid="true"]'), /var\(--danger-text\)/);
  assert.match(rule(".signin-primary"), /height: 50px/);
  assert.match(rule(".signin-primary"), /font-size: 16px/);
  assert.match(rule(".signin-primary"), /font-weight: 650/);
});

test("the wordmark is the only serif", () => {
  assert.match(rule(".signin-wordmark"), /font-family: ui-serif/);
  assert.match(rule(".signin-wordmark"), /font-size: 34px/);
  const gateCss = css.slice(css.indexOf("/* --- Sign-in screen"));
  assert.equal((gateCss.match(/font-family: ui-serif/g) || []).length, 1);
  assert.doesNotMatch(gateCss, /ui-monospace|font-family: (system-ui|Arial)/);
});

test("waiting for Google swaps in place: spinner, 'Waiting for Google…', and the form dims", () => {
  assert.match(gate, /Waiting for Google…/);
  assert.match(gate, /Finish in the Google window\./);
  assert.match(css, /\.signin-auth\.is-waiting \.signin-form\s*\{[^}]*opacity: \.4;[^}]*pointer-events: none/);
  assert.match(rule(".signin-spin"), /width: 18px/);
  assert.match(rule(".signin-spin"), /animation: spin \.8s linear infinite/);
});

test("Cancel is a text button in the divider row, not inside the Google button", () => {
  assert.match(gate, /class="signin-cancel"[^>]*data-action="auth-google-cancel"/);
  assert.doesNotMatch(gate.slice(gate.indexOf('id="googleBtn"'), gate.indexOf("</button>", gate.indexOf('id="googleBtn"'))), /auth-google-cancel/);
});

test("Forgot? stays in layout in create mode (hidden, not removed), so nothing moves", () => {
  assert.match(css, /\.signin-forgot\[hidden\]|\.signin-forgot\.is-off\s*\{[^}]*visibility: hidden/);
});

for (const [name, fn] of queue) {
  try { await fn(); console.log("ok  ", name); }
  catch (e) { failures++; console.log("FAIL", name, "\n     ", String(e.message).split("\n")[0]); }
}
if (failures) { console.log(`\n${failures} failing`); process.exit(1); }
console.log("\nPASS sign-in");
