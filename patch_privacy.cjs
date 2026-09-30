const fs = require("fs");
let code = fs.readFileSync("server/src/privacy.ts", "utf8");
code = code.replace(
  '<h2>Data we collect</h2>',
  `<h2>Data we collect</h2>
  <h3>Categories and Interests</h3>
  <p>To recommend flashcards, we automatically categorize your study sets. We keep track of your interests based on the categories of sets you create or study, to personalize your Discover feed.</p>
  <h3>Publishing and Display Name</h3>
  <p>When you publish a set to the Global library, your display name will be publicly visible next to it. You can change or remove your display name at any time.</p>
  <h3>Reports and Feedback</h3>
  <p>If you report a set or send feedback, we store your report (including any optional screenshots attached to feedback) to help us review the content or fix bugs.</p>`
);
fs.writeFileSync("server/src/privacy.ts", code);
