import { getSettings, saveSettings } from "../storage/store.js";

const $ = (id) => document.getElementById(id);

async function load() {
  const s = await getSettings();
  $("reminders").checked = !!s.reminders;
  $("remindTime").value = s.remindTime || "19:00";
}

async function save() {
  await saveSettings({
    reminders: $("reminders").checked,
    remindTime: $("remindTime").value || "19:00",
  });
  const status = $("status");
  status.textContent = "✓ Saved";
  setTimeout(() => (status.textContent = ""), 2000);
}

$("save").addEventListener("click", save);
load();
