// ---------------------------------------------------------------------------
// 导航菜单图标：内联 SVG path，HTML / Sharp 共用，不依赖 CDN 字体
// ---------------------------------------------------------------------------

export type MenuIconPaths = string | string[];

/** symbol id = mk-icon-{key} */
export const MENU_ICON_SVGS: Record<string, MenuIconPaths> = {
  key: 'M17 8h1a4 4 0 110 8h-1M15 8V6a4 4 0 00-8 0v2M9 8v10',
  shield: 'M12 3l8 4v6c0 5-8 8-8 8s-8-3-8-8V7l8-4z',
  'user-add': ['M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2', 'M9 11a4 4 0 100-8 4 4 0 000 8z', 'M19 8v6', 'M22 11h-6'],
  settings: 'M12 15.5A3.5 3.5 0 1012 8.5a3.5 3.5 0 000 7zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
  music: 'M9 18V5l12-2v13M9 13a3 3 0 100 6 3 3 0 000-6zM21 11a3 3 0 100 6 3 3 0 000-6z',
  video: 'M15 10l4-2v8l-4-2V10zM5 6h10a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z',
  account: ['M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2', 'M12 11a4 4 0 100-8 4 4 0 000 8z'],
  'file-settings': 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M12 18v-6M9 15h6',
  links: 'M10 13a5 5 0 007.54.54l2-2a5 5 0 00-7.07-7.07l-1.17 1.17M14 11a5 5 0 00-7.54-.54l-2 2a5 5 0 007.07 7.07l1.17-1.17',
  fire: 'M12 3c2 4 6 5 6 10a6 6 0 11-12 0c0-3 2-5 4-7 1 2 2 3 2 4z',
  qa: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z',
  card: 'M3 10h18M7 15h2M3 6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6z',
  calendar: ['M8 2v4M16 2v4', 'M3 10h18', 'M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z', 'M9 16l2 2 4-4'],
  anchor: 'M12 22V8M5 12H2a10 10 0 0020 0h-3M12 6a3 3 0 100-6 3 3 0 000 6z',
  'id-card': 'M4 6h16v12H4V6zM8 10h8M8 14h5M12 6v12',
  bank: 'M3 10h18M5 10V20M9 10V20M15 10V20M19 10V20M12 3l9 5H3l9-5z',
  dice: 'M5 5h14v14H5V5zM9 9h.01M15 9h.01M9 15h.01M15 15h.01',
  'mail-send': 'M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z',
  chat: 'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z',
  heart: 'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0V4zM5 4H3v2a3 3 0 003 3M19 4h2v2a3 3 0 01-3 3',
  mute: ['M11 5L6 9H2v6h4l5 4V5z', 'M23 9l-6 6', 'M17 9l6 6'],
  briefcase: ['M4 7h16v13H4V7z', 'M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2', 'M4 12h16'],
};

export interface MenuItemDef {
  title: string;
  desc: string;
  icon: string;
}

export const MENU_BASIC_ITEMS: MenuItemDef[] = [
  { title: '授权系统', desc: '插件内置的授权系统', icon: 'key' },
  { title: '群管系统', desc: '仅限于群内使用', icon: 'shield' },
  { title: '邀人统计', desc: '开启后可记录邀请次数，并且可一系列控制', icon: 'user-add' },
  { title: '事件管理', desc: '各种开关的管理及介绍', icon: 'settings' },
  { title: '音乐系统', desc: '听歌的，共4种音源，可语音、链接、卡片返回', icon: 'music' },
  { title: '视频菜单', desc: '接入了大量的视频接口，注：接口来源于网络', icon: 'video' },
  { title: '账号设置', desc: '配置登录的机器人账号信息的，如头像昵称签名等', icon: 'account' },
  { title: '插件配置', desc: '该功能仅配置MK的config.json文件', icon: 'file-settings' },
  { title: '接口功能', desc: '这个是本插件接入的第三方接口，都会在里面', icon: 'links' },
  { title: '管理续火', desc: '每日续火，需先开启相关事件，支持好友/群聊，支持图片或文案', icon: 'fire' },
  { title: '问答系统', desc: '有模糊问答 和 精准问答，支持图片回复', icon: 'qa' },
  { title: '发卡系统', desc: '全局发卡系统，可用于其他分发娱乐，使用归笺兑换，支持定价、改名等操作', icon: 'card' },
];

export const MENU_ENT_ITEMS: MenuItemDef[] = [
  { title: '签到', desc: '每日签到获取奖励', icon: 'calendar' },
  { title: '钓鱼', desc: '通过「每日签到」可获取诱饵钓鱼哦～', icon: 'anchor' },
  { title: '我的信息', desc: '查看游戏中你的信息', icon: 'id-card' },
  { title: '银行系统', desc: '存钱的，有利润，非常建议把货币存进去', icon: 'bank' },
  { title: '幸运轮盘', desc: '要来一把豪赌的轮盘吗！', icon: 'dice' },
  { title: '漂流瓶', desc: '字面意思，不过没有隐私保护，直接公开瓶子主人', icon: 'mail-send' },
  { title: '伪造聊天', desc: '目前版本仅支持纯文本伪造', icon: 'chat' },
  { title: '群老婆', desc: '支持单群或全群', icon: 'heart' },
  { title: '排行榜', desc: '各种类型的排行名单', icon: 'trophy' },
  { title: '禁言卡', desc: '使用禁言卡@别人', icon: 'mute' },
  { title: '打工', desc: '13个岗位各有独立工资公式；查看打工状态 / 结算工资', icon: 'briefcase' },
];

function iconPathElements(paths: MenuIconPaths): string {
  const list = Array.isArray(paths) ? paths : [paths];
  return list
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
}

/** Puppeteer 渲染前注入的隐藏 sprite，供 <use href="#mk-icon-*"> 引用 */
export function buildMenuIconSpriteSvg(): string {
  const symbols = Object.entries(MENU_ICON_SVGS)
    .map(
      ([key, paths]) =>
        `<symbol id="mk-icon-${key}" viewBox="0 0 24 24">${iconPathElements(paths)}</symbol>`,
    )
    .join('\n    ');
  return `<svg id="mk-menu-icon-sprite" xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">
    ${symbols}
  </svg>`;
}

/** Sharp SVG 图层内绘制描边图标 */
export function renderMenuIconForSharp(
  iconKey: string,
  x: number,
  y: number,
  boxSize: number,
  color: string,
): string {
  const paths = MENU_ICON_SVGS[iconKey];
  if (!paths) return '';
  const inner = 18;
  const scale = inner / 24;
  const tx = x + (boxSize - inner) / 2;
  const ty = y + (boxSize - inner) / 2;
  const list = Array.isArray(paths) ? paths : [paths];
  const pathEls = list
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
    .join('');
  return `<g transform="translate(${tx},${ty}) scale(${scale})">${pathEls}</g>`;
}
