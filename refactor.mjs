import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function walk(dir) {
  for (const file of readdirSync(dir)) {
    const full = join(dir, file);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (full.endsWith('.js') || full.endsWith('.ts') || full.endsWith('.mjs')) {
      let content = readFileSync(full, 'utf8');
      
      const relToRoot = relative(__dirname, dirname(full));
      const depth = relToRoot === '' ? 0 : relToRoot.split(sep).length;
      const back = depth > 0 ? '../'.repeat(depth) : './';
      
      let changed = false;
      content = content.replace(/import (\{.*?\}) from ".*?\/srs\.js";/g, (m, p1) => {
        changed = true;
        return `import ${p1} from "${back}shared/srs.js";`;
      });
      content = content.replace(/import (\{.*?\}) from ".*?\/readiness\.js";/g, (m, p1) => {
        changed = true;
        return `import ${p1} from "${back}shared/readiness.js";`;
      });
      content = content.replace(/import (\{.*?\}) from ".*?\/sync\/map\.js";/g, (m, p1) => {
        changed = true;
        return `import ${p1} from "${back}shared/sync-map.js";`;
      });
      // also replace store.test.mjs relative imports if needed... wait, tests are in tests/
      
      if (changed) {
        writeFileSync(full, content);
        console.log("Updated", full);
      }
    }
  }
}

walk(join(__dirname, 'src'));
walk(join(__dirname, 'tests'));
walk(join(__dirname, 'server/src'));
walk(join(__dirname, 'server/tests'));
