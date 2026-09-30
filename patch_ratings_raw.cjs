const fs = require("fs");
let ratings = fs.readFileSync("src/storage/ratings.js", "utf8");

ratings = ratings.replace('import { getAccountStorage, setAccountStorage } from "./store.js";', 'import { readRaw, saveRaw } from "./store.js";');
ratings = ratings.replace('const data = await getAccountStorage("ratings");', 'const res = await readRaw(["ratings"]);\n  const data = res.ratings;');
ratings = ratings.replace('await setAccountStorage("ratings", cache);', 'await saveRaw({ ratings: cache });');

fs.writeFileSync("src/storage/ratings.js", ratings);
