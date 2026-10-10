// 闯金库自检：配置规范化 + 敞口/档位计算 + 模块分支（冷却/门槛/成败/充公/禁言/流水）
//
// 走项目自带的 esbuild 编译真实源码；BOT、授权、data-fs 用临时 stub 替换，
// 使「发消息 / 接口调用 / 文件读写」全部落在内存里，从而在无 QQ 环境下验证。
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { build } from 'esbuild';

const root = process.cwd();
const tmp = fs.mkdtempSync(path.join(root, '.verify-tmp-'));
const outdir = path.join(tmp, 'build');
fs.mkdirSync(outdir, { recursive: true });

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

const 原随机 = Math.random;
function 定随机(v) { Math.random = () => v; }
function 还原随机() { Math.random = 原随机; }

/** 是否含 emoji / 杂项符号（回执要求纯文本，不出现小表情） */
// 只算真正的 emoji / 符号，不含箭头「→」与制表符「─═」（用户没要求去掉这些）
const 表情正则 = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
function 有表情(s) { return 表情正则.test(String(s || '')); }

// ---------------------------------------------------------------------------
// stub
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

// 内存版 data-fs：连金库文件、配置、流水都不落真磁盘
const stubFs = path.join(tmp, 'stub-data-fs.ts');
fs.writeFileSync(stubFs, `
const 库 = new Map();
export function __store() { return 库; }
export function __reset() { 库.clear(); }
export function setDataPath() {}
export function getDataPath() { return '<memory>'; }
export function setPluginPath() {}
export function getPluginPath() { return '<memory>'; }
export function getDefaultResourceDir() { return ''; }
export function resolvePluginOrDataPath(f) { return String(f); }
export function bindMkbotLogger() {}
export function readA(f) { return 库.has(String(f)) ? 库.get(String(f)) : ''; }
export function writeA(f, c) { 库.set(String(f), String(c)); return true; }
export function deleteA(f) { 库.delete(String(f)); return true; }
export function readB(f, k, d) {
  let o = {};
  try { const t = 库.get(String(f)); if (t) o = JSON.parse(t); } catch (_e) { o = {}; }
  return (o && k in o && o[k] !== null && o[k] !== undefined) ? o[k] : d;
}
export function writeB(f, k, v) {
  let o = {};
  try { const t = 库.get(String(f)); if (t) o = JSON.parse(t); } catch (_e) { o = {}; }
  o[k] = v;
  库.set(String(f), JSON.stringify(o));
  return true;
}
export function deleteKey(f, k) { const o = JSON.parse(库.get(String(f)) || '{}'); delete o[k]; 库.set(String(f), JSON.stringify(o)); return true; }
export function hasKey(f, k) { return k in JSON.parse(库.get(String(f)) || '{}'); }
export function getKeys(f) { return Object.keys(JSON.parse(库.get(String(f)) || '{}')); }
export function clear(f) { 库.set(String(f), '{}'); return true; }
`, 'utf-8');

const mockPlugin = {
  name: 'mk-vault-mock',
  setup(b) {
    b.onResolve({ filter: /\.\.\/BOT$/ }, () => ({ path: stubBot }));
    b.onResolve({ filter: /unauth-reply$/ }, () => ({ path: stubUnauth }));
    b.onResolve({ filter: /data-fs$/ }, () => ({ path: stubFs }));
  },
};

// ---------------------------------------------------------------------------
// ① 配置 / 计算模块（真实源码）
// ---------------------------------------------------------------------------
const entryLib = path.join(tmp, 'entry-lib.ts');
fs.writeFileSync(entryLib, `
export * from ${JSON.stringify(path.resolve(root, 'src/lib/vault-raid.ts'))};
export { __store, __reset } from ${JSON.stringify(stubFs)};
`, 'utf-8');

