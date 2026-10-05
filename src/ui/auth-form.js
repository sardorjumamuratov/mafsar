// The sign-in screen's rules, with nothing browser-specific so they can be
// tested on their own: what each mode says, whether the form may be sent, and
// how a failure is worded. (views/you.js draws the screen.)

/** What changes between the two modes: only these labels (nothing moves). */
export const MODES = {
  login: {
    button: "Sign in",
    placeholder: "Your password",
    autocomplete: "current-password",
    question: "New to Mafsar?",
    switchLabel: "Create account",
    forgot: true,
  },
  register: {
    button: "Create account",
    placeholder: "At least 8 characters",
    autocomplete: "new-password",
    question: "Have an account?",
    switchLabel: "Sign in",
    forgot: false,
  },
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Whether the form may be sent. Returns the first problem as
 * `{ field: "email" | "password", message }`, or null. The server's schema
 * takes the same email and an 8-character password for both signing in and
 * registering, so a shorter one can never be right in either mode.
 */
export function validateAuth(mode, email, password) {
  if (!EMAIL.test(String(email || "").trim())) return { field: "email", message: "Enter a valid email." };
  if (!password && mode === "login") return { field: "password", message: "Enter your password." };
  if (String(password || "").length < 8) return { field: "password", message: "Use at least 8 characters." };
  return null;
}

/**
 * A failed sign-in or sign-up, in words, with the field it belongs under.
 * The client throws `Error(code)` with `.code` and `.serverMessage` set
 * (sync/auth.js); a server code like "invalid_credentials" must never be what
 * the learner reads.
 * @param {Error & { code?: string, serverMessage?: string }} err
 * @param {"login" | "register"} mode
 * @returns {{ field: "email" | "password", message: string }}
 */
export function authErrorMessage(err, mode) {
  const code = err?.code || err?.message || "";
  switch (code) {
    case "invalid_credentials":
      return { field: "password", message: "Wrong email or password." };
    case "email_taken":
      return { field: "email", message: "An account with this email already exists. Try signing in." };
    case "validation":
      return { field: "email", message: "Enter a valid email." };
    case "signup_limit":
      return { field: "password", message: err.serverMessage || "Too many accounts were created from this network today. Try again tomorrow." };
    case "rate_limited":
      return { field: "password", message: err.serverMessage || "Too many attempts. Try again in a few minutes." };
  }
  const text = String(err?.message || "");
  if (/failed to fetch|networkerror|load failed/i.test(text)) {
    return { field: "password", message: "You're offline. Check your connection and try again." };
  }
  // A sentence (the request timed out, …) reads fine as it is; a bare code doesn't.
  if (/\s/.test(text) && !/^Request failed/.test(text)) return { field: "password", message: text };
  return { field: "password", message: mode === "register" ? "Couldn't create your account. Try again." : "Couldn't sign in. Try again." };
}
