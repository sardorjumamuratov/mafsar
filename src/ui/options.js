import { getSettings, saveSettings } from "../storage/store.js";
import { PROVIDERS, providerDefaultModel } from "../llm/generate.js";

const $ = (id) => document.getElementById(id);

function keyHintFor(provider) {
  const p = PROVIDERS[provider] || PROVIDERS.gemini;
  const free = provider === "anthropic" ? "" : " (free, no credit card)";
  return `Get a ${p.label} key${free}: <a href="${p.consoleUrl}" target="_blank" rel="noopener">${p.consoleUrl}</a>`;
}

function applyProvider(provider, modelValue) {
  $("keyHint").innerHTML = keyHintFor(provider);
  // Fill model with the stored value if present, else the provider default.
  $("model").value = modelValue || providerDefaultModel(provider);
}

async function load() {
  const s = await getSettings();
  $("provider").value = s.provider || "gemini";
  $("apiKey").value = s.apiKey || "";
  applyProvider($("provider").value, s.model);
}

$("provider").addEventListener("change", () => {
  // Switching provider swaps the default model (drop any old provider's model).
  applyProvider($("provider").value, "");
});

async function save() {
  await saveSettings({
    provider: $("provider").value,
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim(),
  });
  const status = $("status");
  status.textContent = "✓ Saved";
  setTimeout(() => (status.textContent = ""), 2000);
}

$("save").addEventListener("click", save);
load();