await build({
  entryPoints: [entryLib],
  outfile: path.join(outdir, 'lib.mjs'),
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
  plugins: [mockPlugin], logLevel: 'error',
});
const L = await import(pathToFileURL(path.join(outdir, 'lib.mjs')).href);

console.log('\n[1] 默认配置');
const d = L.defaultVaultRaidConfig();
check('冷却 15 分钟', d.冷却分钟 === 15, String(d.冷却分钟));
check('成功率 50', d.成功率 === 50, String(d.成功率));
check('低等奖励 100', d.低等奖励 === 100);
check('高等奖励 5~15%', d.高等奖励最小百分比 === 5 && d.高等奖励最大百分比 === 15);
check('隐藏级 0.5~5 倍', d.隐藏最小倍数 === 0.5 && d.隐藏最大倍数 === 5);
check('禁言 5~15 分钟', d.禁言最小分钟 === 5 && d.禁言最大分钟 === 15);
check('敞口倍数 5', d.敞口倍数 === 5);
check('存款敞口系数 0.1', d.存款敞口系数 === 0.1);
check('金库上限 0 = 不限', d.金库上限 === 0);
check('利息税 10%', d.利息税百分比 === 10);

console.log('\n[2] 配置规范化 clamp 与 min/max 纠正');
check('负冷却 → 0', L.normalizeVaultRaidConfig({ 冷却分钟: -5 }).冷却分钟 === 0);
check('成功率 999 → 100', L.normalizeVaultRaidConfig({ 成功率: 999 }).成功率 === 100);
check('禁言 99999 → 43200', L.normalizeVaultRaidConfig({ 禁言最大分钟: 99999 }).禁言最大分钟 === 43200);
const 反 = L.normalizeVaultRaidConfig({ 中等奖励最小: 500, 中等奖励最大: 100 });
check('中等奖励 min>max 纠正', 反.中等奖励最大 === 500, String(反.中等奖励最大));
const 反2 = L.normalizeVaultRaidConfig({ 隐藏最小倍数: 8, 隐藏最大倍数: 2 });
check('隐藏倍数 min>max 纠正', 反2.隐藏最大倍数 === 8, String(反2.隐藏最大倍数));
check('null → 默认', L.normalizeVaultRaidConfig(null).冷却分钟 === 15);

console.log('\n[3] 风险敞口（反白嫖核心）');
check('现金 1000 × 5 = 5000', L.calc敞口(1000, 0) === 5000, String(L.calc敞口(1000, 0)));
check('存款 10000 × 0.1 = 1000', L.calc敞口(0, 10000) === 1000, String(L.calc敞口(0, 10000)));
check('现金 100 + 存款 1000 = 600', L.calc敞口(100, 1000) === 600, String(L.calc敞口(100, 1000)));
check('全 0 → 敞口 0', L.calc敞口(0, 0) === 0);
check('负数按 0', L.calc敞口(-100, -100) === 0);

console.log('\n[4] 空手门槛');
check('现金 0 + 存款 0 → 空手', L.是空手(0, 0) === true);
check('有存款就不算空手', L.是空手(0, 1) === false);
check('有现金就不算空手', L.是空手(1, 0) === false);

console.log('\n[5] 奖励档位计算（定随机 0.5 取区间中点）');
定随机(0.5);
check('低等 = 固定 100', L.calc奖励('低等', 1000, 10000) === 100, String(L.calc奖励('低等', 1000, 10000)));
check('中等 = 175（50~300 中点）', L.calc奖励('中等', 1000, 10000) === 175, String(L.calc奖励('中等', 1000, 10000)));
check('高等 = 金库 10000 × 10% = 1000', L.calc奖励('高等', 1000, 10000) === 1000, String(L.calc奖励('高等', 1000, 10000)));
check('隐藏 = 现金 1000 × 2.75 = 2750', L.calc奖励('隐藏', 1000, 10000) === 2750, String(L.calc奖励('隐藏', 1000, 10000)));
check('金库为 0 时高等 = 0', L.calc奖励('高等', 1000, 0) === 0);
check('现金为 0 时隐藏 = 0', L.calc奖励('隐藏', 0, 10000) === 0);
check('奖励恒为整数', Number.isInteger(L.calc奖励('高等', 777, 12345)) && Number.isInteger(L.calc奖励('隐藏', 777, 12345)));

