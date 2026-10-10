// 名单缓存自检：验证命中、mtime 失效、主动失效、返回值隔离、脏数据容错
//
// 走项目自带的 esbuild 编译真实源码；测试入口同时重导出 data-fs 与 list-cache，
// 保证 setDataPath / writeA 与 loadCachedList 用的是同一份 data-fs 模块实例。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mklist-'));
const outdir = path.join(tmp, 'build');
fs.mkdirSync(outdir, { recursive: true });

// 临时入口：把两个模块绑到同一实例上再导出
const entry = path.join(tmp, 'entry.ts');
fs.writeFileSync(entry, `
export { setDataPath, writeA, readA } from ${JSON.stringify(path.resolve('src/data-fs.ts'))};
export {
  loadCachedList,
  invalidateCachedList,
  invalidateAllCachedLists,
  cachedListCount,
} from ${JSON.stringify(path.resolve('src/lib/list-cache.ts'))};
`, 'utf-8');

await build({
  entryPoints: [entry],
  outfile: path.join(outdir, 'bundle.mjs'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  logLevel: 'error',
});

const mod = await import(pathToFileURL(path.join(outdir, 'bundle.mjs')).href);
mod.setDataPath(tmp);

const F = '筱筱吖/群管系统/黑白名单/群聊/123/人员.json';
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

console.log('\n[1] 空名单（文件不存在）');
check('文件不存在返回 []', mod.loadCachedList(F).length === 0);

console.log('\n[2] 写入后可读到，类型统一为字符串');
mod.writeA(F, JSON.stringify([123456, '789']));
const got = mod.loadCachedList(F);
check('读到 2 条', got.length === 2, `实际 ${got.length}`);
check('数字已转字符串', got[0] === '123456' && typeof got[0] === 'string', JSON.stringify(got));

console.log('\n[3] 外部改文件后缓存自动失效（模拟剪贴板粘贴绕过本模块写入）');
mod.loadCachedList(F);                              // 填充缓存
mod.writeA(F, JSON.stringify([123456, '789', '555']));  // 外部写入
check('读到新数据，未被旧缓存污染', mod.loadCachedList(F).length === 3,
  `实际 ${mod.loadCachedList(F).length}`);

console.log('\n[4] 返回值隔离：调用方改动不污染缓存');
const a = mod.loadCachedList(F);
a.push('999999');
a[0] = '篡改';
const b = mod.loadCachedList(F);
check('push 不影响下次读取', b.length === 3, `实际 ${b.length}`);
check('改元素不影响下次读取', b[0] === '123456', b[0]);

console.log('\n[5] 主动失效');
mod.writeA(F, JSON.stringify(['1']));
mod.loadCachedList(F);
mod.writeA(F, JSON.stringify(['1', '2']));
mod.invalidateCachedList(F);
check('失效后读到最新数据', mod.loadCachedList(F).length === 2,
  `实际 ${mod.loadCachedList(F).length}`);

console.log('\n[6] 清空全部缓存');
mod.invalidateAllCachedLists();
check('条目数归零', mod.cachedListCount() === 0, `实际 ${mod.cachedListCount()}`);

console.log('\n[7] 脏数据容错');
mod.writeA(F, '{不是合法JSON');
check('坏 JSON 返回 [] 不抛错', mod.loadCachedList(F).length === 0);
mod.writeA(F, '{"not":"array"}');
check('非数组返回 []', mod.loadCachedList(F).length === 0);
mod.writeA(F, '[]');
check('空数组正常返回 []', mod.loadCachedList(F).length === 0);

console.log('\n[8] 边界输入');
check('空路径返回 []', mod.loadCachedList('').length === 0);
check('null 路径返回 []', mod.loadCachedList(null).length === 0);
mod.writeA(F, '["  12345  "]');
check('含空格的 QQ 号原样保留（不擅自 trim 改变语义）', mod.loadCachedList(F)[0] === '  12345  ',
  JSON.stringify(mod.loadCachedList(F)[0]));

console.log('\n[9] 缓存条目数受控');
mod.invalidateAllCachedLists();
mod.writeA(F, JSON.stringify(['1']));
for (let i = 0; i < 50; i++) mod.loadCachedList(F);
check('重复读不增长缓存条目', mod.cachedListCount() === 1, `实际 ${mod.cachedListCount()}`);

console.log('\n[10] 删除文件后能反映「名单已空」');
mod.writeA(F, JSON.stringify(['1', '2']));
check('删除前读到 2 条', mod.loadCachedList(F).length === 2);
fs.rmSync(path.join(tmp, F), { force: true });
check('删除文件后读到 0 条', mod.loadCachedList(F).length === 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
