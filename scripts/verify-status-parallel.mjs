// 「运行状态」耗时回归校验：并行调度、逐项兜底、日志扫描预算、源码串行链已消除。
//
// 背景：旧版把 get_login_info → 系统快照 → 协议身份 → 日志统计 → 连接列表 → 渲染
// 一条链逐个 await，实测 7~8 秒；连接列表还逐个地址试，每个 1.5s 超时。
// 现在这些互不依赖的数据源一次性并行启动，总耗时 ≈ 最慢的一项。
//
// 运行：npm run verify:status-parallel

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mkbot-latency-'));
const bundleOut = path.join(tmpRoot, 'parallel.bundle.mjs');

function removeTmpDir(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) removeTmpDir(p);
    else { try { fs.unlinkSync(p); } catch {} }
  }
  try { fs.rmdirSync(dir); } catch {}
}

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) { passed += 1; console.log(`  ✓ ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log('[bundle] 打包 status-parallel.ts + kakake-log-stats.ts …');
  const bundled = await build({
    stdin: {
      contents: [
        "export * from './src/lib/status-parallel.ts';",
        "export { countLogFile, getTodayChatLogStats } from './src/lib/kakake-log-stats.ts';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'verify-parallel-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundleOut,
    write: false,
    logLevel: 'silent',
  });
  fs.writeFileSync(bundleOut, bundled.outputFiles[0].contents);
  const { runParallelSafe, mkElapsedSince, countLogFile } = await import(pathToFileURL(bundleOut).href);

  console.log('\n[1] 并行调度：总耗时 ≈ 最慢的一项，不是逐项相加');
  const t0 = Date.now();
  const r1 = await runParallelSafe([
    { key: 'a', run: async () => { await sleep(260); return 1; }, fallback: 0 },
    { key: 'b', run: async () => { await sleep(260); return 2; }, fallback: 0 },
    { key: 'c', run: async () => { await sleep(260); return 3; }, fallback: 0 },
  ]);
  const elapsed = Date.now() - t0;
  check('三项结果齐全', r1.a === 1 && r1.b === 2 && r1.c === 3);
  check('并行耗时 < 520ms（串行需 ~780ms）', elapsed < 520, `${elapsed}ms`);
  check('确实等过任务（不是立刻返回）', elapsed >= 200, `${elapsed}ms`);

  console.log('\n[2] 单项失败只回落自己，不拖垮整条命令');
  const reported = [];
  const r2 = await runParallelSafe([
    { key: 'ok', run: async () => { await sleep(20); return 'yes'; }, fallback: '' },
    { key: 'bad', run: async () => { await sleep(20); throw new Error('boom'); }, fallback: 'fallback' },
    { key: 'sync', run: () => 42, fallback: 0 },
  ], (key, err) => reported.push(`${key}:${err?.message || err}`));
  check('成功项不受影响', r2.ok === 'yes');
  check('失败项回落 fallback', r2.bad === 'fallback');
  check('同步值任务也支持', r2.sync === 42);
  check('全局 onError 收到失败项', reported.length === 1 && reported[0].startsWith('bad:boom'));
  check('空任务表返回空对象', Object.keys(await runParallelSafe([])).length === 0);

  console.log('\n[3] 计时工具');
  const t3 = Date.now() - 30;
  check('mkElapsedSince 非负', mkElapsedSince(t3) >= 0);
  check('mkElapsedSince 随时间增长', mkElapsedSince(t3) >= 25);

  console.log('\n[4] 日志扫描时间预算：大日志不再把命令拖成几秒');
  const logFile = path.join(tmpRoot, 'big.log');
  const line = '[2026-11-09 00:00:00] [EVENT]\t{"post_type":"message","message_id":1}\n';
  const action = '[2026-11-09 00:00:00] [ACTION] [输出:x] send_msg {"a":1}\n';
  const chunk = (line + action).repeat(1000);
  fs.writeFileSync(logFile, chunk.repeat(3));
  const 正常 = await countLogFile(logFile, 60000);
  check('完整扫描统计出 recv', 正常.recv === 3000, String(正常.recv));
  check('完整扫描统计出 sent', 正常.sent === 3000, String(正常.sent));
  check('完整扫描不截断', 正常.truncated === false);
  const 预算 = await countLogFile(logFile, 0);
  check('预算耗尽时提前停止', 预算.truncated === true);
  check('提前停止后仍有部分计数可用', 预算.recv + 预算.sent > 0);
  check('提前停止的计数少于完整扫描', 预算.recv + 预算.sent < 正常.recv + 正常.sent);

  console.log('\n[5] 源码结构：运行状态串行链已消除');
  const core = fs.readFileSync(path.join(root, 'src/mkbot-core.ts'), 'utf8');
  const 起点 = core.indexOf('if(message === "运行状态")');
  const 终点 = core.indexOf('if(message.match(/^设置(续火)内容', 起点);
  const 片段 = core.slice(起点, 终点 > 起点 ? 终点 : 起点 + 12000);
  check('找到运行状态分支', 起点 > 0);
  check('采集阶段用 runParallelSafe 并行启动', 片段.includes('runParallelSafe<any>(['));
  check('不再串行 await 协议身份', !片段.includes('await mkResolveStatusProtocolIdentity'));
  check('不再串行 await 日志统计', !片段.includes('await getTodayChatLogStats'));
  check('不再串行 await 账号列表', !片段.includes('await fetchKakakeStatusAccounts(ctx, logger)'));
  check('群友计数两个接口并行', 片段.includes('"friend"') && 片段.includes('"group"'));
  check('输出分段耗时日志', 片段.includes('耗时明细'));
  const 账号函数 = core.slice(core.indexOf('async function fetchKakakeStatusAccounts'), core.indexOf('/** 运势「URL.json」'));
  check('连接列表改为并发探测', 账号函数.includes('Promise.all(候选.map'));
  check('连接列表超时从 1500ms 收紧', 账号函数.includes('ctrl.abort(), 900'));
}

try { await main(); } finally { removeTmpDir(tmpRoot); }

if (failures.length) {
  console.error(`\n失败 ${failures.length} 项：\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`\n通过 ${passed} 项，全部通过`);
