const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'kri-platform', 'src');
const EXTENSIONS = ['.ts', '.tsx', '.js', '.css', '.json', '.md'];
const EXCLUDE_DIRS = ['node_modules', 'lib', 'dist', 'temp', 'release', '.git'];

let totalLines = 0;
let totalFiles = 0;
const fileResults = [];

function walkDir(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(entry.name)) walkDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (EXTENSIONS.includes(ext)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          const lines = content.split('\n').length;
          const bytes = Buffer.byteLength(content, 'utf8');
          totalLines += lines;
          totalFiles++;
          fileResults.push({ file: fullPath.replace(ROOT, ''), lines, bytes });
        } catch (e) {
          // skip unreadable
        }
      }
    }
  }
}

console.log('='.repeat(72));
console.log('  KAIROS / KRI PLATFORM — LINE COUNT ANALYSIS');
console.log('  Scanning: ' + ROOT);
console.log('='.repeat(72));

walkDir(ROOT);

// Sort by lines descending
fileResults.sort((a, b) => b.lines - a.lines);

console.log('\n FILE BREAKDOWN (largest first):\n');
console.log('  ' + 'FILE'.padEnd(62) + 'LINES'.padStart(6) + '  SIZE');
console.log('  ' + '-'.repeat(72));

for (const f of fileResults) {
  const name = f.file.replace(/\\/g, '/');
  const kb = (f.bytes / 1024).toFixed(1) + 'KB';
  const truncName = name.length > 60 ? '...' + name.slice(-57) : name;
  console.log('  ' + truncName.padEnd(62) + String(f.lines).padStart(6) + '  ' + kb);
}

const totalKB = (fileResults.reduce((s, f) => s + f.bytes, 0) / 1024).toFixed(1);

console.log('\n' + '='.repeat(72));
console.log('  TOTAL FILES   : ' + totalFiles);
console.log('  TOTAL LINES   : ' + totalLines.toLocaleString());
console.log('  TOTAL SIZE    : ' + totalKB + ' KB');
console.log('='.repeat(72) + '\n');

// Also count the service-layer system_prompt files at root of kri-platform
const extras = [
  path.join(__dirname, 'kri-platform', 'system_prompt.js'),
  path.join(__dirname, 'kri-platform', 'system_prompt.tsx'),
];
let extraLines = 0;
let extraFiles = 0;
console.log(' EXTRA FILES (outside /src, also part of the build):\n');
for (const fp of extras) {
  if (fs.existsSync(fp)) {
    const content = fs.readFileSync(fp, 'utf8');
    const lines = content.split('\n').length;
    const kb = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1) + 'KB';
    extraLines += lines;
    extraFiles++;
    console.log('  ' + path.basename(fp).padEnd(62) + String(lines).padStart(6) + '  ' + kb);
  }
}
console.log('\n  EXTRA LINES   : ' + extraLines.toLocaleString());
console.log('\n' + '='.repeat(72));
console.log('  GRAND TOTAL LINES (src + extras) : ' + (totalLines + extraLines).toLocaleString());
console.log('  GRAND TOTAL FILES                : ' + (totalFiles + extraFiles));
console.log('='.repeat(72) + '\n');
