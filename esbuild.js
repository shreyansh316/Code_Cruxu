const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: ['./src/extension.js'],
  bundle: true,
  outfile: './out/extension.js',
  external: ['vscode', 'better-sqlite3'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  minify: false,
  logLevel: 'info',
  metafile: true,
};

async function build() {
  try {
    if (isWatch) {
      const ctx = await esbuild.context(buildOptions);
      await ctx.watch();
      console.log('[HEADROOM] Watching for changes...');
    } else {
      const result = await esbuild.build(buildOptions);
      if (result.metafile) {
        const text = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
        console.log('[HEADROOM] Build complete.\n' + text);
      }
    }
  } catch (err) {
    console.error('[HEADROOM] Build failed:', err);
    process.exit(1);
  }
}

build();
