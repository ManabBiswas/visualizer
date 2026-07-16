#!/usr/bin/env node
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const parserDir = path.join(rootDir, 'parser');
const srcDir = path.join(parserDir, 'src', 'main', 'java');
const outDir = path.join(parserDir, 'target', 'classes');

function collectJavaFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJavaFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.java')) {
      results.push(fullPath);
    }
  }
  return results;
}

function findJavaParserJar() {
  const candidates = [];
  if (process.env.JAVAPARSER_JAR) candidates.push(process.env.JAVAPARSER_JAR);

  const homeRoots = [process.env.M2_HOME, process.env.HOME, process.env.USERPROFILE]
    .filter(Boolean)
    .map((value) => value.trim());

  for (const root of homeRoots) {
    candidates.push(path.join(root, '.m2', 'repository', 'com', 'github', 'javaparser', 'javaparser-core', '3.26.2', 'javaparser-core-3.26.2.jar'));
    candidates.push(path.join(root, 'repository', 'com', 'github', 'javaparser', 'javaparser-core', '3.26.2', 'javaparser-core-3.26.2.jar'));
  }

  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

fs.mkdirSync(outDir, { recursive: true });

const sources = collectJavaFiles(srcDir);
if (sources.length === 0) {
  console.error('No Java parser sources were found to compile.');
  process.exit(1);
}

const javaParserJar = findJavaParserJar();
if (!javaParserJar) {
  console.error('JavaParser dependency jar was not found. Install it into your local Maven cache or set JAVAPARSER_JAR.');
  process.exit(1);
}

const javacCommand = process.platform === 'win32' ? 'javac.exe' : 'javac';
execFileSync(javacCommand, ['-cp', javaParserJar, '-d', outDir, ...sources], {
  cwd: rootDir,
  stdio: 'inherit',
});

console.log(`Compiled parser classes to ${outDir}`);
