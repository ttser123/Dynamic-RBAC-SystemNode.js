const fs = require('fs');
const path = require('path');
const ejs = require('ejs');

const viewsDir = path.join(__dirname, '..', 'views');

function walk(dir) {
  let results = [];
  fs.readdirSync(dir).forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (file.endsWith('.ejs')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk(viewsDir);
let hadError = false;
for (const f of files) {
  try {
    const src = fs.readFileSync(f, 'utf8');
    ejs.compile(src, {filename: f});
    console.log('OK:', f);
  } catch (err) {
    console.error('ERROR in', f);
    console.error(err && err.message);
    hadError = true;
  }
}
if (hadError) process.exit(1);
else console.log('All templates compiled successfully (syntactic check).');
