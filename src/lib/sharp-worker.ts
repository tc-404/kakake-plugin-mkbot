/**
 * Sharp 渲染 Worker：在独立线程跑全部 render*WithSharpImpl / bqb，避免堵死主进程事件循环。
 * 协议：主线程 → { id, kind, paths, payload }
 *       Worker → { id, ok:true, buffer:ArrayBuffer, mime?, ext? } | { id, ok:false, error }
 */

import { parentPort } from 'node:worker_threads';
import {
  configureSharpRuntimePaths,
  configureSharpConcurrency,
  type SharpRuntimePaths,
} from './sharp-loader';
import { configureSharpPngCompressionLevel } from './png-output';
import { applySharpBgCacheConfig } from './sharp-bg-cache';
import { configureSharpSvgDirect } from './sharp-svg-layer';
import { renderMenuWithSharpImpl } from './sharp-render';
import { renderApiInterfaceMenuWithSharpImpl } from './api-interface-sharp-render';
import { renderFortuneWithSharpImpl } from './fortune-sharp-render';
import { renderStatusWithSharpImpl } from './status-sharp-render';
import { renderSignInWithSharpImpl } from './signin-sharp-render';
import { renderWalletWithSharpImpl } from './wallet-sharp-render';
import { renderShopWithSharpImpl } from './shop-sharp-render';
import { renderFishBasketWithSharpImpl } from './fish-basket-sharp-render';
import { renderMusicListWithSharpImpl } from './music-list-sharp-render';
import { renderJoinIdentityWithSharpImpl } from './join-identity-sharp-render';

import { render as renderCrawl } from './api/bqb-crawl';
import { render as renderPlay } from './api/bqb-play';
import { render as renderBite } from './api/bqb-bite';
import { render as renderPetpet } from './api/bqb-petpet';
import { render as renderEat } from './api/bqb-eat';
import { render as renderSuck } from './api/bqb-suck';
import { render as renderJiujiu } from './api/bqb-jiujiu';
import { render as renderScratchHead } from './api/bqb-scratch-head';
import { render as renderRub } from './api/bqb-rub';
import { render as renderAbstinence } from './api/bqb-abstinence';
import { render as renderAcgEntrance } from './api/bqb-acg-entrance';
import { render as renderAddiction } from './api/bqb-addiction';
import { render as renderDontTouch } from './api/bqb-dont-touch';
import { render as renderFadeAway } from './api/bqb-fade-away';
import { render as renderPound } from './api/bqb-pound';
import { render as renderSoldOut } from './api/bqb-sold-out';
import { render as renderTaunt } from './api/bqb-taunt';
import { render as renderThinkWhat } from './api/bqb-think-what';
import { render as renderWhatIWantToDo } from './api/bqb-what-i-want-to-do';
import { render as renderYouDontGet } from './api/bqb-you-dont-get';

type JobMsg = {
  id: number;
  kind: string;
  paths?: SharpRuntimePaths;
  payload?: Record<string, unknown>;
  /** libvips 并发线程数；省略/null 表示沿用 sharp 默认 */
  concurrency?: number | null;
  /** PNG 压缩级别 0~9；省略/null 表示沿用 sharp 默认（6） */
  pngLevel?: number | null;
  /** 背景图层缓存配置 */
  bgCache?: { enabled?: boolean; maxEntries?: number } | null;
  /** SVG 直传合成开关 */
  svgDirect?: boolean | null;
};

/**
 * Worker 线程有自己的模块实例，主线程的配置必须随消息带过来。
 * 每个 job 都带，配置改动后无需重启线程即可生效。
 */
function applyRuntimeOptions(msg: JobMsg): void {
  if (msg.concurrency !== undefined) configureSharpConcurrency(msg.concurrency);
  if (msg.pngLevel !== undefined) configureSharpPngCompressionLevel(msg.pngLevel, undefined);
  if (msg.bgCache !== undefined) applySharpBgCacheConfig(msg.bgCache, undefined);
  if (msg.svgDirect !== undefined) configureSharpSvgDirect(msg.svgDirect ? '开' : '关闭', undefined);
}

function abToBuffer(v: unknown): Buffer {
  if (Buffer.isBuffer(v)) return v;
  if (v instanceof ArrayBuffer) return Buffer.from(v);
  if (ArrayBuffer.isView(v)) {
    const view = v as ArrayBufferView;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  }
  throw new Error('无效的图片 Buffer');
}

function toTransferable(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength);
  new Uint8Array(ab).set(buf);
  return ab;
}