console.log('\n[6] 档位抽取（按权重）');
定随机(0.1);
check('随机 0.1 → 奖励低等', L.抽奖励档位() === '低等', L.抽奖励档位());
check('随机 0.1 → 惩罚低等', L.抽惩罚档位() === '低等', L.抽惩罚档位());
定随机(0.6);
check('随机 0.6 → 奖励中等', L.抽奖励档位() === '中等', L.抽奖励档位());
check('随机 0.6 → 惩罚中等', L.抽惩罚档位() === '中等', L.抽惩罚档位());
定随机(0.9);
check('随机 0.9 → 奖励高等', L.抽奖励档位() === '高等', L.抽奖励档位());
check('随机 0.9 → 惩罚高等', L.抽惩罚档位() === '高等', L.抽惩罚档位());
定随机(0.99);
check('随机 0.99 → 奖励隐藏', L.抽奖励档位() === '隐藏', L.抽奖励档位());

console.log('\n[7] 惩罚与禁言');
定随机(0.5);
check('低等惩罚 = 固定 50', L.calc罚款('低等', 1000) === 50, String(L.calc罚款('低等', 1000)));
check('中等惩罚 = 90（30~150 中点）', L.calc罚款('中等', 1000) === 90, String(L.calc罚款('中等', 1000)));
check('高等惩罚 = 现金 1000 × 10% = 100', L.calc罚款('高等', 1000) === 100, String(L.calc罚款('高等', 1000)));
check('现金 0 时高等惩罚 = 0', L.calc罚款('高等', 0) === 0);
check('禁言 = 10（5~15 中点）', L.calc禁言分钟() === 10, String(L.calc禁言分钟()));

console.log('\n[8] 成败掷骰边界');
check('成功率 0 → 必败', L.掷成败({ ...d, 成功率: 0 }) === false);
check('成功率 100 → 必胜', L.掷成败({ ...d, 成功率: 100 }) === true);
还原随机();

console.log('\n[9] 金库：不透支 / 上限 / 充公');
L.__reset();
check('初始为 0', L.读金库() === 0);
L.金库入账(5000);
check('入账 5000', L.读金库() === 5000, String(L.读金库()));
check('出账不透支：取 8000 只给 5000', L.金库出账(8000) === 5000, String(L.金库出账(8000)));
check('出账后归 0', L.读金库() === 0);
L.__reset();
L.写金库(9999, { ...d, 金库上限: 1000 });
check('金库上限 1000 生效', L.读金库() === 1000, String(L.读金库()));
L.__reset();
check('负数入账按 0', (L.金库入账(-100), L.读金库()) === 0);

// ---------------------------------------------------------------------------
// ② 指令模块（真实源码 + stub）
// ---------------------------------------------------------------------------
const entryMod = path.join(tmp, 'entry-mod.ts');
fs.writeFileSync(entryMod, `
export { handleVaultRaidCommands } from ${JSON.stringify(path.resolve(root, 'src/auth/vault-raid.ts'))};
export * from ${JSON.stringify(path.resolve(root, 'src/lib/vault-raid.ts'))};
export { __log } from ${JSON.stringify(stubBot)};
export { __store, __reset, readB, writeB, readA, writeA } from ${JSON.stringify(stubFs)};
`, 'utf-8');

await build({
  entryPoints: [entryMod],
  outfile: path.join(outdir, 'mod.mjs'),
  bundle: true, format: 'esm', platform: 'node', target: 'node20',
  plugins: [mockPlugin], logLevel: 'error',
});
const M = await import(pathToFileURL(path.join(outdir, 'mod.mjs')).href);

