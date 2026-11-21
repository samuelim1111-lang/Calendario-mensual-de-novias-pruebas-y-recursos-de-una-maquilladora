// Empaqueta la app en un único index.html (React + CSS de Tailwind compilado, sin CDN).
import { build } from 'esbuild';
import { compile } from 'tailwindcss';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const NM = process.env.NODE_PATH_EXTRA || '/opt/npm-tools/node_modules';
const twDir = path.dirname(require.resolve('tailwindcss/package.json', { paths: [process.cwd(), NM] }));

const js = await build({
  entryPoints: ['src/main.jsx'], bundle: true, minify: true, format: 'iife', write: false,
  jsx: 'automatic', target: 'es2020', define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [NM], legalComments: 'none',
});
const code = js.outputFiles[0].text;

// Candidatos de Tailwind: todos los tokens que aparecen en el código fuente.
const src = (await Promise.all(['src/App.jsx', 'src/main.jsx'].map((f) => fs.readFile(f, 'utf8')))).join('\n');
const candidates = new Set(src.split(/[\s"'`{}()<>,;=]+/).filter(Boolean));
const input = await fs.readFile('src/styles.css', 'utf8');
const compiler = await compile(input, {
  base: process.cwd(),
  loadStylesheet: async (id, base) => {
    const file = id === 'tailwindcss' ? path.join(twDir, 'index.css') : path.resolve(base, id.startsWith('tailwindcss/') ? path.join(twDir, id.slice(12)) : id);
    return { path: file, base: path.dirname(file), content: await fs.readFile(file, 'utf8') };
  },
});
const css = compiler.build([...candidates]);

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agenda de novias</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Nunito+Sans:wght@300;400;600&display=swap">
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>${code.replace(/<\/script/gi, '<\\/script')}</script>
</body>
</html>`;
await fs.mkdir('dist', { recursive: true });
await fs.writeFile('dist/index.html', html);
console.log('dist/index.html', (html.length / 1024).toFixed(0), 'KB · css', (css.length / 1024).toFixed(0), 'KB');
