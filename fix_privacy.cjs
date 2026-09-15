const fs = require("fs");
let content = fs.readFileSync("server/src/privacy.ts", "utf8");
content = content.replace(
  `<h2>Children's privacy</h2>`,
  `<h2>Error reports</h2>
<p>When our backend hits an unexpected error, it sends a report to Sentry, our
error-monitoring service. The report contains the error message and technical
details, the part of our API involved, and your random account ID. It never
includes your email address, password, sign-in tokens, or the content you
capture.</p>

<h2>Children's privacy</h2>`
);
fs.writeFileSync("server/src/privacy.ts", content);
