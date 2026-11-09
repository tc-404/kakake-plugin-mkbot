// 「运行状态 · 关键进程 → 协议框架」识别回归校验。
//
// 背景：旧实现只按进程名匹配，规则里没有 SnowLuma，而 NapCat 常注入 QQ
// 或以 `node napcat.mjs` 启动（comm 只有 node），Docker 跨容器时协议端进程
// 根本不在本机进程表里 —— 所以 NapCat / SnowLuma、Docker / shell 全都显示
// 「未检测到」。现在改为：进程名 + 完整命令行 + 协议端自报身份三路识别。
//
// 运行：npm run verify:status-protocol

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mkbot-status-'));
const bundleOut = path.join(tmpRoot, 'status.bundle.mjs');

function removeTmpDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) removeTmpDir(p);
    else {
      try { fs.unlinkSync(p); } catch {}
    }
  }
  try { fs.rmdirSync(dir); } catch {}
}

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const proc = (pid, name, cmdline = '', memoryMB = 100) => ({
  pid: String(pid),
  name,
  cmdline,
  memory: memoryMB * 1024 * 1024,
  memoryMB: String(memoryMB),
  cpuPercent: '1.2',
});

const protocolRow = (rows) => rows.find((r) => r.key === 'protocol');

async function main() {
  console.log('[bundle] 打包 system-status.ts + status-sharp-render.ts …');
  const bundled = await build({
    stdin: {
      contents: [
        "export * from './src/lib/system-status.ts';",
        "export { computeLayout, STATUS_CARD_WIDTH, renderStatusOverlaySvg } from './src/lib/status-sharp-render.ts';",
      ].join('\n'),
      resolveDir: root,
      sourcefile: 'verify-status-entry.ts',
      loader: 'ts',
    },
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundleOut,
    // esbuild 子进程在部分 Windows 环境写 %TEMP% 会被判 Access is denied
    write: false,
    // sharp 是原生模块，overlay SVG 生成用不到
    external: ['sharp'],
    logLevel: 'silent',
  });
  fs.writeFileSync(bundleOut, bundled.outputFiles[0].contents);
  const m = await import(pathToFileURL(bundleOut).href);
  const {
    normalizeProtocolIdentity, parseProtocolKeywords, parsePsArgs, parseWindowsCmdlines,
    attachProcessCmdlines, resolveKeyProcesses, computeLayout, STATUS_CARD_WIDTH,
    renderStatusOverlaySvg,
  } = m;

  console.log('\n[1] get_version_info 自报身份归一化（跨容器场景的权威来源）');
  check('SnowLuma', normalizeProtocolIdentity('SnowLuma/2.1.0', '2.1.0', 'v11')?.name === 'SnowLuma');
  check('snow-luma 变体', normalizeProtocolIdentity('snow-luma')?.name === 'SnowLuma');
  check('NapCat', normalizeProtocolIdentity('NapCat', '4.17.10')?.name === 'NapCat');
  check('NapCat 版本保留', normalizeProtocolIdentity('napcat', '4.17.10')?.version === '4.17.10');
  check('Lagrange', normalizeProtocolIdentity('Lagrange.OneBot')?.name === 'Lagrange');
  check('LLOneBot', normalizeProtocolIdentity('LLOneBot')?.name === 'LLOneBot');
  check('go-cqhttp', normalizeProtocolIdentity('go-cqhttp')?.name === 'go-cqhttp');
  check('未知实现保留原名', normalizeProtocolIdentity('MyCustomBot')?.name === 'MyCustomBot');
  check('app_name 为空 → null', normalizeProtocolIdentity('', '', '') === null);
  check('只有 protocol_version 也能确认在线', normalizeProtocolIdentity('', '', 'v11')?.name === 'OneBot 协议端');

  console.log('\n[2] 自定义关键字与命令行解析');
  check('逗号/分号/空白分隔', parseProtocolKeywords('snowluma, my-bot；foo').join('|') === 'snowluma|my-bot|foo');
  check('空值 → 空数组', parseProtocolKeywords(null).length === 0);
  check('最多 12 个', parseProtocolKeywords(Array.from({ length: 20 }, (_, i) => `k${i}`).join(',')).length === 12);
  const psArgs = parsePsArgs('  123 node /opt/napcat/napcat.mjs --foo bar\n  456 /bin/bash -c echo hi\n');
  check('ps args 取到 pid', psArgs.get('123') === 'node /opt/napcat/napcat.mjs --foo bar');
  check('ps args 第二行', psArgs.get('456') === '/bin/bash -c echo hi');
  const winMap = parseWindowsCmdlines(JSON.stringify([
    { ProcessId: 78, CommandLine: 'C:\\NapCat\\QQ.exe --load' },
    { ProcessId: 79, CommandLine: '' },
  ]));
  check('Windows CIM 命令行', winMap.get('78') === 'C:\\NapCat\\QQ.exe --load');
  check('空命令行不入库', !winMap.has('79'));
  const list0 = [proc(123, 'node')];
  check('attachProcessCmdlines 合并', attachProcessCmdlines(list0, psArgs)[0].cmdline.includes('napcat.mjs'));
  check('pid 不匹配时不污染', attachProcessCmdlines([proc(999, 'node')], psArgs)[0].cmdline === '');

  console.log('\n[3] 进程识别：node + cmdline / SnowLuma / 注入 QQ / weak');
  const napcatCmd = [proc(101, 'node', 'node /opt/napcat/napcat.mjs --config ./a.json', 320)];
  check('node napcat.mjs 能认出', protocolRow(resolveKeyProcesses(napcatCmd))?.pid === '101');
  check('认出的行有内存数据', protocolRow(resolveKeyProcesses(napcatCmd))?.memoryMB === '320');
  check('SnowLuma 进程名能认出', protocolRow(resolveKeyProcesses([proc(102, 'snowluma', '/app/snowluma')]))?.running === true);
  check('Lagrange cmdline 能认出', protocolRow(resolveKeyProcesses([proc(103, 'dotnet', 'Lagrange.OneBot')]))?.running === true);
  check('weak onebot 进程名兜底', protocolRow(resolveKeyProcesses([proc(104, 'onebot-worker')]))?.running === true);
  check('QQ.exe 归到 QQ 行', resolveKeyProcesses([proc(105, 'QQ.exe', 'C:\\QQ\\QQ.exe')]).find((r) => r.key === 'qq')?.pid === '105');
  const rows3 = resolveKeyProcesses([proc(101, 'node', 'node /opt/napcat/napcat.mjs')]);
  check('三行齐全且顺序固定', rows3.map((r) => r.key).join(',') === 'host,qq,protocol');
  check('host 行可用 hostLabel', resolveKeyProcesses([], { hostLabel: '咔咔珂' }).find((r) => r.key === 'host')?.name === '同宿主进程（咔咔珂）');

  console.log('\n[4] 自定义关键字生效 / 不自我误判');
  check('自定义关键字命中', protocolRow(resolveKeyProcesses(
    [proc(106, 'my-custom-bot', '/usr/bin/my-custom-bot --serve')],
    { customPatterns: ['my-custom-bot'] },
  ))?.pid === '106');
  const selfPid = String(process.pid);
  check('排除插件自身进程', protocolRow(resolveKeyProcesses(
    [proc(selfPid, 'node', `node /root/kakake/napcat-probe.mjs`)],
  ))?.running === false);

  console.log('\n[5] 跨容器 / 远程：进程不可见时用协议自报身份兜底');
  const empty = resolveKeyProcesses([]);
  check('无身份时明确提示可配置', protocolRow(empty)?.name === '未检测到（可配置关键字）');
  check('无身份时 running=false', protocolRow(empty)?.running === false);
  const identity = normalizeProtocolIdentity('SnowLuma', '2.1.0', 'v11');
  const fallback = resolveKeyProcesses([], { protocolIdentity: identity });
  const fb = protocolRow(fallback);
  check('兜底行显示框架名', String(fb?.name).includes('SnowLuma'));
  check('兜底行显示版本', String(fb?.name).includes('v2.1.0'));
  check('兜底行说明进程不可见', String(fb?.name).includes('进程不可见'));
  check('兜底行视为在线', fb?.running === true);
  check('兜底行 PID 为 —', fb?.pid === '—');
  check('进程可见时优先用真实进程', protocolRow(resolveKeyProcesses(napcatCmd, { protocolIdentity: identity }))?.pid === '101');

  console.log('\n[6] 渲染端：文案与单位');
  const layout = computeLayout(STATUS_CARD_WIDTH, 0, 1, 1, ['MKbot v2.3.13']);
  const baseOpts = {
    name: 'Bot', qq: '10001', type: 'Linux', arch: 'x64', cpuCount: 4,
    cpuUsagePercent: '10', totalMemoryGB: '8 GB', memoryUsagePercent: '30',
    diskTotalGB: '100 GB', diskUsedGB: '40 GB', diskFreeGB: '60 GB',
    diskUsagePercent: '40', pluginVersion: '2.3.13',
  };
  const svg = renderStatusOverlaySvg(layout, {
    ...baseOpts,
    keyProcesses: fallback.map((r) => r.key === 'protocol'
      ? {
        label: r.label, name: r.name, pid: r.pid,
        memoryMB: r.memoryMB, cpuPercent: r.cpuPercent, running: r.running,
      }
      : {
        label: r.label, name: r.key === 'qq' ? 'QQ.exe' : '同宿主进程',
        pid: '123', memoryMB: '120.0', cpuPercent: '1.0', running: true,
      }),
  }, null);
  check('卡片含协议框架名', svg.includes('SnowLuma'));
  check('卡片不再显示「未检测到」', !svg.includes('未检测到'));
  check('占位值不拼出「— MB」', !svg.includes('— MB'));
  check('占位值不拼出「—%」', !svg.includes('—%'));
  check('关键进程分组标题存在', svg.includes('关键进程'));
}

try {
  await main();
} finally {
  removeTmpDir(tmpRoot);
}

if (failures.length) {
  console.error(`\n失败 ${failures.length} 项：\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`\n通过 ${passed} 项，全部通过`);
