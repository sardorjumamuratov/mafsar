export const DELETE_CONFIRM_WORD = "DELETE";

export function canConfirmDeletion({ typed, password, hasPassword }) {
  if (typed?.trim() !== DELETE_CONFIRM_WORD) return false;
  if (hasPassword && !String(password || "")) return false;
  return true;
}

/** A message the person can act on, from the server's error body and status. */
export function deletionErrorMessage(data, status) {
  if (data?.error === "wrong_password") return "That password isn't right.";
  if (data?.error === "billing_cancel_failed") {
    return data.message || "We couldn't cancel your subscription, so nothing was deleted.";
  }
  if (status === 401) return "Your session expired. Sign in again, then delete your account.";
  return data?.message || `Couldn't delete your account (${status}).`;
}