const 货币文件 = '筱筱吖/娱乐系统/游戏数据/归笺.json';
const 银行文件 = '筱筱吖/娱乐系统/游戏数据/银行系统/银行归笺.json';

function 建环境(opt = {}) {
  M.__reset();
  M.清抬价缓存();
  // 初始账本（走内存 data-fs，与 deps 是同一份 store）
  if (opt.现金 !== undefined) M.writeB(货币文件, 555, opt.现金);
  if (opt.存款 !== undefined) M.writeB(银行文件, 555, opt.存款);
  // 全员账本（给抬价系数算人均净资产用）
  if (opt.全员现金) M.writeA(货币文件, JSON.stringify(opt.全员现金));
  if (opt.全员存款) M.writeA(银行文件, JSON.stringify(opt.全员存款));
  if (opt.金库 !== undefined) M.写金库(opt.金库, opt.配置);
  // 模块测试要确定性：默认关掉抬价（系数恒为 1），抬价本身在 [20] 单独测
  const 基础配置 = { ...M.defaultVaultRaidConfig(), 自动抬价: false };
  // 模块测试默认关抬价；要测抬价就传 opt.开启抬价（另见 [20]，那里直接测 lib 层）
  M.saveVaultRaidConfig(opt.配置
    ? { ...基础配置, ...opt.配置, 自动抬价: opt.开启抬价 === true }
    : { ...基础配置, 自动抬价: opt.开启抬价 === true });
  if (opt.冷却到期 !== undefined) M.writeB(M.VAULT_RAID_COOLDOWN_PATH, 555, opt.冷却到期);

  const 调用 = { 禁言: [], 免死查询: 0 };
  const BOTAPI = async (_ctx, action, params) => {
    if (action === 'get_group_member_info') {
      const uid = Number(params.user_id);
      if (uid === 999) return { role: opt.机器人身份 ?? 'admin' };
      if (uid === 555) return { role: opt.目标身份 ?? 'member' };
      return null;
    }
    if (action === 'set_group_ban') { 调用.禁言.push(params); return { retcode: 0 }; }
    return null;
  };
  return {
    调用,
    d: {
      readB: M.readB, writeB: M.writeB, BOTAPI,
      货币名: () => '归笺',
      免死金牌: async () => { 调用.免死查询++; return !!opt.免死; },
    },
    event: {
      message_type: opt.消息类型 ?? 'group',
      user_id: 555, self_id: 999, message_id: 1, group_id: opt.群号 ?? 10001,
    },
  };
}

async function 跑(message, opt = {}) {
  const env = 建环境(opt);
  M.__log.length = 0;
  const 结果 = await M.handleVaultRaidCommands(message, env.event, {}, opt.授权 ?? '已授权', env.d);
  const 文本 = (M.__log.map((m) => (m.segs || []).map((s) => s && s.__text).filter(Boolean).join('')).pop()) || '';
  return {
    结果, 文本, env,
    现金: Number(M.readB(货币文件, 555, 0)) || 0,
    存款: Number(M.readB(银行文件, 555, 0)) || 0,
    金库: M.读金库(),
  };
}

console.log('\n[10] 触发范围与授权');
let r = await 跑('闯金库', { 消息类型: 'private' });
check('私聊不触发', r.结果 === false, String(r.结果));
r = await 跑('你好');
check('群聊非指令不响应', r.结果 === false, String(r.结果));
r = await 跑('闯金库', { 授权: '未授权' });
check('未授权终止且不发消息', r.结果 === 'halt' && r.文本 === '');
r = await 跑('打劫', { 现金: 1000 });
check('原版「打劫」不被本模块吃', r.结果 === false, String(r.结果));

