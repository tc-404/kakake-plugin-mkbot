// @ts-nocheck
// ---------------------------------------------------------------------------
// 发卡系统（从 mkbot-core 拆出）
// 由 mkbot-core 注入 readA/writeA/readB/writeB 等；Vite 与主入口打包为单文件 index.mjs。
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type {
    AuthRcStatus,
    CardShopDeps,
    CardShopHandleResult,
    MkMessageEvent,
    MkPluginContext,
} from '../types';
import { 发合并消息, 发消息, 段_引用, 段_文本, 合并节点, 嵌套合并节点, 合并预览 } from '../BOT';
import { requireAuthorized } from '../lib/unauth-reply';
import { trySendCardShopExchangeEmail } from './card-shop-mail';

const CARD_SHOP_ROOT = `筱筱吖/扩展功能/发卡系统/`;

function matchesCardShopMessage(message: string): boolean {
    return (
        message === "发卡系统" ||
        message === "发卡商店" ||
        message.trim() === "发卡商店" ||
        message === "查看商品列表" ||
        message.trim() === "查看商品列表" ||
        /^添加发卡商品/.test(message) ||
        /^修改发卡商品/.test(message) ||
        message.startsWith("填充发卡商品") ||
        /^清空发卡商品/.test(message) ||
        message.startsWith("删除发卡商品") ||
        /^发卡商品定价\s+/.test(message) ||
        /^发卡商品上架/.test(message) ||
        /^发卡商品下架/.test(message) ||
        /^兑换商品\s+/.test(message)
    );
}

