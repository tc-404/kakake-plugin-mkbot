import { resolve, dirname } from 'path';
import { defineConfig } from 'vite';
import nodeResolve from '@rollup/plugin-node-resolve';
import { builtinModules } from 'module';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { KAKAKE_PLUGIN_NAME, PLUGIN_ICON_PATH } from './scripts/plugin-constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Vite 构建产物目录（与 Kakake plugin.json name 一致，便于直接部署） */
const OUT_DIR = KAKAKE_PLUGIN_NAME;

const nodeModules = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
].flat();

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = resolve(src, entry.name);
    const destPath = resolve(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyMkbotAssetsPlugin() {
  return {
    name: 'copy-mkbot-assets',
    writeBundle() {
      const outDir = resolve(__dirname, OUT_DIR);

      const webuiSrc = resolve(__dirname, 'webui');
      if (fs.existsSync(webuiSrc)) {
        copyDirRecursive(webuiSrc, resolve(outDir, 'webui'));
        console.log(`[copy-mkbot-assets] webui/ → ${OUT_DIR}/webui`);
      }

      const defaultResSrc = resolve(__dirname, '默认资源');
      if (fs.existsSync(defaultResSrc)) {
        copyDirRecursive(defaultResSrc, resolve(outDir, '默认资源'));
        console.log(`[copy-mkbot-assets] 默认资源/ → ${OUT_DIR}/默认资源`);
      }

      const assetsSrc = resolve(__dirname, 'assets');
      if (fs.existsSync(assetsSrc)) {
        copyDirRecursive(assetsSrc, resolve(outDir, 'assets'));
        console.log(`[copy-mkbot-assets] assets/ → ${OUT_DIR}/assets（插件头像等静态资源）`);
      }

      const iconPath = resolve(outDir, PLUGIN_ICON_PATH);
      if (!fs.existsSync(iconPath)) {
        console.warn(
          `[copy-mkbot-assets] 未找到插件头像 ${PLUGIN_ICON_PATH}，请在 ${PLUGIN_ICON_PATH} 放置图片，并在 plugin.json 配置 "icon": "${PLUGIN_ICON_PATH}"`
        );
      } else {
        console.log(`[copy-mkbot-assets] 插件头像: ${OUT_DIR}/${PLUGIN_ICON_PATH}（plugin.json icon 指向此文件）`);
      }

      const pluginJson = resolve(__dirname, 'plugin.json');
      if (fs.existsSync(pluginJson)) {
        const manifest = JSON.parse(fs.readFileSync(pluginJson, 'utf-8')) as Record<string, unknown>;
        manifest.name = KAKAKE_PLUGIN_NAME;
        fs.writeFileSync(resolve(outDir, 'plugin.json'), `${JSON.stringify(manifest, null, 2)}\n`);
        console.log(`[copy-mkbot-assets] plugin.json → ${OUT_DIR}/plugin.json (name=${KAKAKE_PLUGIN_NAME})`);
      }

      const docMd = resolve(__dirname, '插件文档.md');
      if (fs.existsSync(docMd)) {
        fs.copyFileSync(docMd, resolve(outDir, '插件文档.md'));
        console.log(`[copy-mkbot-assets] 插件文档.md → ${OUT_DIR}/插件文档.md`);
      }
    },
  };
}

export default defineConfig({
  resolve: {
    conditions: ['node', 'default'],
  },
  build: {
    sourcemap: false,
    target: 'esnext',
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: {
      external: [...nodeModules, 'sharp'],
      output: {
        inlineDynamicImports: true,
      },
    },
    outDir: OUT_DIR,
  },
  plugins: [nodeResolve(), copyMkbotAssetsPlugin()],
});
