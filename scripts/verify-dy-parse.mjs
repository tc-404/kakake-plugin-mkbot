/**
 * 抖音解析回归验证：直接跑构建产物 kakake-plugin-mkbot/lib/api/dy.mjs
 *
 * 用法：node scripts/verify-dy-parse.mjs
 * 需要先执行 `node scripts/build-api.mjs` 生成 lib/api/*.mjs
 *
 * 抖音的免签名通道（开放平台来源头 / 移动端 Feed）随时可能再变，
 * 改完 dy.ts 或线上突然解析不出东西时，先跑这个脚本确认是哪条路断了。
 */
import { resolve, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const modPath = resolve(root, 'kakake-plugin-mkbot/lib/api/dy.mjs');

if (!existsSync(modPath)) {
  console.error(`[verify-dy-parse] 找不到 ${modPath}，请先执行 node scripts/build-api.mjs`);
  process.exit(2);
}

const { parse } = await import(pathToFileURL(modPath).href);

/** 用例用真实分享文案（含口令尾巴），顺便验证链接提取与尾部清理 */
const CASES = [
  {
    name: '图文作品（图集）',
    input:
      '4.84 复制打开抖音，看看【拒绝过大喵的人的图文作品】敢！# 暖暖Nikki# 暖暖# 萌物# 粉色雪媚... https://v.douyin.com/J6ideETCFMU/ c@N.wS 09/27 :3pm pdA:/',
    expect: 'image',
  },
  {
    name: '常规视频',
    input:
      '5.89 复制打开抖音，看看【🌈安妮的作品】當同學說把狗放桌上會影響上課😭  https://v.douyin.com/Db9Deh0nqu4/ 02/13 :4pm OKw:/ N@j.Px',
    expect: 'video',
  },
];

let failed = 0;

for (const c of CASES) {
  const t0 = Date.now();
  let r;
  try {
    r = await parse(c.input);
  } catch (e) {
    failed++;
    console.log(`\n=== ${c.name} ===`);
    console.log(`  ❌ parse 抛异常：${e instanceof Error ? e.message : e}`);
    continue;
  }
  const cost = Date.now() - t0;
  console.log(`\n=== ${c.name} ===`);
  console.log(`  code=${r.code} msg=${r.msg} 耗时=${cost}ms`);

  if (r.code !== 200 || !r.data) {
    failed++;
    console.log('  ❌ 未取到数据');
    continue;
  }

  const d = r.data;
  console.log(`  type       = ${d.type}`);
  console.log(`  title      = ${String(d.title).slice(0, 40)}`);
  console.log(`  author     = ${d.author.name}`);
  console.log(`  cover      = ${String(d.cover).slice(0, 60)}`);
  console.log(`  url        = ${String(d.url ?? '-').slice(0, 60)}`);
  console.log(`  images     = ${d.images.length} 张`);
  console.log(`  live_photo = ${d.live_photo.length} 组`);

  const problems = [];
  if (d.type !== c.expect) problems.push(`类型应为 ${c.expect}，实为 ${d.type}`);
  if (d.type === 'video' && !d.url) problems.push('视频缺少播放地址');
  if (d.type !== 'video' && !d.images.length) problems.push('图集缺少图片地址');
  if (!d.cover) problems.push('缺少封面');

  if (problems.length) {
    failed++;
    for (const p of problems) console.log(`  ❌ ${p}`);
  } else {
    console.log('  ✅ 通过');
  }
}

console.log(`\n[verify-dy-parse] 失败 ${failed} / ${CASES.length}`);
process.exit(failed ? 1 : 0);
