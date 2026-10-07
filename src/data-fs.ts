// ---------------------------------------------------------------------------
// 插件数据目录与 JSON 键值读写（readA/writeA/readB/writeB 等）。
// 子模块可只 import 本文件；与主包共用一份实现，bundler 会去重为单块。
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type { MkLogMethod, MkLoggerResolved } from './types';

// ---------------------------------------------------------------------------
// 内部状态与 logger
// ---------------------------------------------------------------------------

const noopMkLog: MkLogMethod = () => {};
const defaultLogger: MkLoggerResolved = {
  error: noopMkLog,
  warn: noopMkLog,
  info: noopMkLog,
  log: noopMkLog,
  debug: noopMkLog,
};

let dataPath = '';
let pluginPath = '';
let logger: MkLoggerResolved = defaultLogger;

/** 与 mkbot-core 中模块级 logger 绑定同一引用，需在 plugin_init 赋值 logger 后调用 */
export function bindMkbotLogger(next: MkLoggerResolved): void {
  logger = next;
}

// ---------------------------------------------------------------------------
// 数据目录
// ---------------------------------------------------------------------------

export function setDataPath(dir: string): void {
  dataPath = dir;
}

export function getDataPath(): string {
  return dataPath;
}

export function setPluginPath(dir: string): void {
  pluginPath = String(dir || '').trim();
}

export function getPluginPath(): string {
  return pluginPath;
}

export function getDefaultResourceDir(): string {
  return pluginPath ? path.join(pluginPath, '默认资源') : '';
}

function isDefaultResourceRel(filename: string): boolean {
  const rel = String(filename || '').replace(/\\/g, '/').replace(/^\.?\//, '');
  return rel === '默认资源' || rel.startsWith('默认资源/');
}

export function resolvePluginOrDataPath(filename: string): string {
  if (path.isAbsolute(filename)) return filename;
  if (isDefaultResourceRel(filename) && pluginPath) {
    return path.join(pluginPath, filename);
  }
  return path.join(dataPath, filename);
}

// ---------------------------------------------------------------------------
// 整文件读写
// ---------------------------------------------------------------------------

export function readA(filename: string): string {
  const filePath = resolvePluginOrDataPath(filename);
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch (error) {
    logger.error(`[Function] 读取文件 ${filename} 失败:`, error);
  }
  return '';
}

export function writeA(filename: string, content: string): boolean {
  const filePath = resolvePluginOrDataPath(filename);
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    logger.error(`[Function] 写入文件 ${filename} 失败:`, error);
    return false;
  }
}

/** 删除整个文件；文件本来就不存在也算成功（结果一致） */
export function deleteA(filename: string): boolean {
  const filePath = resolvePluginOrDataPath(filename);
  try {
    if (!fs.existsSync(filePath)) return true;
    fs.rmSync(filePath, { force: true });
    return true;
  } catch (error) {
    logger.error(`[Function] 删除文件 ${filename} 失败:`, error);
    return false;
  }
}

// ---------------------------------------------------------------------------
// JSON 键值（单文件对象上的键）
// ---------------------------------------------------------------------------

export function readB(filename: string, key: string, defaultValue: unknown = ''): unknown {
  const filePath = resolvePluginOrDataPath(filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;
      if (key in data && data[key] !== null && data[key] !== undefined) {
        return data[key];
      }
    }
  } catch (error) {
    logger.error(`[Function] 读取文件 ${filename} 失败:`, error);
  }
  return defaultValue;
}

export function writeB(filename: string, key: string, value: unknown): boolean {
  const filePath = resolvePluginOrDataPath(filename);
  const dir = path.dirname(filePath);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    let data: Record<string, unknown> = {};
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(content) as Record<string, unknown>;
      } catch {
        data = {};
      }
    }
    data[key] = value;
    const content = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, content, 'utf-8');
    return true;
  } catch (error) {
    logger.error(`[Function] 写入文件 ${filename} 失败:`, error);
    return false;
  }
}

export function deleteKey(filename: string, key: string): boolean {
  const filePath = path.join(dataPath, filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;
      delete data[key];
      const newContent = JSON.stringify(data, null, 2);
      fs.writeFileSync(filePath, newContent, 'utf-8');
      return true;
    }
  } catch (error) {
    logger.error(`[Function] 删除键失败:`, error);
  }
  return false;
}

export function hasKey(filename: string, key: string): boolean {
  const filePath = path.join(dataPath, filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;
      return key in data;
    }
  } catch (error) {
    logger.error(`[Function] 检查键失败:`, error);
  }
  return false;
}

export function getKeys(filename: string): string[] {
  const filePath = path.join(dataPath, filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as Record<string, unknown>;
      return Object.keys(data);
    }
  } catch (error) {
    logger.error(`[Function] 获取键失败:`, error);
  }
  return [];
}

export function clear(filename: string): boolean {
  return writeA(filename, '{}');
}