console.log('\n[11] 冷却');
r = await 跑('闯金库', { 现金: 1000, 冷却到期: Math.floor(Date.now() / 1000) + 300 });
check('冷却中提示等待', r.文本.includes('还需等待'), r.文本);
check('冷却中显示预计时间', /预计时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(r.文本), r.文本);
check('冷却中不扣钱', r.现金 === 1000);
check('冷却中不调禁言', r.env.调用.禁言.length === 0);

console.log('\n[12] 空手门槛（反白嫖第一条）');
r = await 跑('闯金库', { 现金: 0, 存款: 0 });
check('两手空空被拦', r.文本.includes('两手空空'), r.文本);
check('被拦时不写冷却', Number(M.readB(M.VAULT_RAID_COOLDOWN_PATH, 555, 0)) === 0);
r = await 跑('闯金库', { 现金: 0, 存款: 500, 配置: { ...d, 成功率: 0 } });
check('没现金但有存款可以玩', r.文本.includes('闯库失败'), r.文本);

console.log('\n[13] 成功：入账 + 金库减少（定随机 0.1 → 低等固定 100）');
定随机(0.1);
r = await 跑('闯金库', { 现金: 1000, 金库: 10000, 配置: { ...d, 成功率: 100 } });
check('现金 +100', r.现金 === 1100, String(r.现金));
check('金库 -100', r.金库 === 9900, String(r.金库));
check('回执含「得手」', r.文本.includes('得手'), r.文本);
check('成功不禁言', r.env.调用.禁言.length === 0);
check('成功写冷却', Number(M.readB(M.VAULT_RAID_COOLDOWN_PATH, 555, 0)) > Date.now() / 1000);
还原随机();

console.log('\n[14] 敞口封顶（反白嫖第二条）');
定随机(0.99); // 隐藏档：现金 × 倍数
r = await 跑('闯金库', {
  现金: 100, 存款: 0, 金库: 1000000,
  配置: { ...d, 成功率: 100, 敞口倍数: 5, 隐藏最小倍数: 5, 隐藏最大倍数: 5 },
});
check('隐藏档原值 500 被敞口 500 放行', r.现金 === 600, String(r.现金));
r = await 跑('闯金库', {
  现金: 100, 存款: 0, 金库: 1000000,
  配置: { ...d, 成功率: 100, 敞口倍数: 2, 隐藏最小倍数: 5, 隐藏最大倍数: 5 },
});
check('敞口 200 时只拿 200', r.现金 === 300, String(r.现金));
check('回执说明已按上限折算', r.文本.includes('已按上限折算'), r.文本);
还原随机();

console.log('\n[15] 失败：罚没 + 充公 + 禁言');
定随机(0.1); // 低等惩罚 50，禁言中点 10
r = await 跑('闯金库', { 现金: 1000, 存款: 5000, 金库: 10000, 配置: { ...d, 成功率: 0 } });
check('现金 -50', r.现金 === 950, String(r.现金));
check('存款分毫不动', r.存款 === 5000, String(r.存款));
check('罚没款充公进金库 → 10050', r.金库 === 10050, String(r.金库));
check('禁言被调用一次', r.env.调用.禁言.length === 1, String(r.env.调用.禁言.length));
// 定随机 0.1 → 禁言整数随机(5,15) 取 6 分钟
check('禁言时长 6 分钟 = 360 秒', r.env.调用.禁言[0]?.duration === 360, String(r.env.调用.禁言[0]?.duration));
check('回执不再提「充公」', !r.文本.includes('充公'), r.文本);
check('回执不再显示存款', !r.文本.includes('存款'), r.文本);
check('回执不再显示金库余额行', !r.文本.includes('金库：'), r.文本);
check('回执无小表情', !有表情(r.文本), r.文本);
check('回执含预计时间', /预计时间：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(r.文本), r.文本);
还原随机();

console.log('\n[16] 扣款不会扣成负数');
定随机(0.5);
r = await 跑('闯金库', {
  现金: 10, 存款: 0, 金库: 0,
  配置: { ...d, 成功率: 0, 低等惩罚: 99999 },
});
check('罚款 99999 但只扣到 0', r.现金 === 0, String(r.现金));
check('金库收到 10', r.金库 === 10, String(r.金库));
还原随机();

