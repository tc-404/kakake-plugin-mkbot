// 私聊解禁自检：价格公式 + 模块分支逻辑（群开关 / 权限 / 扣费时机 / 节流）
//
// 走项目自带的 esbuild 编译真实源码；BOT 与授权用临时 stub 替换，
// 使「发消息 / 休眠 / 接口调用」可被记录，从而在无 QQ 环境下验证分支与回执。
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';

const root = process.cwd();
// 落在本项目内再清理：部分环境下 os.tmpdir() 不允许写入
const tmp = fs.mkdtempSync(path.join(root, '.verify-tmp-'));
const outdir = path.join(tmp, 'build');
fs.mkdirSync(outdir, { recursive: true });

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

// ---------------------------------------------------------------------------
// stub：替换 ../BOT 与 ../lib/unauth-reply
// ---------------------------------------------------------------------------
const stubBot = path.join(tmp, 'stub-bot.ts');
fs.writeFileSync(stubBot, `
export const __log = [];
export async function 发消息(event, segs, opts) { __log.push({ event, segs, opts }); }
export function 段_引用(id) { return { __reply: id }; }
export function 段_文本(t) { return { __text: String(t) }; }
`, 'utf-8');

const stubUnauth = path.join(tmp, 'stub-unauth.ts');
fs.writeFileSync(stubUnauth, `
export async function requireAuthorized(RC_sq) { return RC_sq === '已授权'; }
`, 'utf-8');

const mockPlugin = {
  name: 'mk-unmute-mock',
  setup(b) {
    b.onResolve({ filter: /\.\.\/BOT$/ }, () => ({ path: stubBot }));
    b.onResolve({ filter: /unauth-reply$/ }, () => ({ path: stubUnauth }));
  },
};

// ---------------------------------------------------------------------------
// ① 价格模块（真实源码）
// ---------------------------------------------------------------------------
await build({
  entryPoints: [path.resolve(root, 'src/lib/unmute-price.ts')],
  outfile: path.join(outdir, 'price.mjs'),
  bundle: true, format: 'esm', platform: 'node', target: 'node20', logLevel: 'error',
});
const P = await import(pathToFileURL(path.join(outdir, 'price.mjs')).href);

console.log('\n[1] 默认值');
const d = P.defaultUnmutePriceConfig();
check('初始收费 500', d.初始收费 === 500, String(d.初始收费));
check('上涨百分比 20', d.上涨百分比 === 20, String(d.上涨百分比));
check('免费次数 3', P.UNMUTE_FREE_TIMES === 3);

console.log('\n[2] 价格序列（初始 500 / 涨幅 20%）');
const cfg = { 初始收费: 500, 上涨百分比: 20 };
const seq = [];
for (let n = 0; n <= 9; n++) seq.push(P.calcUnmutePrice(n, cfg));
console.log(`     已解禁次数 0→9 : ${seq.join(' , ')}`);
check('前 3 次免费', seq[0] === 0 && seq[1] === 0 && seq[2] === 0);
check('第 4 次 = 500', seq[3] === 500, String(seq[3]));
check('第 5 次 = 600', seq[4] === 600, String(seq[4]));
check('第 6 次 = 720', seq[5] === 720, String(seq[5]));

console.log('\n[3] 每档相对上一档 ×1.2');
let ratioOk = true;
for (let n = 4; n <= 12; n++) {
  const a = P.calcUnmutePrice(n - 1, cfg);
  const b = P.calcUnmutePrice(n, cfg);
  if (Math.abs(b / a - 1.2) > 0.01) { ratioOk = false; break; }
}
check('连续档位均 ×1.2', ratioOk);

console.log('\n[4] 涨幅 0 = 不涨价');
const c0 = { 初始收费: 500, 上涨百分比: 0 };
check('第 4 次 500', P.calcUnmutePrice(3, c0) === 500);
check('第 50 次仍 500', P.calcUnmutePrice(49, c0) === 500);

console.log('\n[5] 异常输入不崩、不产生 NaN');
check('超大次数仍为有限数', Number.isFinite(P.calcUnmutePrice(200, cfg)));
check('非数字降级为免费', P.calcUnmutePrice(undefined, cfg) === 0 && P.calcUnmutePrice(NaN, cfg) === 0);
check('负数按 0 次', P.calcUnmutePrice(-5, cfg) === 0);

