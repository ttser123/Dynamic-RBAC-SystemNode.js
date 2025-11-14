const fs = require('fs');
const path = require('path');

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
let hadIssue = false;
for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  const openCount = (content.match(/<%/g) || []).length;
  const closeCount = (content.match(/%>/g) || []).length;
  const backtickCount = (content.match(/`/g) || []).length;
  const scriptContentCount = (content.match(/const\s+script_content\s*=\s*`/g) || []).length;

  if (openCount !== closeCount) {
    console.log('UNBALANCED EJS TAGS:', f);
    console.log('  <% count =', openCount, ', %> count =', closeCount);
    hadIssue = true;
  }

  // heuristic: many backticks may indicate nested template literals inside script/body
  if (scriptContentCount > 0 && backtickCount > 8) {
    console.log('POSSIBLE NESTED BACKTICKS:', f, '(backticks =', backtickCount + ')');
  }
}

if (!hadIssue) console.log('No unbalanced <% %> found (per counts).');
else process.exit(1);
