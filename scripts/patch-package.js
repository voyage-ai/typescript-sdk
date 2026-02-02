#!/usr/bin/env node
/**
 * Post-generation script to patch package.json for local model support.
 * Run this after `fern generate` if Fern overwrites the package.json changes.
 *
 * Usage: node scripts/patch-package.js
 */

const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

// Update entry points to use extended client
pkg.main = './extended/index.js';
pkg.types = './extended/index.d.ts';

// Add optional peer dependency for local model support
pkg.peerDependencies = {
    '@xenova/transformers': '^2.17.0'
};
pkg.peerDependenciesMeta = {
    '@xenova/transformers': { optional: true }
};

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4) + '\n');
console.log('✓ Patched package.json for local model support');
console.log('  - main: ./extended/index.js');
console.log('  - types: ./extended/index.d.ts');
console.log('  - peerDependencies: @xenova/transformers (optional)');
