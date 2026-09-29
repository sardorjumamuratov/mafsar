const fs = require('fs');
let sw = fs.readFileSync('src/background/service-worker.js', 'utf8');
sw = sw.replace(/backendExtractPdf,/g, `backendExtractPdf, backendGlobalPublish, backendGlobalUnpublish, backendGlobalList, backendGlobalFetch, backendGlobalReport,`);
fs.writeFileSync('src/background/service-worker.js', sw);

let globalJs = fs.readFileSync('src/ui/views/global.js', 'utf8');
globalJs = globalJs.replace(/actionClass: "btn-primary",/g, ``);
fs.writeFileSync('src/ui/views/global.js', globalJs);
