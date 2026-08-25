import { type BillingProvider } from "./provider.js";
import { stripeProvider } from "./stripe.js";
import { paddleProvider } from "./paddle.js";

export * from "./core.js";
export * from "./provider.js";
export * from "./stripe.js";
export * from "./paddle.js";

export function getProvider(name?: string): BillingProvider {
  const providerName = name || process.env.BILLING_PROVIDER || "paddle";
  if (providerName === "stripe") return stripeProvider;
  if (providerName === "paddle") return paddleProvider;
  throw new Error(`Unknown BILLING_PROVIDER: ${providerName}`);
}

export function billingConfigured(): boolean {
  try {
    return getProvider().configured();
  } catch {
    return false;
  }
}
