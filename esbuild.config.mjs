import { build } from 'esbuild';

// Bundle the whole server (and all dependencies) into a single ESM file.
// This keeps the .mcpb package small and avoids shipping node_modules.
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
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
});

console.log('Build complete: dist/index.js');
