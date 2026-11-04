// 1つの HTML ファイル（dist/index.html）にまとめる
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: ['es2020'], write: false, legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('index.html', 'utf8').replace('<script type="module" src="./src/main.js"></script>', () => `<script>${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`dist/index.html ${(html.length / 1024).toFixed(1)} KB`);
