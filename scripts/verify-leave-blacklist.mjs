// 退群拉黑理由生成自检
//
// 从 mkbot-core.ts 按行号区间切出新增的名单函数原样实现（不重写逻辑），
// 校验白名单跳过、理由生成、标记消费等语义。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mkleave-'));
const outdir = path.join(tmp, 'build');
fs.mkdirSync(outdir, { recursive: true });

const core = fs.readFileSync('src/mkbot-core.ts', 'utf-8');
const lines = core.split('\n');

// 名单工具函数在 mkbot-core.ts 中是一段连续区间（路径构造 → 加载 → 理由 →
// 身份解析 → 移除 → 自动拉黑），按注释锚点定位这段整体切出，原样搬运不重写。
const START = lines.findIndex((l) => l.includes('白名单（黑白名单体系 · 复用'));
const END = lines.findIndex((l) => l.includes('// ================== 锁名系统'));
if (START < 0 || END <= START) throw new Error(`名单区间定位失败: ${START}..${END}`);
const 名单区 = lines.slice(START, END).join('\n');
// 免死金牌路径函数不在该区间内，但 mkIsPardonExempt 之前的免死相关不在切取范围，
// 本测试只覆盖名单功能，无需额外依赖。

fs.writeFileSync(path.join(outdir, 'subject.ts'), `
import { readA, writeA, readB, writeB, setDataPath } from ${JSON.stringify(path.resolve('src/data-fs.ts'))};
import { loadCachedList, invalidateCachedList } from ${JSON.stringify(path.resolve('src/lib/list-cache.ts'))};
${名单区}
export { setDataPath, readA, writeA, readB, writeB, invalidateCachedList,
  mkMarkAutoKickReason, mkTakeAutoKickReason, mkAddToBlacklistOnLeave };
`, 'utf-8');

await build({
  entryPoints: [path.join(outdir, 'subject.ts')],
  outfile: path.join(outdir, 'bundle.mjs'),
  bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'error',
});

const m = await import(pathToFileURL(path.join(outdir, 'bundle.mjs')).href);
m.setDataPath(tmp);

const G = '123456789';
const BLACK = `筱筱吖/群管系统/黑白名单/群聊/${G}/`;
const GLOBAL = '筱筱吖/群管系统/黑白名单/全局/';

let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { pass++; console.log(`  ✓ ${n}`); } else { fail++; console.log(`  ✗ ${n} ${x}`); } };
const setList = (f, arr) => m.writeA(f, JSON.stringify(arr));
const getList = (f) => JSON.parse(m.readA(f) || '[]');
const getReason = (f, k) => JSON.parse(m.readA(f) || '{}')[k] || '';

console.log('\n[1] 主动退群 → 理由「主动退群」');
let r = m.mkAddToBlacklistOnLeave(G, '1001', '主动退群');
check('已加入黑名单', r.added === true, JSON.stringify(r));
check('理由已落盘', getReason(`${BLACK}理由.json`, '1001') === '主动退群');
check('名单含该 QQ', getList(`${BLACK}人员.json`).includes('1001'));

console.log('\n[2] 管理员手动踢出 → 理由含操作者');
r = m.mkAddToBlacklistOnLeave(G, '1002', '被群主昵称踢出');
check('理由原样记录', getReason(`${BLACK}理由.json`, '1002') === '被群主昵称踢出');

console.log('\n[3] 入群验证踢出 → 用标记理由');
m.mkMarkAutoKickReason(G, '1003', '入群验证未通过');
const taken = m.mkTakeAutoKickReason(G, '1003');
check('取到标记理由', taken === '入群验证未通过', taken);
m.mkAddToBlacklistOnLeave(G, '1003', taken);
check('理由为入群验证未通过', getReason(`${BLACK}理由.json`, '1003') === '入群验证未通过');

console.log('\n[4] 标记一次性消费（不残留）');
check('再次取已为空', m.mkTakeAutoKickReason(G, '1003') === '');
check('其他 QQ 不受影响', m.mkTakeAutoKickReason(G, '9999') === '');

console.log('\n[5] 白名单成员跳过加黑（核心修复）');
setList(`${GLOBAL}白名单.json`, ['2001']);
r = m.mkAddToBlacklistOnLeave(G, '2001', '主动退群');
check('全局白名单被跳过', r.added === false && r.skippedWhite === true, JSON.stringify(r));
check('未写进黑名单', !getList(`${BLACK}人员.json`).includes('2001'));

setList(`${BLACK}白名单.json`, ['2002']);
r = m.mkAddToBlacklistOnLeave(G, '2002', '被XX踢出');
check('本群白名单被跳过', r.skippedWhite === true, JSON.stringify(r));
check('未写进黑名单', !getList(`${BLACK}人员.json`).includes('2002'));

console.log('\n[6] 白名单成员不产生理由残留');
check('全局白无理由', getReason(`${GLOBAL}理由.json`, '2001') === '');
check('本群白无理由', getReason(`${BLACK}理由.json`, '2002') === '');

console.log('\n[7] 已在黑名单 → 不重复写、不覆盖手工理由');
setList(`${BLACK}人员.json`, ['1001', '3001']);
m.writeB(`${BLACK}理由.json`, '3001', '手工填写的理由');
r = m.mkAddToBlacklistOnLeave(G, '3001', '主动退群');
check('返回 already', r.already === true && r.added === false, JSON.stringify(r));
check('手工理由未被覆盖', getReason(`${BLACK}理由.json`, '3001') === '手工填写的理由');

console.log('\n[8] 重复退群不产生重复条目');
setList(`${BLACK}人员.json`, ['1001']);
m.mkAddToBlacklistOnLeave(G, '1001', '主动退群');
check('名单仍只有一条', getList(`${BLACK}人员.json`).filter((x) => x === '1001').length === 1);

console.log('\n[9] 边界输入');
check('空 QQ 被拒绝', m.mkAddToBlacklistOnLeave(G, '', 'x').added === false);
setList(`${BLACK}人员.json`, []);
m.mkAddToBlacklistOnLeave(G, '4001', '');
check('空理由不写盘', getReason(`${BLACK}理由.json`, '4001') === '');
check('但名单已加入', getList(`${BLACK}人员.json`).includes('4001'));
check('未读标记时返回空串', m.mkTakeAutoKickReason(G, '4001') === '');

console.log('\n[10] 原因含特殊字符可安全存取');
const 特殊 = '被"测试"昵称\\踢出';
m.mkAddToBlacklistOnLeave(G, '5001', 特殊);
check('特殊字符原样存取', getReason(`${BLACK}理由.json`, '5001') === 特殊,
  JSON.stringify(getReason(`${BLACK}理由.json`, '5001')));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail === 0 ? 0 : 1);
