// @ts-nocheck
// ---------------------------------------------------------------------------
// 发卡系统 WebUI API（与 ./card-shop.ts 共用数据目录）
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type { CardShopDeps } from '../types';
import {
    getCardShopEmailResendSettings,
    setCardShopEmailResendEnabled,
} from './card-shop-mail';

export const CARD_SHOP_ROOT = `筱筱吖/扩展功能/发卡系统/`;

function loadJsonMap(deps: CardShopDeps, file: string) {
    const content = deps.readA(`${CARD_SHOP_ROOT}${file}`);
    if (!content) return {};
    try {
        const obj = JSON.parse(content);
        return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    } catch {
        return {};
    }
}

function saveJsonMap(deps: CardShopDeps, file: string, obj: Record<string, unknown>) {
    deps.writeA(`${CARD_SHOP_ROOT}${file}`, JSON.stringify(obj, null, 2));
}

function stockFilePath(deps: CardShopDeps, code: string) {
    return path.join(deps.getDataPath(), CARD_SHOP_ROOT, 'data', `${code}.txt`);
}

function readStockLines(deps: CardShopDeps, code: string) {
    const fp = stockFilePath(deps, code);
    if (!fs.existsSync(fp)) return [];
    return fs.readFileSync(fp, 'utf-8').split(/\r?\n/).filter((line) => line.trim() !== '');
}

function writeStockLines(deps: CardShopDeps, code: string, lines: string[]) {
    const fp = stockFilePath(deps, code);
    const dir = path.dirname(fp);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fp, lines.length ? lines.join('\n') + '\n' : '', 'utf-8');
}

function isOnShelf(shelfMap: Record<string, unknown>, name: string) {
    if (!Object.prototype.hasOwnProperty.call(shelfMap, name)) return true;
    return shelfMap[name] !== false;
}

function getPrice(priceMap: Record<string, unknown>, name: string) {
    if (!Object.prototype.hasOwnProperty.call(priceMap, name)) return null;
    const n = Number(priceMap[name]);
    if (Number.isNaN(n) || n < 0) return null;
    return n;
}

function genProductCode(deps: CardShopDeps) {
    const r = deps.rand;
    return String(r('A', 'Z')) + String(r('A', 'Z')) + String(r('A', 'Z')) + String(r(100000, 999999));
}

export function listCardShopProducts(deps: CardShopDeps) {
    const codes = loadJsonMap(deps, '商品代号.json');
    const prices = loadJsonMap(deps, '商品价格.json');
    const shelf = loadJsonMap(deps, '商品上下架.json');
    const names = Object.keys(codes).sort();
    let totalStock = 0;
    let onShelfCount = 0;
    let pricedCount = 0;
    const list = names.map((name) => {
        const code = String(codes[name] || '');
        const stock = code ? readStockLines(deps, code).length : 0;
        const price = getPrice(prices, name);
        const onShelf = isOnShelf(shelf, name);
        totalStock += stock;
        if (onShelf) onShelfCount++;
        if (price !== null) pricedCount++;
        return { name, code, price, stock, onShelf };
    });
    return {
        summary: {
            productCount: names.length,
            onShelfCount,
            offShelfCount: names.length - onShelfCount,
            totalStock,
            pricedCount,
            unpricedCount: names.length - pricedCount,
        },
        list,
    };
}

export function getCardShopProductDetail(deps: CardShopDeps, name: string, stockPage = 1, stockPageSize = 50) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, message: 'missing_name' };
    const codes = loadJsonMap(deps, '商品代号.json');
    if (!codes[trimmed]) return { ok: false, message: 'not_found' };
    const code = String(codes[trimmed]);
    const prices = loadJsonMap(deps, '商品价格.json');
    const shelf = loadJsonMap(deps, '商品上下架.json');
    const lines = readStockLines(deps, code);
    const page = Math.max(1, stockPage);
    const pageSize = Math.min(200, Math.max(1, stockPageSize));
    const totalPages = Math.max(1, Math.ceil(lines.length / pageSize));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const stockSlice = lines.slice(start, start + pageSize).map((line, i) => ({
        index: start + i + 1,
        line,
    }));
    return {
        ok: true,
        data: {
            name: trimmed,
            code,
            price: getPrice(prices, trimmed),
            onShelf: isOnShelf(shelf, trimmed),
            stock: lines.length,
            stockPage: safePage,
            stockPageSize: pageSize,
            stockTotalPages: totalPages,
            stockLines: stockSlice,
        },
    };
}

