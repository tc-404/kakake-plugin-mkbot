/**
 * 将 lib/api 下各解析模块单独打包到 kakake-plugin-mkbot/lib/api/*.mjs
 */
import { build } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import nodeResolve from '@rollup/plugin-node-resolve';
import { builtinModules } from 'module';
import fs from 'fs';
import { KAKAKE_PLUGIN_NAME } from './plugin-constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const nodeModules = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
].flat();

const apiEntries = ['blbl', 'dy', 'xhs', 'ks', 'yt', 'tt', 'imghost', 'music-sign'];
const OUT_DIR = KAKAKE_PLUGIN_NAME;
const outDir = resolve(root, OUT_DIR, 'lib/api');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

for (const name of apiEntries) {
  await build({
    configFile: false,
    resolve: { conditions: ['node', 'default'] },
    build: {
      sourcemap: false,
      target: 'esnext',
      minify: false,
      emptyOutDir: false,
      lib: {
        entry: resolve(root, `src/lib/api/${name}.ts`),
        formats: ['es'],
        fileName: () => `${name}.mjs`,
      },
      rollupOptions: {
        external: nodeModules,
        output: { inlineDynamicImports: true },
      },
      outDir,
    },
    plugins: [nodeResolve()],
  });
  console.log(`[build-api] ${OUT_DIR}/lib/api/${name}.mjs`);
}
