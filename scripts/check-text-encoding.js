const fs = require("fs");
const path = require("path");

const roots = ["src", "supabase"];
const extensions = new Set([".ts", ".tsx", ".sql"]);
const ignoredDirs = new Set([".git", ".next", "node_modules"]);

const mojibakePattern =
  /(?:Ã.|Â.|â€.|â€¦|â€”|â€“|â†.|æ[\u0080-\uffff]?|å[\u0080-\uffff]?|è[\u0080-\uffff]?|ç[\u0080-\uffff]?|é[\u0080-\uffff]?|ï¼|ã€)/;
const replacementPattern = /\uFFFD/;
const questionPlaceholderPattern = />\?{2,}</;

const issues = [];

function walk(dir) {
  if (!fs.existsSync(dir)) return;

  for (const name of fs.readdirSync(dir)) {
    if (ignoredDirs.has(name)) continue;

    const fullPath = path.join(dir, name);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath);
      continue;
    }

    if (!extensions.has(path.extname(name))) continue;

    const text = fs.readFileSync(fullPath, "utf8");
    const lines = text.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (
        mojibakePattern.test(line) ||
        replacementPattern.test(line) ||
        questionPlaceholderPattern.test(line)
      ) {
        issues.push(`${fullPath}:${index + 1}: ${line.trim().slice(0, 180)}`);
      }
    });
  }
}

for (const root of roots) walk(root);

if (issues.length) {
  console.error("Text encoding check failed. Fix mojibake or broken placeholder text:");
  console.error(issues.join("\n"));
  process.exit(1);
}

console.log("Text encoding check passed.");