export function createCardShopProduct(deps: CardShopDeps, name: string) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, message: '请输入商品名称' };
    const codes = loadJsonMap(deps, '商品代号.json');
    if (codes[trimmed]) return { ok: false, message: '商品已存在', code: codes[trimmed] };
    const code = genProductCode(deps);
    codes[trimmed] = code;
    saveJsonMap(deps, '商品代号.json', codes);
    writeStockLines(deps, code, []);
    return { ok: true, name: trimmed, code };
}

export function renameCardShopProduct(deps: CardShopDeps, oldName: string, newName: string) {
    const oldN = String(oldName || '').trim();
    const newN = String(newName || '').trim();
    if (!oldN || !newN) return { ok: false, message: '名称不能为空' };
    if (oldN === newN) return { ok: false, message: '名称相同，无需修改' };
    const codes = loadJsonMap(deps, '商品代号.json');
    if (!codes[oldN]) return { ok: false, message: '原商品不存在' };
    if (codes[newN]) return { ok: false, message: '新名称已被占用' };
    const code = codes[oldN];
    codes[newN] = code;
    delete codes[oldN];
    saveJsonMap(deps, '商品代号.json', codes);
    const shelf = loadJsonMap(deps, '商品上下架.json');
    if (Object.prototype.hasOwnProperty.call(shelf, oldN)) {
        shelf[newN] = shelf[oldN];
        delete shelf[oldN];
        saveJsonMap(deps, '商品上下架.json', shelf);
    }
    const prices = loadJsonMap(deps, '商品价格.json');
    if (Object.prototype.hasOwnProperty.call(prices, oldN)) {
        prices[newN] = prices[oldN];
        delete prices[oldN];
        saveJsonMap(deps, '商品价格.json', prices);
    }
    return { ok: true, oldName: oldN, newName: newN, code };
}

export function setCardShopPrice(deps: CardShopDeps, name: string, price: unknown) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, message: '请输入商品名称' };
    const codes = loadJsonMap(deps, '商品代号.json');
    if (!codes[trimmed]) return { ok: false, message: '商品不存在' };
    const p = Math.floor(Number(price));
    if (!Number.isFinite(p) || p < 0) return { ok: false, message: '价格须为非负整数' };
    deps.writeB(`${CARD_SHOP_ROOT}商品价格.json`, trimmed, p);
    return { ok: true, name: trimmed, price: p };
}

export function setCardShopShelf(deps: CardShopDeps, name: string, onShelf: boolean) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, message: '请输入商品名称' };
    const codes = loadJsonMap(deps, '商品代号.json');
    if (!codes[trimmed]) return { ok: false, message: '商品不存在' };
    const shelf = loadJsonMap(deps, '商品上下架.json');
    shelf[trimmed] = !!onShelf;
    saveJsonMap(deps, '商品上下架.json', shelf);
    return { ok: true, name: trimmed, onShelf: !!onShelf };
}

export function appendCardShopStock(deps: CardShopDeps, name: string, lines: string[]) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, message: '请输入商品名称' };
    const codes = loadJsonMap(deps, '商品代号.json');
    const code = codes[trimmed];
    if (!code) return { ok: false, message: '商品不存在' };
    const incoming = (Array.isArray(lines) ? lines : []).map((x) => String(x || '').trim()).filter(Boolean);
    if (!incoming.length) return { ok: false, message: '没有有效卡密行' };
    const existing = readStockLines(deps, String(code));
    const batchSeen = new Set<string>();
    const added: string[] = [];
    const dupStock: string[] = [];
    const dupBatch: string[] = [];
    for (const item of incoming) {
        if (existing.includes(item) || added.some((a) => a === item)) {
            if (existing.includes(item)) dupStock.push(item);
            else dupBatch.push(item);
            continue;
        }
        if (batchSeen.has(item)) {
            dupBatch.push(item);
            continue;
        }
        batchSeen.add(item);
        added.push(item);
    }
    if (!added.length) return { ok: false, message: '没有可添加的新卡密', dupStock, dupBatch };
    writeStockLines(deps, String(code), existing.concat(added));
    return { ok: true, added: added.length, dupStock, dupBatch, stock: existing.length + added.length };
}