export async function handleCardShopCommands(
    message: string,
    event: MkMessageEvent,
    ctx: MkPluginContext,
    RC_sq: AuthRcStatus,
    d: CardShopDeps
): Promise<CardShopHandleResult> {
    if (!matchesCardShopMessage(message)) {
        return false;
    }

    const { readA, writeA, readB, writeB, getDataPath, checkOwner3, rand } = d;

    function load发卡商品代号表() {
        const content = readA(`${CARD_SHOP_ROOT}商品代号.json`);
        if (!content) return {};
        try {
            return JSON.parse(content);
        } catch {
            return {};
        }
    }

    function load发卡商品价格表() {
        const content = readA(`${CARD_SHOP_ROOT}商品价格.json`);
        if (!content) return {};
        try {
            return JSON.parse(content);
        } catch {
            return {};
        }
    }

    function load发卡商品上下架表() {
        const content = readA(`${CARD_SHOP_ROOT}商品上下架.json`);
        if (!content) return {};
        try {
            return JSON.parse(content);
        } catch {
            return {};
        }
    }

    function save发卡商品上下架表(表) {
        writeA(`${CARD_SHOP_ROOT}商品上下架.json`, JSON.stringify(表, null, 2));
    }

    /** 未记录或 true 视为上架；false 为下架 */
    function 发卡商品是否上架(上下架表, 商品名) {
        if (!Object.prototype.hasOwnProperty.call(上下架表, 商品名)) return true;
        return 上下架表[商品名] !== false;
    }

    function 发卡库存文件路径(商品代号) {
        return path.join(getDataPath(), CARD_SHOP_ROOT, "data", `${商品代号}.txt`);
    }

    function 读取发卡库存非空行(商品代号) {
        const fp = 发卡库存文件路径(商品代号);
        if (!fs.existsSync(fp)) return [];
        return fs.readFileSync(fp, "utf-8").split(/\r?\n/).filter((line) => line.trim() !== "");
    }

    function 读取发卡库存条数(商品代号) {
        return 读取发卡库存非空行(商品代号).length;
    }

    function 发卡取出前列(商品代号, 数量) {
        const fp = 发卡库存文件路径(商品代号);
        const 行 = 读取发卡库存非空行(商品代号);
        if (行.length < 数量) {
            return { ok: false, lines: [], reason: `库存不足（当前 ${行.length} 条，需要 ${数量} 条）` };
        }
        const 取出 = 行.slice(0, 数量);
        const 剩余 = 行.slice(数量);
        const dir = path.dirname(fp);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fp, 剩余.join("\n") + (剩余.length ? "\n" : ""), "utf-8");
        return { ok: true, lines: 取出 };
    }

    function 获取发卡商品单价(价格表, 商品名) {
        if (!Object.prototype.hasOwnProperty.call(价格表, 商品名)) return null;
        const v = 价格表[商品名];
        const n = Number(v);
        if (Number.isNaN(n) || n < 0) return null;
        return n;
    }

    if (message === "发卡系统") {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const menuMessages = [
            合并节点("🎴 发卡系统", event.self_id, [段_文本(`🎴 发卡系统 · 菜单总览\n══════════════\n本菜单说明「商店浏览、归笺兑换、卡密收货」及管理员维护指令。\n📌 用户向机器人发文字即可，无需 @。\n📩 兑换成功后卡密仅通过私聊发送（群内需允许机器人私聊）。`)]),
            合并节点("👤 用户说明", event.self_id, [段_文本(`👤 用户指令\n══════════════\n🛒 发卡商店\n查看当前在售商品、价格（未定价显示 -）、库存条数（已下架的不显示）。\n\n💱 兑换商品\n用归笺购买，成功后卡密私聊送达。\n格式：兑换商品 商品名称 数量\n（已下架商品无法购买，效果同不存在）\n\n📝 使用示例：\n发卡商店\n兑换商品 月卡 1\n兑换商品 测试商品1 2`)]),
            合并节点("🔐 管理员说明", event.self_id, [段_文本(`🔐 管理员指令（仅主人）\n══════════════\n➕ 添加发卡商品 名称\n✏️ 修改发卡商品 原名->新名\n📥 填充发卡商品（首行商品名，下列每行一条卡密）\n🗑️ 清空发卡商品 名称\n❌ 删除发卡商品（首行商品名，下列为要删的卡密行）\n💰 发卡商品定价 名称 价格数字\n📌 发卡商品上架 名称 / 发卡商品下架 名称（下架后商店不展示且不可兑换）\n📋 查看商品列表（仅私聊，合并转发含卡密明细与上下架状态）\n\n📝 使用示例：\n添加发卡商品 月卡\n修改发卡商品 月卡->大会员月卡\n发卡商品定价 月卡 500\n发卡商品下架 月卡\n发卡商品上架 月卡\n填充发卡商品 月卡\nAAAA-BBBB-1111\nCCCC-DDDD-2222\n清空发卡商品 测试商品\n删除发卡商品 月卡\n旧卡密一行\n查看商品列表`)]),
        ];
        await 发合并消息(event, menuMessages, 合并预览(
            "MKbot 发卡系统",
            "商店浏览、归笺兑换与管理员维护说明",
            "[聊天记录]",
            ["发卡系统: 菜单总览", "用户说明: 商店与兑换", "管理员说明: 商品与卡密维护"],
        ));
        return 'halt';
    }

    if (message.match(/^添加发卡商品([\s\S]*)/)) {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 是否主人 = await checkOwner3(event, ctx, false, false);
        if (是否主人 != false) {
            const 目标名称 = message.match(/^添加发卡商品([\s\S]*)/)[1].trim();
            const 商品代号 = readB(`${CARD_SHOP_ROOT}商品代号.json`, 目标名称, "");
            if (!目标名称) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请输入商品名称哦～')]);
                return 'halt';
            }
            if (商品代号) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`已经有过这个商品啦～\n专属代号${商品代号}`)]);
                return 'halt';
            }
            const 随机内容 = rand('A', 'Z') + rand('A', 'Z') + rand('A', 'Z') + rand(100000, 999999);
            writeB(`${CARD_SHOP_ROOT}商品代号.json`, 目标名称, 随机内容);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`好啦！已经成功添加这个商品啦，专属代号为${随机内容}`)]);
            return 'halt';
        }
        return false;
    }

    if (message.match(/^修改发卡商品([\s\S]*?)->([\s\S]*)$/)) {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 是否主人 = await checkOwner3(event, ctx, false, false);
        if (是否主人 != false) {
            const match = message.match(/^修改发卡商品([\s\S]*?)->([\s\S]*)$/);
            const 原名称 = match[1].trim();
            const 新名称 = match[2].trim();
            if (!原名称 || !新名称) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请按格式发送：修改发卡商品 原名称->新名称')]);
                return 'halt';
            }
            if (原名称 === 新名称) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('原名称和新名称相同，无需修改')]);
                return 'halt';
            }
            let 商品代号文件 = {};
            try {
                const content = readA(`${CARD_SHOP_ROOT}商品代号.json`);
                if (content) 商品代号文件 = JSON.parse(content);
            } catch (e) { /* ignore */ }
            if (!商品代号文件[原名称]) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${原名称}」不存在，无法修改`)]);
                return 'halt';
            }
            if (商品代号文件[新名称]) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${新名称}」已存在，请使用其他名称`)]);
                return 'halt';
            }
            const 原代号 = 商品代号文件[原名称];
            商品代号文件[新名称] = 原代号;
            delete 商品代号文件[原名称];
            writeA(`${CARD_SHOP_ROOT}商品代号.json`, JSON.stringify(商品代号文件, null, 2));
            const 上下架表 = load发卡商品上下架表();
            if (Object.prototype.hasOwnProperty.call(上下架表, 原名称)) {
                上下架表[新名称] = 上下架表[原名称];
                delete 上下架表[原名称];
                save发卡商品上下架表(上下架表);
            }
            const 价格表 = load发卡商品价格表();
            if (Object.prototype.hasOwnProperty.call(价格表, 原名称)) {
                价格表[新名称] = 价格表[原名称];
                delete 价格表[原名称];
                writeA(`${CARD_SHOP_ROOT}商品价格.json`, JSON.stringify(价格表, null, 2));
            }
            await 发消息(event, [段_引用(event.message_id), 段_文本(`已将商品「${原名称}」更名为「${新名称}」，专属代号仍为 ${原代号}`)]);
            return 'halt';
        }
        return false;
    }

    if (message.startsWith("填充发卡商品")) {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 是否主人 = await checkOwner3(event, ctx, false, false);
        if (是否主人 != false) {
            const lines = message.split('\n');
            if (lines.length < 2) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请按格式发送：\n填充发卡商品 商品名\n内容1\n内容2...')]);
                return 'halt';
            }
            const 商品名 = lines[0].replace(/^填充发卡商品/, '').trim();
            if (!商品名) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请指定商品名称')]);
                return 'halt';
            }
            const 新内容数组 = lines.slice(1).filter(line => line.trim() !== "");
            if (新内容数组.length === 0) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('没有有效内容')]);
                return 'halt';
            }
            const 商品代号 = readB(`${CARD_SHOP_ROOT}商品代号.json`, 商品名, "");
            if (!商品代号) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」不存在，请先添加`)]);
                return 'halt';
            }
            const dataDir = path.join(getDataPath(), CARD_SHOP_ROOT, 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            const filePath = path.join(dataDir, 商品代号 + '.txt');
            let 现有行 = [];
            if (fs.existsSync(filePath)) {
                const 现有内容 = fs.readFileSync(filePath, 'utf-8');
                现有行 = 现有内容.split(/\r?\n/).filter(line => line.trim() !== "");
            }
            const 待添加 = [];
            const 与库重复 = [];
            const 批次内重复 = [];
            const 批次已见 = new Set();
            for (const item of 新内容数组) {
                if (现有行.includes(item)) {
                    与库重复.push(item);
                    continue;
                }
                if (批次已见.has(item)) {
                    批次内重复.push(item);
                    continue;
                }
                批次已见.add(item);
                待添加.push(item);
            }
            if (待添加.length === 0) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('没有可添加的新数据（已全部在库中或本批重复）')]);
                return 'halt';
            }
            const 追加内容 = 待添加.join('\n');
            const 最终内容 = 现有行.length > 0 ? 现有行.join('\n') + '\n' + 追加内容 : 追加内容;
            fs.writeFileSync(filePath, 最终内容, 'utf-8');
            let 回复 = `已向商品「${商品名}」添加 ${待添加.length} 条数据`;
            if (与库重复.length > 0) {
                回复 += `，跳过与库存重复 ${与库重复.length} 条：${与库重复.join('、')}`;
            }
            if (批次内重复.length > 0) {
                回复 += `；跳过本批重复 ${批次内重复.length} 条：${批次内重复.join('、')}`;
            }
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${回复}`)]);
            return 'halt';
        }
        return false;
    }

    if (message.match(/^清空发卡商品([\s\S]*)/)) {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 是否主人 = await checkOwner3(event, ctx, false, false);
        if (是否主人 != false) {
            const 商品名 = message.match(/^清空发卡商品([\s\S]*)/)[1].trim();
            if (!商品名) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请指定商品名称')]);
                return 'halt';
            }
            const 商品代号 = readB(`${CARD_SHOP_ROOT}商品代号.json`, 商品名, "");
            if (!商品代号) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」不存在`)]);
                return 'halt';
            }
            const filePath = path.join(getDataPath(), CARD_SHOP_ROOT, 'data', 商品代号 + '.txt');
            if (fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, '', 'utf-8');
                await 发消息(event, [段_引用(event.message_id), 段_文本(`已清空商品「${商品名}」的所有数据`)]);
            } else {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」还没有数据，无需清空`)]);
            }
            return 'halt';
        }
        return false;
    }

    if (message.startsWith("删除发卡商品")) {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 是否主人 = await checkOwner3(event, ctx, false, false);
        if (是否主人 != false) {
            const lines = message.split('\n');
            if (lines.length < 2) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请按格式发送：\n删除发卡商品 商品名\n内容1\n内容2...')]);
                return 'halt';
            }
            const 商品名 = lines[0].replace(/^删除发卡商品/, '').trim();
            if (!商品名) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请指定商品名称')]);
                return 'halt';
            }
            const 待删除列表 = lines.slice(1).filter(line => line.trim() !== "");
            if (待删除列表.length === 0) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请在下方输入要删除的内容，每行一条')]);
                return 'halt';
            }
            const 商品代号 = readB(`${CARD_SHOP_ROOT}商品代号.json`, 商品名, "");
            if (!商品代号) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」不存在，请先添加`)]);
                return 'halt';
            }
            const dataDir = path.join(getDataPath(), CARD_SHOP_ROOT, 'data');
            const filePath = path.join(dataDir, 商品代号 + '.txt');
            if (!fs.existsSync(filePath)) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」还没有数据`)]);
                return 'halt';
            }
            let 行数组 = fs.readFileSync(filePath, 'utf-8').split(/\r?\n/).filter(line => line !== "");
            const 删除成功 = [];
            const 未找到 = [];
            for (const 要删的 of 待删除列表) {
                const index = 行数组.indexOf(要删的);
                if (index !== -1) {
                    行数组.splice(index, 1);
                    删除成功.push(要删的);
                } else {
                    未找到.push(要删的);
                }
            }
            fs.writeFileSync(filePath, 行数组.join('\n'), 'utf-8');
            let 回复 = `已从商品「${商品名}」中删除 ${删除成功.length} 条数据`;
            if (删除成功.length) 回复 += `\n成功删除：${删除成功.join('、')}`;
            if (未找到.length) 回复 += `\n未找到：${未找到.join('、')}`;
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${回复}`)]);
            return 'halt';
        }
        return false;
    }

    if (message.match(/^发卡商品定价\s+/)) {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 是否主人 = await checkOwner3(event, ctx, false, false);
        if (是否主人 != false) {
            const m = message.match(/^发卡商品定价\s+([\s\S]+?)\s+(\d+)$/);
            if (!m) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请按格式发送：\n发卡商品定价 商品名称 价格数字\n例：发卡商品定价 测试商品1 500')]);
                return 'halt';
            }
            const 商品名 = m[1].trim();
            const 价格 = parseInt(m[2], 10);
            if (!商品名) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请填写商品名称')]);
                return 'halt';
            }
            const 代号 = readB(`${CARD_SHOP_ROOT}商品代号.json`, 商品名, "");
            if (!代号) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」不存在，请先添加发卡商品`)]);
                return 'halt';
            }
            writeB(`${CARD_SHOP_ROOT}商品价格.json`, 商品名, 价格);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`已为「${商品名}」设定价格：${价格} 归笺`)]);
            return 'halt';
        }
        return false;
    }

    if (/^发卡商品上架/.test(message)) {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 是否主人 = await checkOwner3(event, ctx, false, false);
        if (是否主人 != false) {
            const 商品名 = message.replace(/^发卡商品上架\s*/, "").trim();
            if (!商品名) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请按格式发送：\n发卡商品上架 商品名称\n（名称前可有可无空格，例：发卡商品上架 月卡 或 发卡商品上架月卡）')]);
                return 'halt';
            }
            const 代号 = readB(`${CARD_SHOP_ROOT}商品代号.json`, 商品名, "");
            if (!代号) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」不存在`)]);
                return 'halt';
            }
            const 表 = load发卡商品上下架表();
            表[商品名] = true;
            save发卡商品上下架表(表);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`已将「${商品名}」设为上架（商店展示，可兑换）`)]);
            return 'halt';
        }
        return false;
    }

    if (/^发卡商品下架/.test(message)) {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 是否主人 = await checkOwner3(event, ctx, false, false);
        if (是否主人 != false) {
            const 商品名 = message.replace(/^发卡商品下架\s*/, "").trim();
            if (!商品名) {
                await 发消息(event, [段_引用(event.message_id), 段_文本('请按格式发送：\n发卡商品下架 商品名称\n（名称前可有可无空格）')]);
                return 'halt';
            }
            const 代号 = readB(`${CARD_SHOP_ROOT}商品代号.json`, 商品名, "");
            if (!代号) {
                await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」不存在`)]);
                return 'halt';
            }
            const 表 = load发卡商品上下架表();
            表[商品名] = false;
            save发卡商品上下架表(表);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`已将「${商品名}」设为下架（商店不展示，用户无法兑换）`)]);
            return 'halt';
        }
        return false;
    }

    if (message === "发卡商店" || message.trim() === "发卡商店") {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 代号表 = load发卡商品代号表();
        const 价格表 = load发卡商品价格表();
        const 上下架表 = load发卡商品上下架表();
        const 全部名 = Object.keys(代号表).sort();
        const 名称列表 = 全部名.filter((名) => 发卡商品是否上架(上下架表, 名));
        if (全部名.length === 0) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('🛒 发卡商店\n══════════════\n暂无商品，请先添加发卡商品')]);
            return 'halt';
        }
        if (名称列表.length === 0) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('🛒 发卡商店\n══════════════\n暂无在售商品（当前全部已下架，请主人执行 发卡商品上架）')]);
            return 'halt';
        }
        let 文本 = `🛒 发卡商店（仅展示上架商品）\n══════════════\n`;
        for (let i = 0; i < 名称列表.length; i++) {
            const 名 = 名称列表[i];
            const 代号 = 代号表[名];
            const 单价 = 获取发卡商品单价(价格表, 名);
            const 价显 = 单价 !== null ? `${单价} 归笺` : "-";
            const 库存 = 读取发卡库存条数(代号);
            文本 += `📦 ${名}\n💰 价格：${价显}\n📊 库存：${库存} 条\n`;
            if (i < 名称列表.length - 1) 文本 += `──────────────\n`;
        }
        文本 += `══════════════\n💡 购买：兑换商品 商品名 数量\n📖 完整说明：发卡系统`;
        await 发消息(event, [段_引用(event.message_id), 段_文本(`${文本}`)]);
        return 'halt';
    }

    if (message.match(/^兑换商品\s+/)) {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const m = message.match(/^兑换商品\s+([\s\S]+?)\s+(\d+)$/);
        if (!m) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('请按格式发送：\n兑换商品 商品名称 数量\n例：兑换商品 测试商品1 1')]);
            return 'halt';
        }
        const 商品名 = m[1].trim();
        const 数量 = parseInt(m[2], 10);
        if (!商品名 || 数量 < 1) {
            await 发消息(event, [段_引用(event.message_id), 段_文本('商品名不能为空，数量须为≥1的整数')]);
            return 'halt';
        }
        const 代号 = readB(`${CARD_SHOP_ROOT}商品代号.json`, 商品名, "");
        if (!代号) {
            await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」不存在`)]);
            return 'halt';
        }
        const 上下架表 = load发卡商品上下架表();
        if (!发卡商品是否上架(上下架表, 商品名)) {
            await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」不存在`)]);
            return 'halt';
        }
        const 价格表 = load发卡商品价格表();
        const 单价 = 获取发卡商品单价(价格表, 商品名);
        if (单价 === null) {
            await 发消息(event, [段_引用(event.message_id), 段_文本(`商品「${商品名}」尚未定价，无法兑换`)]);
            return 'halt';
        }
        const 总价 = 单价 * 数量;
        const 归笺路径 = "筱筱吖/娱乐系统/游戏数据/归笺.json";
        let 当前归笺 = Number(readB(归笺路径, event.user_id, 0));
        if (Number.isNaN(当前归笺)) 当前归笺 = 0;
        if (当前归笺 < 总价) {
            await 发消息(event, [段_引用(event.message_id), 段_文本(`归笺不足：需要 ${总价}，当前 ${当前归笺}`)]);
            return 'halt';
        }
        if (读取发卡库存条数(代号) < 数量) {
            await 发消息(event, [段_引用(event.message_id), 段_文本(`库存不足（当前 ${读取发卡库存条数(代号)} 条，需要 ${数量} 条）`)]);
            return 'halt';
        }
        writeB(归笺路径, event.user_id, 当前归笺 - 总价);
        const 取出结果 = 发卡取出前列(代号, 数量);
        if (!取出结果.ok) {
            writeB(归笺路径, event.user_id, 当前归笺);
            await 发消息(event, [段_引用(event.message_id), 段_文本(`${取出结果.reason}（已退回归笺）`)]);
            return 'halt';
        }
        const 兑换后货币 = 当前归笺 - 总价;
        const now = new Date();
        const px = (n) => String(n).padStart(2, "0");
        writeB(`${CARD_SHOP_ROOT}data/兑换日志.json`, `${now.getTime()}_${event.user_id}`, {
            时间戳毫秒: now.getTime(),
            时间年月日时分秒: `${now.getFullYear()}-${px(now.getMonth() + 1)}-${px(now.getDate())} ${px(now.getHours())}:${px(now.getMinutes())}:${px(now.getSeconds())}`,
            QQ: event.user_id,
            兑换前货币: 当前归笺,
            获得的卡密: [...取出结果.lines],
            兑换后货币: 兑换后货币,
        });
        const 货文本 = 取出结果.lines.map((line, idx) => `${idx + 1}. ${line}`).join("\n");
        const 私聊event = { message_type: "private", user_id: event.user_id };
        const 私发正文 = `✅ 兑换成功（发卡系统）\n══════════════\n🛍️ ${商品名} × ${数量}\n💰 已扣 ${总价} 归笺（单价 ${单价}）\n📬 卡密如下，请妥善保管：\n${货文本}\n══════════════\n💠 当前剩余归笺：${兑换后货币}`;
        await 发消息(私聊event, [段_文本(私发正文)], event.message_type === "group" ? { group_id: event.group_id } : {});
        await trySendCardShopExchangeEmail(d, {
            userId: event.user_id,
            productName: 商品名,
            quantity: 数量,
            unitPrice: 单价,
            totalPrice: 总价,
            cardLines: [...取出结果.lines],
            remaining: 兑换后货币,
        });
        if (event.message_type === "group") {
            await 发消息(event, [段_引用(event.message_id), 段_文本(`✅ 兑换成功！卡密已通过私聊发送，请打开与机器人的私信查看。\n已扣 ${总价} 归笺，剩余 ${兑换后货币}`)]);
        }
        return 'halt';
    }

    if (message === "查看商品列表" || message.trim() === "查看商品列表") {
        if (!(await requireAuthorized(RC_sq, event, readB))) {
            return 'halt';
        }
        const 是否主人 = await checkOwner3(event, ctx, false, false);
        if (是否主人 != false) {
            if (event.message_type !== "private") {
                await 发消息(event, [段_引用(event.message_id), 段_文本('📋 「查看商品列表」仅限私聊使用，请私聊机器人发送该指令')]);
                return 'halt';
            }
            const 代号表 = load发卡商品代号表();
            const 价格表 = load发卡商品价格表();
            const 上下架表 = load发卡商品上下架表();
            const 名称列表 = Object.keys(代号表).sort();
            let 总库存条数 = 0;
            let 已定价数 = 0;
            let 在售数 = 0;
            let 下架数 = 0;
            for (const 名 of 名称列表) {
                总库存条数 += 读取发卡库存条数(代号表[名]);
                if (获取发卡商品单价(价格表, 名) !== null) 已定价数++;
                if (发卡商品是否上架(上下架表, 名)) 在售数++;
                else 下架数++;
            }
            const 未定价数 = 名称列表.length - 已定价数;
            let 概览 = `📊 发卡商品总览\n`;
            概览 += `══════════════\n`;
            概览 += `🧾 商品种类：${名称列表.length}\n`;
            概览 += `📌 在售：${在售数}　已下架：${下架数}\n`;
            概览 += `📦 库存条数合计：${总库存条数}\n`;
            概览 += `💰 已定价：${已定价数}　⏳ 未定价：${未定价数}\n`;
            概览 += `══════════════\n`;
            概览 += `以下为各商品明细（嵌套卡片）`;
            const messages = [合并节点("📋 发卡汇总", event.self_id, [段_文本(概览)])];
            if (名称列表.length === 0) {
                messages[0].content[0].data.text += `\n（当前无任何商品）`;
            }
            const 卡密每页行数 = 35;
            for (const 名 of 名称列表) {
                const 代号 = 代号表[名];
                const 单价 = 获取发卡商品单价(价格表, 名);
                const 价显 = 单价 !== null ? `${单价} 归笺` : "-";
                const 卡密行 = 读取发卡库存非空行(代号);
                const 库存 = 卡密行.length;
                const 状态显 = 发卡商品是否上架(上下架表, 名) ? "上架（商店可见、可兑换）" : "下架（商店不展示、不可兑换）";
                const 基础 = `🛍️ ${名}\n🔑 专属代号：${代号}\n💰 定价：${价显}\n📊 当前库存：${库存} 条\n📌 状态：${状态显}`;
                const forward子节点 = [];
                if (库存 === 0) {
                    forward子节点.push(合并节点("📦 详情", event.self_id, [段_文本(`${基础}\n\n📜 暂无卡密`)]));
                } else if (库存 <= 卡密每页行数) {
                    const 列表体 = 卡密行.map((line, j) => `${j + 1}. ${line}`).join("\n");
                    forward子节点.push(合并节点("📦 详情", event.self_id, [段_文本(`${基础}\n\n📜 卡密列表\n══════════════\n${列表体}`)]));
                } else {
                    forward子节点.push(合并节点("📦 详情", event.self_id, [段_文本(`${基础}\n\n📜 卡密较多，已按 ${卡密每页行数} 条/页拆分见下方`)]));
                    for (let i = 0; i < 卡密行.length; i += 卡密每页行数) {
                        const 片 = 卡密行.slice(i, i + 卡密每页行数);
                        const 起 = i + 1;
                        const 止 = i + 片.length;
                        const 列表体 = 片.map((line, j) => `${i + j + 1}. ${line}`).join("\n");
                        forward子节点.push(合并节点("🔐 卡密", event.self_id, [段_文本(`🔐 ${名} 卡密 ${起}-${止}/${库存}\n══════════════\n${列表体}`)]));
                    }
                }
                messages.push(嵌套合并节点("🛒 商品", event.self_id, forward子节点, {}, [段_文本(`「${名}」`)]));
            }
            await 发合并消息(event, messages, 合并预览(
                "发卡商品列表",
                `共 ${messages.length} 个商品，含库存与卡密明细`,
                "[聊天记录]",
                ["商品: 名称/价格/库存", "详情: 卡密分页展示", "下架商品: 不展示于商店"],
            ));
            return 'halt';
        }
        return false;
    }

    return false;
}
