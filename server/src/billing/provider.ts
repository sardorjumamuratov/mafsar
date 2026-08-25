import type { DB } from "../db.js";

export type PlanName = "free" | "plus" | "pro";

export type WebhookOutcome =
  | { kind: "invalid_signature" }
  | { kind: "ignored" }
  | { kind: "plan_change"; customerId: string; plan: PlanName };

export interface BillingProvider {
  readonly name: "stripe" | "paddle";
  configured(): boolean;
  /** Returns the URL to open in a tab. */
  createCheckout(args: {
    db: DB; userId: string; email: string; plan: "plus" | "pro"; origin: string;
  }): Promise<string>;
  /** Returns the URL to open in a tab. Throws NoSubscriptionError if none. */
  createPortal(args: { db: DB; userId: string; origin: string }): Promise<string>;
  /** Verifies the signature and classifies the event. Must NOT touch the DB. */
  handleWebhook(rawBody: string, signature: string): Promise<WebhookOutcome>;
}

export class NoSubscriptionError extends Error {}