console.log('\n[6] 配置规范化 clamp');
check('负初始收费 → 0', P.normalizeUnmutePriceConfig({ 初始收费: -100 }).初始收费 === 0);
check('超上限百分比 → 1000', P.normalizeUnmutePriceConfig({ 上涨百分比: 99999 }).上涨百分比 === 1000);
check('负数百分比 → 0', P.normalizeUnmutePriceConfig({ 上涨百分比: -5 }).上涨百分比 === 0);
check('null → 默认', P.normalizeUnmutePriceConfig(null).初始收费 === 500);

// ---------------------------------------------------------------------------
// ② 模块分支逻辑（真实源码 + stub BOT）
// ---------------------------------------------------------------------------
// 临时入口：把被测模块与 stub 的 __log 绑到同一实例上再导出
const entryMod = path.join(tmp, 'entry-mod.ts');
fs.writeFileSync(entryMod, `
export { handlePrivateUnmuteCommands } from ${JSON.stringify(path.resolve(root, 'src/auth/private-unmute.ts'))};
export { __log } from ${JSON.stringify(stubBot)};
`, 'utf-8');

await build({
  entryPoints: [entryMod],
  outfile: path.join(outdir, 'mod.mjs'),
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
  plugins: [mockPlugin], logLevel: 'error',
});
const M = await import(pathToFileURL(path.join(outdir, 'mod.mjs')).href);

const 次数文件 = '筱筱吖/娱乐系统/私聊解禁/次数.json';
const 货币文件 = '筱筱吖/娱乐系统/游戏数据/归笺.json';
const 冷却文件 = '筱筱吖/娱乐系统/私聊解禁/冷却.json';
const 不在群缓存文件 = '筱筱吖/娱乐系统/私聊解禁/不在群缓存.json';
const now = Math.floor(Date.now() / 1000);

/** 生成 群数 个群号：10001, 10002, ... */
function 造群号(群数) {
  return Array.from({ length: 群数 }, (_, i) => String(10001 + i));
}

function 建环境(opt = {}) {
  const 群数 = opt.群数 ?? 2;
  const 群列表 = 造群号(群数);
  const 非成员群 = new Set(opt.非成员群 ?? []);
  const 调用记录 = { 成员查询: 0 };
  const 休眠记录 = [];

  const 库 = opt.库 || {
    [次数文件]: { 555: opt.已解除 ?? 0 },
    [货币文件]: { 555: opt.余额 ?? 1000 },
  };
  if (opt.冷却到期 !== undefined) 库[冷却文件] = { 555: opt.冷却到期 };

  const readB = (f, k, def) => (库[f] && 库[f][k] !== undefined) ? 库[f][k] : def;
  const writeB = (f, k, v) => { (库[f] = 库[f] || {})[k] = v; return true; };

  const BOTAPI = async (_ctx, action, params) => {
    if (action === 'get_group_list') return 群列表.map((g) => ({ group_id: g }));
    if (action === 'get_group_member_info') {
      调用记录.成员查询++;
      const { group_id, user_id } = params;
      if (Number(user_id) === 999) return { role: opt.机器人身份 ?? 'admin' };
      if (Number(user_id) === 555) {
        if (非成员群.has(String(group_id))) return { retcode: 100, wording: '成员不存在' };
        const 禁言 = (String(group_id) === '10001' || opt.全禁言) ? (opt.禁言到期 ?? (now + 3600)) : 0;
        return { role: opt.目标身份 ?? 'member', shut_up_timestamp: 禁言 };
      }
      return null;
    }
    if (action === 'set_group_ban') return opt.解禁结果 ?? { retcode: 0 };
    return null;
  };

  return {
    库, 调用记录, 休眠记录,
    d: {
      readB, writeB, BOTAPI,
      货币名: () => '归笺',
      娱乐功能按群: (_分项, 群号) => (opt.群已开 === undefined ? true : opt.群已开),
      休眠: async (ms) => { 休眠记录.push(ms); },
    },
    event: {
      message_type: opt.消息类型 ?? 'private',
      user_id: 555, self_id: 999, message_id: 1, group_id: opt.group_id,
    },
  };
}

