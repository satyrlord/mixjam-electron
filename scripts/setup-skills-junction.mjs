#!/usr/bin/env node
/**
 * Setup script: creates .qoder/skills junction pointing to .github/skills
 * Run after fresh clone: npm run setup (or automatically via postinstall)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, '..');
const source = path.join(repoRoot, '.github', 'skills');
const target = path.join(repoRoot, '.qoder', 'skills');

if (!fs.existsSync(source)) {
  console.error(`Source directory not found: ${source}`);
  process.exit(1);
}

if (fs.existsSync(target)) {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) {
    const linkTarget = fs.readlinkSync(target);
    // Normalise both paths for case-insensitive comparison (Windows drive
    // letters can differ in casing depending on how the cwd was entered).
    if (path.resolve(linkTarget).toLowerCase() === path.resolve(source).toLowerCase()) {
      console.log(`Junction already exists: ${target} -> ${source}`);
      process.exit(0);
    }
  }
  console.error(`Path exists but is not the expected junction: ${target}`);
  process.exit(1);
}

// Ensure parent directory exists
fs.mkdirSync(path.dirname(target), { recursive: true });

// Create junction (Windows) or symlink (Unix)
if (process.platform === 'win32') {
  fs.symlinkSync(source, target, 'junction');
} else {
  fs.symlinkSync(source, target);
}

console.log(`Created junction: ${target} -> ${source}`);
