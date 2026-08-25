// Builds store-ready zips for both browsers from the single source manifest.
//
//   node tools/build.mjs        -> dist/mafsar-chrome-<v>.zip, dist/mafsar-firefox-<v>.zip
//
// Why a build step in a "no build step" project: the two stores want mutually
// exclusive manifest keys. Chrome MV3 rejects `background.scripts`; Firefox
// warns on `sidePanel` / `side_panel` / `background.service_worker`. Shipping
// one combined manifest means warnings on both sides, so we tailor each.
//
// Zips are written with a minimal writer rather than a shell tool because
// PowerShell's Compress-Archive emits backslash entry names, which AMO rejects.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, crc32 } from "node:zlib";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const source = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8"));

/** Icon sizes that ship inside the package (512 + masters are listing-only). */
const SHIPPED_ICONS = ["icon16.png", "icon32.png", "icon48.png", "icon96.png", "icon128.png"];

/**
 * Sources that only belong in one browser's package. Currently none: splitting
 * the chrome.sidePanel call into a Firefox-excluded module silenced two linter
 * warnings but broke the Chrome toolbar button, because the async import lost
 * the race with service worker teardown. Working code beat a clean lint.
 */
const EXCLUDE = { firefox: [], chrome: [] };

function chromeManifest(m) {
  const out = structuredClone(m);
  // Firefox-only keys.
  delete out.sidebar_action;
  delete out.browser_specific_settings;
  // Chrome MV3 accepts only service_worker + type here.
  delete out.background.scripts;
  return out;
}

function firefoxManifest(m) {
  const out = structuredClone(m);
  // Chrome-only keys — Firefox drives the same UI through sidebar_action.
  delete out.side_panel;
  delete out.background.service_worker;
  out.permissions = out.permissions.filter((p) => p !== "sidePanel");
  return out;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Collect [zipPath, contents] pairs for one browser's package. */
function collect(manifest, target) {
  const files = [["manifest.json", /** @type {any} */ (Buffer).from(JSON.stringify(manifest, null, 2) + "\n", "utf8")]];
  for (const full of walk(join(ROOT, "src"))) {
    const rel = relative(ROOT, full).split(sep).join("/");
    if (EXCLUDE[target].includes(rel)) continue;
    files.push([rel, readFileSync(full)]);
  }
  for (const name of SHIPPED_ICONS) {
    files.push([`icons/${name}`, readFileSync(join(ROOT, "icons", name))]);
  }
  return files;
}

function dosDateTime(d = new Date()) {
  return {
    time: ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f),
    date: (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0xf) << 5) | (d.getDate() & 0x1f),
  };
}

function zip(files, outPath) {
  const { time, date } = dosDateTime();
  const local = [];
  const central = [];
  let offset = 0;

  for (const [name, data] of files) {
    const nameBuf = /** @type {any} */ (Buffer).from(name, "utf8");
    const deflated = deflateRawSync(data);
    const store = deflated.length >= data.length;
    const payload = store ? data : deflated;
    const method = store ? 0 : 8;
    const crc = crc32(data);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(payload.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, payload);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(payload.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + payload.length;
  }

  const centralBuf = /** @type {any} */ (Buffer).concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  writeFileSync(outPath, /** @type {any} */ (Buffer).concat([...local, centralBuf, end]));
}

mkdirSync(DIST, { recursive: true });

for (const [label, manifest] of [
  ["chrome", chromeManifest(source)],
  ["firefox", firefoxManifest(source)],
]) {
  const files = collect(manifest, label);

  // Unpacked directory — what chrome://extensions "Load unpacked" and
  // about:debugging want. Only this build's own outputs are cleared, so
  // sibling artifacts in dist/ (screenshots, store copy) survive a rebuild.
  const dir = join(DIST, label);
  rmSync(dir, { recursive: true, force: true });
  for (const [name, data] of files) {
    const dest = join(dir, name);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
  }

  const out = join(DIST, `mafsar-${label}-${source.version}.zip`);
  zip(files, out);
  const kb = (statSync(out).size / 1024).toFixed(1);
  console.log(
    `${label.padEnd(8)} ${String(files.length).padStart(2)} files  ${kb.padStart(5)} KB  ->  ` +
    `${relative(ROOT, out)}  +  ${relative(ROOT, dir)}/`
  );
}
