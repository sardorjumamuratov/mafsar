const fs = require("fs");
let store = fs.readFileSync("src/storage/store.js", "utf8");

store = store.replace(
  'const newCards = { ...setObj.cards, [cardId]: { ...setObj.cards[cardId], ...updates, updatedAt: now } };',
  'const newCards = { ...setObj.cards, [cardId]: { ...setObj.cards[cardId], ...updates, updatedAt: now, detached: (updates.front !== undefined || updates.back !== undefined) ? true : setObj.cards[cardId].detached } };'
);

fs.writeFileSync("src/storage/store.js", store);
