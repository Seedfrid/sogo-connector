import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

// Bundle the whole server (and all dependencies) into a single ESM file.
// This keeps the .mcpb package small and avoids shipping node_modules.
//
// The .mcpb package ships `server/index.mjs` (see manifest.json entry_point),
// while `package.json` uses `dist/index.js`. We build once and write both so
// the two can never drift out of sync.
const options = {
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  sourcemap: false,
  legalComments: 'none',
  // Some bundled CommonJS deps (nodemailer, mailparser) use require() at
  // runtime. Provide a createRequire shim so those calls resolve under ESM.
  banner: {
    js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);",
  },
};

await build({ ...options, outfile: 'dist/index.js' });

// Keep the packaged entry point in sync with the build output.
mkdirSync('server', { recursive: true });
copyFileSync('dist/index.js', 'server/index.mjs');

console.log('Build complete: dist/index.js + server/index.mjs');