async function dispatchCard(kind: string, payload: Record<string, unknown>): Promise<Buffer> {
  const logger = undefined;
  let b64: string | null = null;

  switch (kind) {
    case 'menu':
      b64 = await renderMenuWithSharpImpl(
        String(payload.pluginDir || ''),
        String(payload.dataPath || ''),
        (payload.options || {}) as any,
        logger,
      );
      break;
    case 'api-menu':
      b64 = await renderApiInterfaceMenuWithSharpImpl((payload.options || {}) as any, logger);
      break;
    case 'fortune':
      b64 = await renderFortuneWithSharpImpl((payload.options || {}) as any, logger);
      break;
    case 'status':
      b64 = await renderStatusWithSharpImpl((payload.options || {}) as any, logger);
      break;
    case 'signin':
      b64 = await renderSignInWithSharpImpl((payload.options || {}) as any, logger);
      break;
    case 'wallet':
      b64 = await renderWalletWithSharpImpl((payload.options || {}) as any, logger);
      break;
    case 'shop':
      b64 = await renderShopWithSharpImpl((payload.options || {}) as any, logger);
      break;
    case 'fish-basket':
      b64 = await renderFishBasketWithSharpImpl((payload.options || {}) as any, logger);
      break;
    case 'music-list':
      b64 = await renderMusicListWithSharpImpl((payload.options || {}) as any, logger);
      break;
    case 'join-identity':
      b64 = await renderJoinIdentityWithSharpImpl((payload.options || {}) as any, logger);
      break;
    default:
      throw new Error(`未知卡片 kind=${kind}`);
  }

  if (!b64) throw new Error(`渲染失败 kind=${kind}`);
  return Buffer.from(b64, 'base64');
}

async function dispatchBqb(payload: Record<string, unknown>): Promise<{ buffer: Buffer; mime: string; ext: string }> {
  const subKind = String(payload.subKind || '').trim();
  const dataPath = String(payload.dataPath || '');
  const pluginDir = String(payload.pluginDir || '');
  const commonBase = { dataPath, pluginDir };

  let result: { buffer: Buffer; mime: string; ext: string };

  if (subKind === 'rub') {
    result = await renderRub({
      selfAvatar: abToBuffer(payload.selfAvatar),
      targetAvatar: abToBuffer(payload.targetAvatar),
      ...commonBase,
    });
  } else if (subKind === 'abstinence') {
    result = await renderAbstinence({
      avatar: abToBuffer(payload.avatar),
      displayName: String(payload.displayName || ''),
      date: payload.date != null ? String(payload.date) : undefined,
      ...commonBase,
    } as any);
  } else {
    const avatar = abToBuffer(payload.avatar);
    const common = { avatar, ...commonBase };
    if (subKind === 'crawl') result = await renderCrawl(common);
    else if (subKind === 'play') result = await renderPlay(common);
    else if (subKind === 'bite') result = await renderBite(common);
    else if (subKind === 'petpet') result = await renderPetpet(common);
    else if (subKind === 'eat') result = await renderEat(common);
    else if (subKind === 'suck') result = await renderSuck(common);
    else if (subKind === 'jiujiu') result = await renderJiujiu(common);
    else if (subKind === 'scratch_head') result = await renderScratchHead(common);
    else if (subKind === 'acg_entrance') result = await renderAcgEntrance(common as any);
    else if (subKind === 'addiction') result = await renderAddiction(common);
    else if (subKind === 'dont_touch') result = await renderDontTouch(common);
    else if (subKind === 'fade_away') result = await renderFadeAway(common);
    else if (subKind === 'pound') result = await renderPound(common);
    else if (subKind === 'sold_out') result = await renderSoldOut(common);
    else if (subKind === 'taunt') result = await renderTaunt(common);
    else if (subKind === 'think_what') result = await renderThinkWhat(common);
    else if (subKind === 'what_i_want_to_do') result = await renderWhatIWantToDo(common);
    else if (subKind === 'you_dont_get') result = await renderYouDontGet(common);
    else throw new Error(`未知 bqb subKind=${subKind}`);
  }

  return result;
}

async function handleJob(msg: JobMsg): Promise<void> {
  const id = Number(msg?.id);
  try {
    if (msg.paths) configureSharpRuntimePaths(msg.paths);
    applyRuntimeOptions(msg);
    const kind = String(msg.kind || '');
    const payload = msg.payload && typeof msg.payload === 'object' ? msg.payload : {};

    if (kind === 'bqb') {
      const result = await dispatchBqb(payload);
      const buffer = toTransferable(result.buffer);
      parentPort!.postMessage(
        { id, ok: true, buffer, mime: result.mime, ext: result.ext },
        [buffer],
      );
      return;
    }

    const png = await dispatchCard(kind, payload);
    const buffer = toTransferable(png);
    parentPort!.postMessage(
      { id, ok: true, buffer, mime: 'image/png', ext: 'png' },
      [buffer],
    );
  } catch (e: any) {
    parentPort!.postMessage({
      id,
      ok: false,
      error: String(e?.message || e || 'Sharp Worker 渲染失败'),
    });
  }
}

if (!parentPort) {
  throw new Error('sharp-worker 须由 worker_threads 启动');
}

parentPort.on('message', (msg: JobMsg) => {
  void handleJob(msg);
});
