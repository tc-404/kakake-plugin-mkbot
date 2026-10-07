// 真跑源码的回归校验：下载超时必须是「空闲超时 + 整体上限」，不能只有不重置的整体超时。
// 背景：视频解析把宿主 API 超时（120s）当下载超时用，且旧实现收数据期间不重置，
//       大文件在慢 CDN 上明明一直在下，却被 abort → `下载超时: 120000ms`。
//
// 运行：npm run verify:download-timeout

import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const bundleOut = path.resolve(process.cwd(), '.verify-download-timeout.mjs');
const {
  createDownloadTimeout,
  estimateBase64Length,
  maxInlineBytesForBase64Limit,
  MK_MEDIA_BASE64_LIMIT,
  MK_MEDIA_INLINE_MAX_BYTES,
} = await (async () => {
  await build({
    entryPoints: ['src/lib/download-timeout.ts'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile: bundleOut,
    logLevel: 'silent',
  });
  return import(pathToFileURL(bundleOut).href);
})();

let passed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const servers = [];

/** 起一个 HTTP 服务：每 intervalMs 发一批数据，共 chunks 批；stall=true 则发一批后卡住 */
function startServer({ chunks, intervalMs, chunkBytes = 1024, stall = false }) {
  const server = http.createServer(async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    for (let i = 0; i < chunks; i++) {
      res.write(Buffer.alloc(chunkBytes, 0x41));
      await new Promise((r) => setTimeout(r, intervalMs));
      if (stall) {
        // 卡住：不再发数据，也不结束响应
        await new Promise((r) => setTimeout(r, 60_000));
        return;
      }
    }
    res.end();
  });
  server.listen(0);
  servers.push(server);
  return new Promise((resolve) => server.on('listening', () => resolve(server.address().port)));
}

async function fetchAll(port, timeout, { resetOnData = true } = {}) {
  const t = createDownloadTimeout(timeout);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/x`, { signal: t.signal });
    const reader = res.body.getReader();
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (resetOnData) t.reset();
      if (value) bytes += value.byteLength;
    }
    return { ok: true, bytes };
  } catch (e) {
    return { ok: false, error: e };
  } finally {
    t.dispose();
  }
}

console.log('[1] 慢速但持续：整体上限内应能下完（旧实现会误判）');
{
  // 8 批 × 250ms = 约 2s；整体上限给 10s，空闲超时 500ms
  const port = await startServer({ chunks: 8, intervalMs: 250 });
  const r = await fetchAll(port, { stallMs: 500, totalMs: 10_000 });
  check('持续出数据时不被空闲超时误杀', r.ok === true, String(r.error?.message || ''));
  check('收满 8KB', r.bytes === 8 * 1024, `实际 ${r.bytes}`);
}

console.log('\n[2] 真卡死：空闲超时应触发');
{
  const port = await startServer({ chunks: 1, intervalMs: 10, stall: true });
  const t0 = Date.now();
  const r = await fetchAll(port, { stallMs: 400, totalMs: 60_000 });
  const cost = Date.now() - t0;
  check('卡死后被 abort', r.ok === false);
  check('是在空闲超时点附近触发（而非等整体上限）', cost < 3_000, `耗时 ${cost}ms`);
}

console.log('\n[3] 整体上限仍然生效（防止慢到永远下不完）');
{
  // 40 批 × 200ms = 8s，整体上限只给 1.5s
  const port = await startServer({ chunks: 40, intervalMs: 200 });
  const r = await fetchAll(port, { stallMs: 5_000, totalMs: 1_500 });
  check('超整体上限被 abort', r.ok === false);
}

console.log('\n[4] 不设整体上限（totalMs=0）时不被拖死判定误伤');
{
  const port = await startServer({ chunks: 6, intervalMs: 120 });
  const r = await fetchAll(port, { stallMs: 300, totalMs: 0 });
  check('只受空闲超时约束，能下完', r.ok === true, String(r.error?.message || ''));
}

console.log('\n[5] 内联上限换算（与 BOT.ts 媒体出口同一口径）');
{
  const buf = Buffer.alloc(8 * 1024 * 1024, 0x41);
  check(
    'estimateBase64Length 与 Node 真实 base64 长度一致',
    estimateBase64Length(buf.length) === buf.toString('base64').length,
    `估算 ${estimateBase64Length(buf.length)} vs 实际 ${buf.toString('base64').length}`,
  );
}
check(
  'maxInlineBytesForBase64Limit(90MB) ≈ 67.5MB',
  MK_MEDIA_INLINE_MAX_BYTES === 70_778_880,
  String(MK_MEDIA_INLINE_MAX_BYTES),
);
check(
  '67.5MB 转 base64 后不超过 90MB 上限',
  estimateBase64Length(MK_MEDIA_INLINE_MAX_BYTES) <= MK_MEDIA_BASE64_LIMIT,
);
check(
  '68MB 转 base64 后超过上限（应降级放 URL）',
  estimateBase64Length(68 * 1024 * 1024) > MK_MEDIA_BASE64_LIMIT,
);

for (const s of servers) s.close();
try {
  fs.unlinkSync(bundleOut);
} catch {}

console.log(`\n通过 ${passed} 项${failures.length ? `，失败 ${failures.length} 项：` : '，全部通过'}`);
for (const f of failures) console.log(`  - ${f}`);
process.exit(failures.length ? 1 : 0);
