const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname);

// Ensure a data file exists with a default value
function ensureFile(filename, defaultValue) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
  return filePath;
}

// Read a JSON data file
function readData(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error(`Error parsing ${filename}:`, e.message);
    return [];
  }
}

// Write a JSON data file (atomic-ish write via temp file)
function writeData(filename, data) {
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
  return data;
}

module.exports = { ensureFile, readData, writeData, DATA_DIR };
