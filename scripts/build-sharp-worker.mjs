/**
 * 单独打包 sharp-worker.mjs（worker_threads 入口）。
 * 主 vite 使用 inlineDynamicImports，不能与 index 做双 entry。
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import nodeResolve from '@rollup/plugin-node-resolve';
import { builtinModules } from 'module';
import { KAKAKE_PLUGIN_NAME } from './plugin-constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const OUT_DIR = KAKAKE_PLUGIN_NAME;
const outDir = resolve(root, OUT_DIR);

const nodeModules = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  'sharp',
].flat();

await build({
  configFile: false,
  resolve: { conditions: ['node', 'default'] },
  build: {
    sourcemap: false,
    target: 'esnext',
    minify: false,
    emptyOutDir: false,
    lib: {
      entry: resolve(root, 'src/lib/sharp-worker.ts'),
      formats: ['es'],
      fileName: () => 'sharp-worker.mjs',
    },
    rollupOptions: {
      external: nodeModules,
      output: { inlineDynamicImports: true },
    },
    outDir,
  },
  plugins: [nodeResolve()],
});

console.log(`[build-sharp-worker] ${OUT_DIR}/sharp-worker.mjs`);