async function 跑与环境(env, message, 授权 = '已授权') {
  M.__log.length = 0;
  const 结果 = await M.handlePrivateUnmuteCommands(message, env.event, {}, 授权, env.d);
  const 全部文本 = [];
  for (const m of M.__log) {
    for (const s of m.segs || []) {
      if (s && typeof s.__text === 'string') 全部文本.push(s.__text);
    }
  }
  return { 结果, 文本: 全部文本[全部文本.length - 1] || '', 全部文本, 库: env.库, 调用记录: env.调用记录, 休眠记录: env.休眠记录 };
}

async function 跑(message, opt = {}) {
  return 跑与环境(建环境(opt), message, opt.授权 ?? '已授权');
}

console.log('\n[7] 触发范围');
let r = await 跑('解禁', { 消息类型: 'group', group_id: 10001 });
check('群聊消息不响应', r.结果 === false, String(r.结果));
r = await 跑('你好啊');
check('私聊非指令不响应', r.结果 === false, String(r.结果));

console.log('\n[8] 授权');
r = await 跑('解禁', { 授权: '未授权' });
check('未授权时终止且不发消息', r.结果 === 'halt' && r.文本 === '');

console.log('\n[9] 群娱乐事件开关（按目标群，非私聊 scope）');
r = await 跑('解禁', { 群已开: false });
check('群没开时终止', r.结果 === 'halt');
check('提示「还没有开启」', r.文本.includes('还没有开启'), r.文本);
check('群没开时不动余额', r.库[货币文件][555] === 1000);
check('群没开时零成员查询（本地预筛）', r.调用记录.成员查询 === 0, String(r.调用记录.成员查询));

console.log('\n[10] 权限校验');
r = await 跑('解禁', { 机器人身份: 'member' });
check('机器人无群管 → 提示', r.文本.includes('没有管理权限'), r.文本);
check('机器人无群管 → 不扣费', r.库[货币文件][555] === 1000);
r = await 跑('解禁', { 目标身份: 'admin', 机器人身份: 'admin' });
check('管理员之间不能互解', r.文本.includes('身份不低于'), r.文本);
r = await 跑('解禁', { 目标身份: 'admin', 机器人身份: 'owner' });
check('群主可解管理员', r.文本.includes('已解除'), r.文本);

console.log('\n[11] 收费与扣费');
r = await 跑('解禁', { 已解除: 0 });
check('第 1 次免费', r.文本.includes('本次免费'), r.文本);
check('免费不动余额', r.库[货币文件][555] === 1000);
check('免费也计次数', r.库[次数文件][555] === 1);
r = await 跑('解禁', { 已解除: 3, 余额: 1000 });
check('第 4 次扣 500', r.库[货币文件][555] === 500, String(r.库[货币文件][555]));
check('回执含下次费用 600', r.文本.includes('600'), r.文本);
check('次数累加到 4', r.库[次数文件][555] === 4);

console.log('\n[12] 余额不足');
r = await 跑('解禁', { 已解除: 3, 余额: 100 });
check('提示货币不够', r.文本.includes('不够'), r.文本);
check('不扣费', r.库[货币文件][555] === 100);
check('不计次数', r.库[次数文件][555] === 3);

console.log('\n[13] 解禁失败不扣费（关键）');
r = await 跑('解禁', { 已解除: 3, 余额: 1000, 解禁结果: { retcode: 1200, wording: '权限不足' } });
check('提示解禁失败', r.文本.includes('解禁失败'), r.文本);
check('失败时不扣费', r.库[货币文件][555] === 1000, String(r.库[货币文件][555]));
check('失败时不计次数', r.库[次数文件][555] === 3);
check('回执说明没扣费', r.文本.includes('没有扣除'), r.文本);

console.log('\n[14] 多群与指定群号');
r = await 跑('解禁', { 全禁言: true });
check('多群被禁言 → 让选群号', r.文本.includes('请指定一个群号'), r.文本);
r = await 跑('解禁 10002', { 全禁言: true });
check('指定群号可直接办', r.文本.includes('已解除') && r.文本.includes('10002'), r.文本);
r = await 跑('解禁 88888');
check('指定不在的群 → 提示', r.文本.includes('我不在群'), r.文本);
r = await 跑('解禁', { 禁言到期: 0 });
check('没被禁言 → 提示', r.文本.includes('没有被禁言'), r.文本);

