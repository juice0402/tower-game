// 1つの HTML ファイル（dist/index.html）にまとめる
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({ entryPoints: ['src/main.js'], bundle: true, minify: true, format: 'iife', target: ['es2020'], write: false, legalComments: 'none' });
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = readFileSync('index.html', 'utf8').replace('<script type="module" src="./src/main.js"></script>', () => `<script>${js}</script>`);
mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log(`dist/index.html ${(html.length / 1024).toFixed(1)} KB`);

// claude.ai のアーティファクト用（html/head/body のわくなし。ファイルの保存ボタンは出さない）
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'))
  .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const title = head.match(/<title>.*?<\/title>/)[0];
const art = `${title}\n${head.replace(title, '').trim()}\n<script>window.__NOBI_ARTIFACT = true;</script>\n${body.trim()}\n`;
writeFileSync('dist/artifact.html', art);
console.log(`dist/artifact.html ${(art.length / 1024).toFixed(1)} KB`);
