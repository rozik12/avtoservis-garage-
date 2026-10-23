// Copies the shared data files next to the static site so the browser can fetch them.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
for (const file of ['services.json', 'business.json']) {
  fs.copyFileSync(path.join(root, 'data', file), path.join(root, 'web', file));
}
console.log('[build-web] data files copied to web/');
