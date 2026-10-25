/**
 * 构建产物完整性校验（build 最后一步跑）。
 *
 * 为什么需要：主 `vite build` 的 outDir 就是产物目录且 emptyOutDir 默认为 true，
 * webui/、默认资源/、assets/ 是靠 vite.config.ts 的 closeBundle 钩子拷进去的。
 * 只要 build 中途失败（closeBundle 没跑到），产物就会静默缺 webui/admin.html，
 * 插件装上后 WebUI 直接打不开，而且构建还"看起来成功了"。
 * 这里把必需文件列死，缺一个就让 build 失败。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KAKAKE_PLUGIN_NAME } from './plugin-constants.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, KAKAKE_PLUGIN_NAME);

const required = [
  ['index.mjs', 'file'],
  ['plugin.json', 'file'],
  ['sharp-worker.mjs', 'file'],
  ['webui/admin.html', 'file'],
  ['assets', 'dir'],
  ['默认资源', 'dir'],
  ['lib/api', 'dir'],
];

let missing = 0;
console.log(`[verify-dist] 检查 ${KAKAKE_PLUGIN_NAME}/ 产物完整性`);
for (const [rel, kind] of required) {
  const p = path.join(outDir, rel);
  let ok = false;
  try {
    const st = fs.statSync(p);
    ok = kind === 'dir' ? st.isDirectory() : st.isFile();
  } catch {
    ok = false;
  }
  if (ok) {
    const size = kind === 'file' ? ` (${fs.statSync(p).size} B)` : '';
    console.log(`  ✓ ${rel}${size}`);
  } else {
    console.log(`  ✗ ${rel} 缺失${kind === 'dir' ? '（目录）' : ''}`);
    missing += 1;
  }
}

if (missing > 0) {
  console.error(`[verify-dist] 产物缺 ${missing} 项，构建失败。请重跑 npm run build；仍缺则检查 vite.config.ts 的 copy-mkbot-assets 钩子`);
  process.exit(1);
}

// webui 源与产物必须逐字一致（源改了却忘了同步时这里会拦住）
const srcAdmin = path.join(root, 'webui', 'admin.html');
const outAdmin = path.join(outDir, 'webui', 'admin.html');
if (fs.existsSync(srcAdmin) && fs.existsSync(outAdmin)) {
  const a = fs.readFileSync(srcAdmin);
  const b = fs.readFileSync(outAdmin);
  if (!a.equals(b)) {
    console.error('[verify-dist] webui/admin.html 源与产物不一致，请重跑 npm run build');
    process.exit(1);
  }
}
console.log('[verify-dist] 产物完整 ✓');