export function removeCardShopStockLines(deps: CardShopDeps, name: string, lines: string[]) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, message: '请输入商品名称' };
    const codes = loadJsonMap(deps, '商品代号.json');
    const code = codes[trimmed];
    if (!code) return { ok: false, message: '商品不存在' };
    const toRemove = (Array.isArray(lines) ? lines : []).map((x) => String(x || '')).filter(Boolean);
    if (!toRemove.length) return { ok: false, message: '请指定要删除的卡密' };
    let rows = readStockLines(deps, String(code));
    const removed: string[] = [];
    const missing: string[] = [];
    for (const line of toRemove) {
        const idx = rows.indexOf(line);
        if (idx === -1) missing.push(line);
        else {
            rows.splice(idx, 1);
            removed.push(line);
        }
    }
    writeStockLines(deps, String(code), rows);
    return { ok: true, removed: removed.length, removedLines: removed, missing, stock: rows.length };
}

export function clearCardShopStock(deps: CardShopDeps, name: string) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, message: '请输入商品名称' };
    const codes = loadJsonMap(deps, '商品代号.json');
    const code = codes[trimmed];
    if (!code) return { ok: false, message: '商品不存在' };
    writeStockLines(deps, String(code), []);
    return { ok: true, name: trimmed };
}

export function deleteCardShopProduct(deps: CardShopDeps, name: string) {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, message: '请输入商品名称' };
    const codes = loadJsonMap(deps, '商品代号.json');
    const code = codes[trimmed];
    if (!code) return { ok: false, message: '商品不存在' };
    delete codes[trimmed];
    saveJsonMap(deps, '商品代号.json', codes);
    const shelf = loadJsonMap(deps, '商品上下架.json');
    if (Object.prototype.hasOwnProperty.call(shelf, trimmed)) {
        delete shelf[trimmed];
        saveJsonMap(deps, '商品上下架.json', shelf);
    }
    const prices = loadJsonMap(deps, '商品价格.json');
    if (Object.prototype.hasOwnProperty.call(prices, trimmed)) {
        delete prices[trimmed];
        saveJsonMap(deps, '商品价格.json', prices);
    }
    const fp = stockFilePath(deps, String(code));
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return { ok: true, name: trimmed };
}

export function listCardShopExchangeLogs(deps: CardShopDeps, page = 1, pageSize = 30) {
    const logMap = loadJsonMap(deps, 'data/兑换日志.json');
    const entries = Object.entries(logMap).map(([key, val]) => {
        const row = val && typeof val === 'object' ? val as Record<string, unknown> : {};
        return {
            key,
            time: String(row['时间年月日时分秒'] || ''),
            ts: Number(row['时间戳毫秒'] || 0),
            qq: String(row['QQ'] || ''),
            before: Number(row['兑换前货币'] || 0),
            after: Number(row['兑换后货币'] || 0),
            cards: Array.isArray(row['获得的卡密']) ? row['获得的卡密'].map(String) : [],
        };
    }).sort((a, b) => b.ts - a.ts);
    const ps = Math.min(100, Math.max(1, pageSize));
    const total = entries.length;
    const totalPages = Math.max(1, Math.ceil(total / ps));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * ps;
    return {
        page: safePage,
        pageSize: ps,
        total,
        totalPages,
        list: entries.slice(start, start + ps),
    };
}

async function parsePostBody(req: { body?: unknown; on?: (ev: string, fn: (...args: unknown[]) => void) => void }) {
    let body = req.body;
    if (!body || (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)) {
        try {
            const raw = await new Promise<string>((resolve) => {
                let data = '';
                req.on?.('data', (chunk: Buffer | string) => { data += chunk; });
                req.on?.('end', () => resolve(data));
            });
            if (raw) body = JSON.parse(raw);
        } catch {
            body = {};
        }
    }
    return body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
}

function linesFromBody(body: Record<string, unknown>) {
    if (typeof body.lines === 'string') return body.lines.split(/\r?\n/);
    if (Array.isArray(body.lines)) return body.lines.map(String);
    return [];
}

