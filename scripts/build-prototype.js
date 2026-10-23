// Builds prototype/index.html: one self-contained page (data + translations inlined) for client demos.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const sandbox = { window: {} };
vm.runInNewContext(read('web/i18n.js'), sandbox);

// "<" is escaped so inlined JSON can never close the script tag.
const inline = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const html = read('prototype/template.html')
  .replace('/*CATALOG*/', () => inline(JSON.parse(read('data/services.json'))))
  .replace('/*BUSINESS*/', () => inline(JSON.parse(read('data/business.json'))))
  .replace('/*I18N*/', () => inline(sandbox.window.I18N));

fs.writeFileSync(path.join(root, 'prototype/index.html'), html);
console.log(`[build-prototype] prototype/index.html (${Math.round(html.length / 1024)} KB)`);
