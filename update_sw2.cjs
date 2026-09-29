const fs = require('fs');
let c = fs.readFileSync('src/background/service-worker.js', 'utf8');

c = c.replace(/return await authedFetch\("\/v1\/global\/publish", \{ method: "POST", body: JSON\.stringify\(\{ setId: msg\.setId \}\) \}\);/, `return await backendGlobalPublish(msg.setId);`);
c = c.replace(/return await authedFetch\("\/v1\/global\/unpublish", \{ method: "POST", body: JSON\.stringify\(\{ setId: msg\.setId \}\) \}\);/, `return await backendGlobalUnpublish(msg.setId);`);
c = c.replace(/return await authedFetch\("\/v1\/global\/discover\?q=" \+ encodeURIComponent\(msg\.q \|\| ""\) \+ "&category=" \+ encodeURIComponent\(msg\.category \|\| ""\) \+ "&page=" \+ msg\.page\);/, `return await backendGlobalList(msg.q, msg.category, msg.page);`);
c = c.replace(/return await authedFetch\("\/v1\/global\/set\/" \+ encodeURIComponent\(msg\.id\)\);/, `return await backendGlobalFetch(msg.id);`);
c = c.replace(/return await authedFetch\("\/v1\/global\/report", \{ method: "POST", body: JSON\.stringify\(\{ setId: msg\.id \}\) \}\);/, `return await backendGlobalReport(msg.id);`);

c = c.replace(/import \{[\s\S]*?backendExtractPdf,[\s\S]*?\} from "\.\.\/sync\/api\.js";/, `$&`.replace('backendExtractPdf,', 'backendExtractPdf, backendGlobalPublish, backendGlobalUnpublish, backendGlobalList, backendGlobalFetch, backendGlobalReport,'));

fs.writeFileSync('src/background/service-worker.js', c);
