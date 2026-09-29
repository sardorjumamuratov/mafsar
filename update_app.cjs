const fs = require('fs');
let c = fs.readFileSync('server/src/app.ts', 'utf8');

c = c.replace(/pollSchema, deleteAccountSchema \} from "\.\/schema\.js";/, `pollSchema, deleteAccountSchema, globalPublishSchema, globalReportSchema, globalAdminSchema } from "./schema.js";`);

fs.writeFileSync('server/src/app.ts', c);
