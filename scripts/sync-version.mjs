/**
 * 从 VERSION 文件同步版本号到 plugin.json 与 package.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { KAKAKE_PLUGIN_NAME, PLUGIN_ICON_PATH } from './plugin-constants.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const versionPath = path.join(root, 'VERSION');

if (!fs.existsSync(versionPath)) {
  console.error('[sync-version] 缺少 VERSION 文件');
  process.exit(1);
}

const version = fs.readFileSync(versionPath, 'utf-8').trim();
if (!version) {
  console.error('[sync-version] VERSION 文件为空');
  process.exit(1);
}

const author = '三个句号';

const pluginJsonPath = path.join(root, 'plugin.json');
if (fs.existsSync(pluginJsonPath)) {
  const pluginJson = JSON.parse(fs.readFileSync(pluginJsonPath, 'utf-8'));
  pluginJson.name = KAKAKE_PLUGIN_NAME;
  pluginJson.version = version;
  pluginJson.author = author;
  if (!pluginJson.displayName && pluginJson.name) {
    pluginJson.displayName = pluginJson.displayName || 'MKbot';
  }
  if (!pluginJson.icon) {
    pluginJson.icon = PLUGIN_ICON_PATH;
  }
  fs.writeFileSync(pluginJsonPath, `${JSON.stringify(pluginJson, null, 2)}\n`);
  console.log(`[sync-version] plugin.json → ${version}`);
}

const pkgPath = path.join(root, 'package.json');
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  pkg.version = version;
  pkg.author = author;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`[sync-version] package.json → ${version}`);
}