console.log('\n[17] 免死金牌');
定随机(0.5);
r = await 跑('闯金库', { 现金: 1000, 金库: 0, 免死: true, 配置: { ...d, 成功率: 0 } });
check('免死金牌生效 → 不禁言', r.env.调用.禁言.length === 0, String(r.env.调用.禁言.length));
check('确实查过免死金牌', r.env.调用.免死查询 === 1, String(r.env.调用.免死查询));
check('回执说明免死生效', r.文本.includes('免死金牌生效'), r.文本);
check('钱照扣', r.现金 < 1000, String(r.现金));

console.log('\n[18] 机器人权限不足 → 不禁言且「不消耗」免死金牌');
r = await 跑('闯金库', { 现金: 1000, 金库: 0, 免死: true, 机器人身份: 'member', 配置: { ...d, 成功率: 0 } });
check('无群管 → 不禁言', r.env.调用.禁言.length === 0);
check('无群管 → 不查免死金牌', r.env.调用.免死查询 === 0, String(r.env.调用.免死查询));
check('回执说明没被禁言', r.文本.includes('没被禁言'), r.文本);
r = await 跑('闯金库', { 现金: 1000, 金库: 0, 目标身份: 'admin', 机器人身份: 'admin', 配置: { ...d, 成功率: 0 } });
check('管理员之间不能互禁', r.env.调用.禁言.length === 0);
还原随机();

console.log('\n[19] 流水记录（统一文件夹，成败都记）');
定随机(0.5);
r = await 跑('闯金库', { 现金: 1000, 存款: 200, 金库: 8000, 群号: 10001, 配置: { ...d, 成功率: 0 } });
const 流水文件 = M.vaultRaidLogPath(10001);
const 流水 = JSON.parse(M.readA(流水文件) || '[]');
check('流水文件写在 闯金库/流水/{群号}.json', 流水文件.endsWith('闯金库/流水/10001.json'), 流水文件);
check('写入 1 条', 流水.length === 1, String(流水.length));
const 记 = 流水[0] || {};
check('记了群号', String(记.群号) === '10001', String(记.群号));
check('记了 QQ', String(记.QQ) === '555', String(记.QQ));
check('记了指令', 记.指令 === '闯金库', String(记.指令));
check('记了结果', 记.结果 === '失败', String(记.结果));
check('记了档位', !!记.档位, String(记.档位));
check('记了增减（失败为负）', 记.增减 < 0, String(记.增减));
check('记了原本/现在', 记.原本 === 1000 && 记.现在 === r.现金, `${记.原本}/${记.现在}`);
check('记了银行存款', 记.银行存款 === 200, String(记.银行存款));
check('记了金库原本/现在', 记.金库原本 === 8000 && 记.金库现在 === r.金库, `${记.金库原本}/${记.金库现在}`);
check('记了冷却到期', Number(记.冷却到期) > Date.now() / 1000);
check('记了时间字符串', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(记.时间)), String(记.时间));

r = await 跑('闯金库', { 现金: 1000, 金库: 8000, 群号: 10001, 配置: { ...d, 成功率: 100 } });
const 流水2 = JSON.parse(M.readA(流水文件) || '[]');
check('成功也记流水 → 累计 1 条（新环境重置）', 流水2.length === 1);
check('成功流水增减为正', 流水2[0].增减 > 0, String(流水2[0].增减));
还原随机();

