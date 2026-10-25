/**
 * WebUI 冒烟自检：抓「点按钮报 xxx is not defined」这类作用域 / 拼写问题。
 *
 * 背景：admin.html 是一个巨大的单文件（脚本全挂在全局作用域），
 * 函数一旦写进了别的函数体里成了局部 const，内联 onclick 或者其他顶层函数就访问不到，
 * 而且不打开后台页面根本发现不了。所以这里用最小 DOM 桩把主脚本真的求一次值，
 * 把关键函数取出来跑一遍。
 *
 * 检查三件事：
 *   [1] 每个 <script> 块语法能解析
 *   [2] HTML 里 on* 内联处理器引用的函数都有定义
 *   [3] 修改道具 / 闯金库 相关的函数能在作用域里解析，且真的调用一次不抛
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const 根 = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const 源文件 = resolve(根, 'webui/admin.html');
const s = readFileSync(源文件, 'utf8');

let 通过 = 0;
let 失败 = 0;
const 断言 = (名, 条件, 备注) => {
  if (条件) { 通过++; console.log(`  ✓ ${名}`); }
  else { 失败++; console.log(`  ✗ ${名}${备注 ? ' —— ' + 备注 : ''}`); }
};

// ---------------- [1] 语法 ----------------
console.log('\n[1] 脚本语法');
const 块 = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
断言('至少有一个内联 script', 块.length > 0, `实际 ${块.length}`);
块.forEach((code, i) => {
  let ok = true, err = '';
  try { new Function(code); } catch (e) { ok = false; err = e.message; }
  断言(`script#${i + 1} 可解析（${code.length} 字符）`, ok, err);
});

// ---------------- [2] 内联处理器 ----------------
console.log('\n[2] 内联事件处理器引用的函数');
const 引用的 = new Set();
for (const m of s.matchAll(/on(?:click|input|change|keydown|submit)="([a-zA-Z_$][\w$]*)\s*\(/g)) {
  引用的.add(m[1]);
}
// if / return 之类是 onkeydown="if(...)" 里的关键字，不是函数
const 关键字 = new Set(['if', 'return', 'throw', 'typeof']);
const 待查 = [...引用的].filter((n) => !关键字.has(n)).sort();
const 缺失 = 待查.filter((n) => !new RegExp(String.raw`(function\s+${n}\s*\(|(?:const|let|var)\s+${n}\s*=)`).test(s));
断言(`${待查.length} 个处理器函数都有定义`, 缺失.length === 0, 缺失.join(', '));

// ---------------- [3] 运行时作用域 ----------------
console.log('\n[3] 运行时作用域（最小 DOM 桩）');
const 主脚本 = 块.slice().sort((a, b) => b.length - a.length)[0];

const 元素 = () => ({
  value: '', textContent: '', innerHTML: '', style: {}, dataset: {}, scrollHeight: 0,
  classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
  setAttribute() {}, getAttribute: () => null, addEventListener() {}, removeEventListener() {},
  querySelector: () => null, querySelectorAll: () => [], appendChild() {}, remove() {},
  focus() {}, closest: () => null, insertAdjacentHTML() {},
  // showToast 会往容器里塞节点
  prepend() {}, append() {}, insertBefore() {}, firstChild: null,
});
const 文档 = {
  getElementById: () => 元素(), querySelector: () => null, querySelectorAll: () => [],
  createElement: () => 元素(), addEventListener() {}, body: 元素(),
  documentElement: 元素(), head: 元素(),
};
const 窗口 = {
  addEventListener() {}, location: { href: 'http://x/', pathname: '/', origin: 'http://x' },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  requestAnimationFrame: (f) => f(), setTimeout, clearTimeout,
};

const 要导出 = [
  'setVal', 'renderShopPriceForm', 'fillVaultFields', 'resetVaultConfigDefaults',
  'resetShopPriceConfigDefaults', 'loadVaultFund', 'saveVaultFund', 'setShopPriceMsg',
  'toggleShopSection', 'initShopSections', 'setShopPriceTab', 'loadShopPricePage',
  'saveShopPriceConfig', 'collectShopPricePayload',
];

let api;
try {
  // 脚本里有些全局是裸着用的（requestAnimationFrame、setTimeout…），要单独当参数传进去
  api = new Function(
    'window', 'document', 'localStorage', 'location', 'fetch', 'navigator', 'alert', 'console',
    'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia',
    主脚本 + `\nreturn { ${要导出.join(', ')} };`
  )(
    窗口, 文档, 窗口.localStorage, 窗口.location, () => {}, {}, () => {}, console,
    (f) => f(), () => {}, 窗口.matchMedia
  );
  断言('主脚本可求值', true);
} catch (e) {
  断言('主脚本可求值', false, e.message);
}

if (api) {
  for (const 名 of 要导出) 断言(`${名} 可解析`, typeof api[名] === 'function', typeof api[名]);

  // loadVaultFund 的 setVal 在 try 里，桩环境下 apiCall 会先失败走 catch，
  // 所以 fillVaultFields / renderShopPriceForm 才是真正能命中 setVal 的用例
  const 用例 = [
    ['fillVaultFields({}, 0)', () => api.fillVaultFields({}, 0)],
    ['renderShopPriceForm({})', () => api.renderShopPriceForm({})],
    ['collectShopPricePayload()', () => api.collectShopPricePayload()],
    ['loadVaultFund()', () => api.loadVaultFund()],
    ['saveVaultFund()', () => api.saveVaultFund()],
  ];
  console.log('');
  for (const [名, fn] of 用例) {
    let ok = true, err = '';
    try { await fn(); } catch (e) { ok = false; err = e.message; }
    断言(`${名} 执行不抛`, ok, err);
  }
}

console.log(`\n===== 通过 ${通过} / 失败 ${失败} =====`);
process.exit(失败 ? 1 : 0);
