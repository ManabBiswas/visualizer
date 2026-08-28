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

// Compiles the optional JVM parser CLI (used only when CODELENS_PARSER=java).
// The default TypeScript parser needs no build step, so missing JDK/jar is a
// warning, not a failure.

const sources = collectJavaFiles(srcDir);
if (sources.length === 0) {
  console.warn('No Java parser sources found — skipping JVM parser build (TS parser is the default).');
  process.exit(0);
}

const javaParserJar = findJavaParserJar();
if (!javaParserJar) {
  console.warn('JavaParser jar not found — skipping JVM parser build (TS parser is the default). Set JAVAPARSER_JAR to build it.');
  process.exit(0);
}

const javacCommand = process.platform === 'win32' ? 'javac.exe' : 'javac';
try {
  execFileSync(javacCommand, ['-cp', javaParserJar, '-d', outDir, ...sources], {
    cwd: rootDir,
    stdio: 'inherit',
  });
} catch (err) {
  console.warn('JVM parser build failed — continuing with the TS parser default.', err.message);
  process.exit(0);
}

console.log(`Compiled parser classes to ${outDir}`);