console.log('\n[20] 实时抬价（前两档随经济体量放大）');
{
  M.__reset(); M.清抬价缓存();
  // 两人各 1 万 → 人均净资产 10000；基准 5000 → √2 ≈ 1.41
  M.writeA(货币文件, JSON.stringify({ 555: 10000, 666: 10000 }));
  M.writeA(银行文件, JSON.stringify({}));
  const k = M.抬价系数(undefined, true);
  check('人均 10000 / 基准 5000 → 系数 1.41', Math.abs(k - 1.41) < 0.01, String(k));
  const 有效 = M.有效配置();
  check('未自定义 → 低等奖励 100×1.41 = 141', 有效.配置.低等奖励 === 141, String(有效.配置.低等奖励));
  check('未自定义 → 中等奖励最大 300×1.41 = 423', 有效.配置.中等奖励最大 === 423, String(有效.配置.中等奖励最大));
  check('未自定义 → 低等惩罚 50×1.41 = 71', 有效.配置.低等惩罚 === 71, String(有效.配置.低等惩罚));
  check('高等/隐藏百分比不参与抬价', 有效.配置.高等奖励最小百分比 === 5);
  check('禁言分钟不参与抬价', 有效.配置.禁言最小分钟 === 5);
  check('命中字段被记录', 有效.抬价字段.includes('低等奖励'));

  // 自定义锁定
  M.__reset(); M.清抬价缓存();
  M.writeA(货币文件, JSON.stringify({ 555: 20000, 666: 20000 }));
  M.saveVaultRaidConfig({ 低等奖励: 999, 中等奖励最小: 100 });
  const 有效2 = M.有效配置();
  check('自定义 999 不被抬价', 有效2.配置.低等奖励 === 999, String(有效2.配置.低等奖励));
  check('自定义 100 不被抬价', 有效2.配置.中等奖励最小 === 100, String(有效2.配置.中等奖励最小));
  check('未自定义的仍抬价（中等最大 300×2=600）', 有效2.配置.中等奖励最大 === 600, String(有效2.配置.中等奖励最大));

  // 「等于默认值」= 保持自动
  M.__reset(); M.清抬价缓存();
  M.saveVaultRaidConfig({ 低等奖励: 100, 中等奖励最小: 50, 中等奖励最大: 300 });
  const 原始 = M.读原始配置();
  check('填了等于默认的值 → 不落盘（保持自动）', !('低等奖励' in 原始), JSON.stringify(原始));

  // 关闭抬价
  M.__reset(); M.清抬价缓存();
  M.writeA(货币文件, JSON.stringify({ 555: 100000 }));
  M.saveVaultRaidConfig({ 自动抬价: false });
  check('自动抬价关闭 → 系数恒为 1', M.抬价系数(undefined, true) === 1);
  check('自动抬价关闭 → 低等奖励保持 100', M.有效配置().配置.低等奖励 === 100);

  // 系数下限：穷服不缩水
  M.__reset(); M.清抬价缓存();
  M.writeA(货币文件, JSON.stringify({ 555: 1 }));
  check('人均极低 → 系数不低于 1', M.抬价系数(undefined, true) === 1, String(M.抬价系数(undefined, true)));
}

console.log('\n[21] 惩罚隐藏级：清空现有货币，不动存款');
定随机(0.99); // 惩罚隐藏档
check('隐藏惩罚 = 现金全额', M.calc罚款('隐藏', 1234) === 1234, String(M.calc罚款('隐藏', 1234)));
check('现金 0 时隐藏惩罚 = 0', M.calc罚款('隐藏', 0) === 0);
r = await 跑('闯金库', { 现金: 1000, 存款: 5000, 金库: 8000, 配置: { ...d, 成功率: 0 } });
check('现金被清空 → 0', r.现金 === 0, String(r.现金));
check('存款 5000 分毫不动', r.存款 === 5000, String(r.存款));
check('全额充公 → 金库 9000', r.金库 === 9000, String(r.金库));
check('回执说明被清空', r.文本.includes('被清空'), r.文本);
check('隐藏惩罚回执也无小表情', !有表情(r.文本), r.文本);
还原随机();