// ---------------------------------------------------------------------------
// ③ 节流：等待回执 + 分批冷却 + 缓存降调用
// ---------------------------------------------------------------------------
console.log('\n[15] 等待回执（指令后立刻有反馈）');
r = await 跑('解禁', { 群数: 2 });
check('首条是「查询中请稍等」', (r.全部文本[0] || '').includes('请稍等'), r.全部文本[0] || '(无)');
check('首条含查询群数', (r.全部文本[0] || '').includes('2'), r.全部文本[0] || '(无)');
r = await 跑('解禁 10002', { 群数: 2, 全禁言: true });
check('指定群号也会先回执', (r.全部文本[0] || '').includes('请稍等'), r.全部文本[0] || '(无)');

console.log('\n[16] 分批冷却（每 10 个群 4 秒）');
r = await 跑('解禁', { 群数: 2, 全禁言: true });
check('2 群 = 1 批 → 不冷却', r.休眠记录.length === 0, JSON.stringify(r.休眠记录));
r = await 跑('解禁', { 群数: 10, 全禁言: true });
check('10 群 = 1 批 → 不冷却', r.休眠记录.length === 0, JSON.stringify(r.休眠记录));
check('10 群全部查完', r.调用记录.成员查询 === 10, String(r.调用记录.成员查询));
r = await 跑('解禁', { 群数: 25, 全禁言: true });
check('25 群 = 3 批 → 冷却 2 次', r.休眠记录.length === 2, JSON.stringify(r.休眠记录));
check('每次冷却 4000ms', r.休眠记录.every((x) => x === 4000), JSON.stringify(r.休眠记录));
r = await 跑('解禁', { 群数: 300, 全禁言: true });
check('300 群被上限截断到 60', r.调用记录.成员查询 === 60, String(r.调用记录.成员查询));
check('60 群 = 6 批 → 冷却 5 次', r.休眠记录.length === 5, JSON.stringify(r.休眠记录));

console.log('\n[17] 不在群缓存（第二次起大幅降调用）');
const env17 = 建环境({ 群数: 12, 非成员群: 造群号(12).slice(2) });
r = await 跑与环境(env17, '解禁');
// 12 = 10 个「不在群」 + 2 个在群；+2 是第⑦⑧步对机器人身份、目标身份的复检
check('首次全查 14 次（12 扫描 + 2 复检）', r.调用记录.成员查询 === 14, String(r.调用记录.成员查询));
check('缓存记下 10 个不在的群', Object.keys(r.库[不在群缓存文件][555]).length === 10,
  String(Object.keys(r.库[不在群缓存文件]?.[555] || {}).length));
delete r.库[冷却文件]; // 绕过 15 秒指令冷却，验证缓存本身
r.调用记录.成员查询 = 0;
r = await 跑与环境(env17, '解禁');
// 2 个在群的群走扫描，另 2 次是身份复检；10 个已缓存的「不在群」被跳过
check('第二次只查 4 次（2 扫描 + 2 复检）', r.调用记录.成员查询 === 4, String(r.调用记录.成员查询));
check('第二次结果仍正确', r.文本.includes('已解除'), r.文本);
r.调用记录.成员查询 = 0;
r = await 跑与环境(env17, '解禁 10003');
check('指定群号可绕过缓存', r.调用记录.成员查询 >= 1, String(r.调用记录.成员查询));

console.log('\n[18] 指令冷却');
r = await 跑('解禁', { 群数: 12, 冷却到期: Date.now() + 10000 });
check('冷却中 → 提示稍后再试', r.文本.includes('刚刚才帮你查过'), r.文本);
check('冷却中 → 零成员查询', r.调用记录.成员查询 === 0, String(r.调用记录.成员查询));
r = await 跑('解禁 10001', { 群数: 12, 冷却到期: Date.now() + 10000 });
check('指定群号不受冷却限制', r.文本.includes('已解除'), r.文本);
r = await 跑('解禁', { 群数: 12, 全禁言: true });
check('扫完会写入冷却', Number(r.库[冷却文件][555]) > Date.now(), String(r.库[冷却文件][555]));

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail ? 1 : 0);