/** 注册发卡系统 WebUI 路由（GET 与 POST 分两次调用以匹配 mkbot-core 结构） */
export function registerCardShopWebGetRoutes(
    base: { get: (path: string, handler: (...args: unknown[]) => unknown) => void },
    wrapPath: (p: string) => string,
    deps: CardShopDeps,
    logger?: { error?: (...args: unknown[]) => void },
) {
    base.get(wrapPath('/card-shop/products'), (_req, res) => {
        try {
            res.json({ code: 0, data: listCardShopProducts(deps) });
        } catch (error) {
            logger?.error?.('获取发卡商品列表失败:', error);
            res.status(500).json({ code: -1, message: '获取发卡商品列表失败' });
        }
    });

    base.get(wrapPath('/card-shop/product'), (req, res) => {
        try {
            const name = String(req?.query?.name || '').trim();
            const page = Number.parseInt(String(req?.query?.page || '1'), 10) || 1;
            const pageSize = Number.parseInt(String(req?.query?.pageSize || '50'), 10) || 50;
            const r = getCardShopProductDetail(deps, name, page, pageSize);
            if (!r.ok) {
                res.status(r.message === 'not_found' ? 404 : 400).json({ code: -1, message: r.message });
                return;
            }
            res.json({ code: 0, data: r.data });
        } catch (error) {
            logger?.error?.('获取发卡商品详情失败:', error);
            res.status(500).json({ code: -1, message: '获取发卡商品详情失败' });
        }
    });

    base.get(wrapPath('/card-shop/logs'), (req, res) => {
        try {
            const page = Number.parseInt(String(req?.query?.page || '1'), 10) || 1;
            const pageSize = Number.parseInt(String(req?.query?.pageSize || '30'), 10) || 30;
            res.json({ code: 0, data: listCardShopExchangeLogs(deps, page, pageSize) });
        } catch (error) {
            logger?.error?.('获取发卡兑换日志失败:', error);
            res.status(500).json({ code: -1, message: '获取发卡兑换日志失败' });
        }
    });

    base.get(wrapPath('/card-shop/settings/email-resend'), (_req, res) => {
        try {
            res.json({ code: 0, data: getCardShopEmailResendSettings(deps) });
        } catch (error) {
            logger?.error?.('获取发卡邮箱二次发送设置失败:', error);
            res.status(500).json({ code: -1, message: '获取发卡邮箱二次发送设置失败' });
        }
    });
}

export function registerCardShopWebPostRoutes(
    base: { post: (path: string, handler: (...args: unknown[]) => unknown) => void },
    wrapPath: (p: string) => string,
    deps: CardShopDeps,
    logger?: { error?: (...args: unknown[]) => void },
) {
    const postAction = (
        path: string,
        handler: (body: Record<string, unknown>) => { ok: boolean; message?: string; data?: unknown; [k: string]: unknown },
        errLabel: string,
        allowExtraDataOnFail = false,
    ) => {
        base.post(wrapPath(path), async (req, res) => {
            try {
                const body = await parsePostBody(req);
                const r = handler(body);
                if (!r.ok) {
                    const payload: Record<string, unknown> = { code: -1, message: r.message };
                    if (allowExtraDataOnFail && r.dupStock !== undefined) payload.data = r;
                    res.status(400).json(payload);
                    return;
                }
                const { ok, message, ...data } = r;
                res.json({ code: 0, data });
            } catch (error) {
                logger?.error?.(`${errLabel}:`, error);
                res.status(500).json({ code: -1, message: errLabel });
            }
        });
    };

    postAction('/card-shop/product/create', (body) => createCardShopProduct(deps, String(body.name || '')), '创建发卡商品失败');
    postAction('/card-shop/product/rename', (body) => renameCardShopProduct(deps, String(body.oldName || ''), String(body.newName || '')), '重命名发卡商品失败');
    postAction('/card-shop/product/price', (body) => setCardShopPrice(deps, String(body.name || ''), body.price), '设置发卡商品价格失败');
    postAction('/card-shop/product/shelf', (body) => {
        const onShelf = body.onShelf === true || body.onShelf === 'true' || body.onShelf === 1 || body.onShelf === '1';
        return setCardShopShelf(deps, String(body.name || ''), onShelf);
    }, '设置发卡商品上下架失败');
    postAction('/card-shop/product/stock/append', (body) => appendCardShopStock(deps, String(body.name || ''), linesFromBody(body)), '填充发卡库存失败', true);
    postAction('/card-shop/product/stock/remove', (body) => removeCardShopStockLines(deps, String(body.name || ''), linesFromBody(body)), '删除发卡库存失败');
    postAction('/card-shop/product/stock/clear', (body) => clearCardShopStock(deps, String(body.name || '')), '清空发卡库存失败');
    postAction('/card-shop/product/delete', (body) => deleteCardShopProduct(deps, String(body.name || '')), '删除发卡商品失败');

    base.post(wrapPath('/card-shop/settings/email-resend'), async (req, res) => {
        try {
            const body = await parsePostBody(req);
            const enabled =
                body.enabled === true ||
                body.enabled === 'true' ||
                body.enabled === 1 ||
                body.enabled === '1';
            res.json({ code: 0, data: setCardShopEmailResendEnabled(deps, enabled) });
        } catch (error) {
            logger?.error?.('保存发卡邮箱二次发送设置失败:', error);
            res.status(500).json({ code: -1, message: '保存发卡邮箱二次发送设置失败' });
        }
    });
}