console.log('\n[22] 模拟 200 轮：高档位是否够稀有');
还原随机();
{
  const 统奖 = {}, 统惩 = {};
  for (let i = 0; i < 200; i++) {
    const a = M.抽奖励档位();
    统奖[a] = (统奖[a] || 0) + 1;
    const b = M.抽惩罚档位();
    统惩[b] = (统惩[b] || 0) + 1;
  }
  const 高隐奖 = (统奖.高等 || 0) + (统奖.隐藏 || 0);
  const 高隐惩 = (统惩.高等 || 0) + (统惩.隐藏 || 0);
  console.log(`     奖励 200 轮：低等 ${统奖.低等 || 0} · 中等 ${统奖.中等 || 0} · 高等 ${统奖.高等 || 0} · 隐藏 ${统奖.隐藏 || 0}`);
  console.log(`     惩罚 200 轮：低等 ${统惩.低等 || 0} · 中等 ${统惩.中等 || 0} · 高等 ${统惩.高等 || 0} · 隐藏 ${统惩.隐藏 || 0}`);
  console.log(`     奖励 高等+隐藏 = ${高隐奖}/200 = ${(高隐奖 / 2).toFixed(1)}%（理论 10%）`);
  console.log(`     惩罚 高等+隐藏 = ${高隐惩}/200 = ${(高隐惩 / 2).toFixed(1)}%（理论 14%）`);
  check('奖励高+隐藏 落在 2%~22%', 高隐奖 / 200 >= 0.02 && 高隐奖 / 200 <= 0.22, `${高隐奖}/200`);
  check('惩罚高+隐藏 落在 3%~26%', 高隐惩 / 200 >= 0.03 && 高隐惩 / 200 <= 0.26, `${高隐惩}/200`);

  // 大样本校核理论值
  let 高 = 0, 隐 = 0;
  for (let i = 0; i < 20000; i++) {
    const a = M.抽奖励档位();
    if (a === '高等') 高++;
    if (a === '隐藏') 隐++;
  }
  console.log(`     2 万轮校核：高等 ${(高 / 200).toFixed(2)}%（理论 8%）· 隐藏 ${(隐 / 200).toFixed(2)}%（理论 2%）`);
  check('大样本高等 ≈ 8%（±1）', Math.abs(高 / 200 - 8) < 1, (高 / 200).toFixed(2));
  check('大样本隐藏 ≈ 2%（±0.6）', Math.abs(隐 / 200 - 2) < 0.6, (隐 / 200).toFixed(2));
}

console.log('\n[23] 统计累加');
定随机(0.5);
建环境({ 现金: 1000, 金库: 8000, 配置: { ...d, 成功率: 0 } });
M.累加统计(555, false, -50);
M.累加统计(555, true, 300);
const 统 = M.读统计(555);
check('失败 1 次', 统.失败 === 1, String(统.失败));
check('成功 1 次', 统.成功 === 1, String(统.成功));
check('净收益 250', 统.净收益 === 250, String(统.净收益));
还原随机();

// ---------------------------------------------------------------------------
// 样例回执（人肉核对排版用）
// ---------------------------------------------------------------------------
console.log('\n[24] 回执样例');
定随机(0.1);
const 样例败 = await 跑('闯金库', { 现金: 8192, 存款: 2250, 金库: 50000, 配置: { ...d, 成功率: 0 } });
const 样例胜 = await 跑('闯金库', { 现金: 8192, 存款: 2250, 金库: 50000, 配置: { ...d, 成功率: 100 } });
const 冷却样 = await 跑('闯金库', { 现金: 8192, 冷却到期: Math.floor(Date.now() / 1000) + 900 });
还原随机();
console.log('--- 失败 ---\n' + 样例败.文本);
console.log('--- 成功 ---\n' + 样例胜.文本);
console.log('--- 冷却中 ---\n' + 冷却样.文本);

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n===== 通过 ${pass} / 失败 ${fail} =====`);
process.exit(fail ? 1 : 0);
