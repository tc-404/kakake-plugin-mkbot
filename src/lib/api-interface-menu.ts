// ---------------------------------------------------------------------------
// 接口功能菜单：文本与 Sharp 图片渲染共用数据源
// ---------------------------------------------------------------------------

export interface ApiInterfaceMenuItem {
  name: string;
  note?: string;
  /** menu-icons 图标键，Sharp 图片菜单用 */
  icon?: string;
  /** 角标短标签，Sharp 图片菜单用 */
  tag?: string;
}

export interface ApiInterfaceMenuSection {
  title: string;
  items: ApiInterfaceMenuItem[];
}

export const API_INTERFACE_MENU_SECTIONS: ApiInterfaceMenuSection[] = [
  {
    title: 'API接口功能',
    items: [
      { name: '图片菜单', icon: 'video' },
      { name: '三角洲密码', icon: 'key' },
      { name: 'EPIC免费游戏', icon: 'dice' },
      { name: '搜饰品[关键词]', icon: 'qa' },
      { name: '发病文学[对象名]', icon: 'chat' },
      { name: '查MC服务器[IP/域名]', icon: 'settings' },
    ],
  },
  {
    title: '表情包系统',
    items: [
      { name: '爬', note: '静态图，随机模板', icon: 'heart', tag: '静态' },
      { name: '顶', note: 'GIF', icon: 'heart', tag: 'GIF' },
      { name: '啃', note: 'GIF', icon: 'heart', tag: 'GIF' },
      { name: '摸头', note: 'GIF', icon: 'heart', tag: 'GIF' },
      { name: '吃', note: 'GIF', icon: 'heart', tag: 'GIF' },
      { name: '吸', note: 'GIF', icon: 'heart', tag: 'GIF' },
      { name: '啾', note: 'GIF', icon: 'heart', tag: 'GIF' },
      { name: '挠头', note: 'GIF', icon: 'heart', tag: 'GIF' },
      { name: '贴贴', note: 'GIF，需 @ 对方', icon: 'heart', tag: '@' },
      { name: '戒导', note: '证书 PNG，可带日期', icon: 'card', tag: 'PNG' },
      { name: '二次元入口', note: 'PNG', icon: 'links', tag: 'PNG' },
      { name: '上瘾', note: 'PNG', icon: 'heart', tag: 'PNG' },
      { name: '别碰', note: 'PNG', icon: 'shield', tag: 'PNG' },
      { name: '捣', note: 'GIF', icon: 'heart', tag: 'GIF' },
      { name: '灰飞烟灭', note: 'GIF', icon: 'fire', tag: 'GIF' },
      { name: '卖掉了', note: 'PNG', icon: 'fire', tag: 'PNG' },
      { name: '嘲讽', note: 'PNG', icon: 'chat', tag: 'PNG' },
      { name: '想什么', note: 'PNG', icon: 'qa', tag: 'PNG' },
      { name: '我想上的', note: 'PNG', icon: 'heart', tag: 'PNG' },
      { name: '你不懂啦', note: 'PNG', icon: 'chat', tag: 'PNG' },
    ],
  },
];

export const API_INTERFACE_MENU_FOOTER =
  '事件管理开启「表情制作」；可 @ 指定头像；贴贴必须 @';

export function buildApiInterfaceMenuText(): string {
  const lines: string[] = ['══════════════'];
  for (const section of API_INTERFACE_MENU_SECTIONS) {
    lines.push(`【${section.title}】`);
    for (const item of section.items) {
      const suffix = item.note ? `（${item.note}）` : '';
      lines.push(` - ${item.name}${suffix}`);
    }
    lines.push('══════════════');
  }
  lines.push(`（${API_INTERFACE_MENU_FOOTER}）`);
  return lines.join('\n');
}
