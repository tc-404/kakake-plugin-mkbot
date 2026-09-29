// ---------------------------------------------------------------------------
// bqb-fade-away：灰飞烟灭（35 帧 GIF，Sharp 近似移植自 meme-generator-rs）
// ---------------------------------------------------------------------------

import { getBqbSharp } from './bqb-shared';
import type { BqbRenderResult } from './bqb-crawl';

interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dx: number;
  dy: number;
  radius: number;
  dead: boolean;
}

export interface BqbFadeAwayInput {
  avatar: Buffer;
  dataPath: string;
  pluginDir: string;
}

function seededNext(seed: number): number {
  return (seed * 1664525 + 1013904223) >>> 0;
}

function makeSeed(buf: Buffer): number {
  let seed = 0;
  const len = Math.min(buf.length, 512);
  for (let i = 0; i < len; i++) seed = (seed * 131 + buf[i]) >>> 0;
  return seed || 1;
}

function buildDotSvg(width: number, height: number, dusts: Dot[]): Buffer {
  const circles = dusts
    .filter((d) => !d.dead && d.radius > 0)
    .map((d) => `<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${d.radius.toFixed(2)}" fill="#000"/>`)
    .join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${circles}</svg>`,
  );
}

export async function render(input: BqbFadeAwayInput): Promise<BqbRenderResult> {
  const sharp = await getBqbSharp();

  let image = sharp(input.avatar).rotate().ensureAlpha();
  const meta = await image.metadata();
  const maxWidth = 200;
  if ((meta.width || 0) > maxWidth) {
    image = image.resize({ width: maxWidth });
  }
  const basePng = await image.png().toBuffer();
  const info = await sharp(basePng).metadata();
  const width = Math.max(1, Number(info.width) || 1);
  const height = Math.max(1, Number(info.height) || 1);
  const raw = await sharp(basePng).ensureAlpha().raw().toBuffer();

  const centerX = (width * 2) / 3;
  const centerY = (height * 3) / 2;
  const radius = Math.sqrt(centerX * centerX + centerY * centerY);
  const step = radius / 24;

  const dusts: Dot[] = [];
  let seed = makeSeed(input.avatar);
  const frames: Buffer[] = [];

  for (let i = 0; i < 35; i++) {
    if (i <= 9) {
      frames.push(basePng);
      continue;
    }

    if (i < 28) {
      const t = i - 9;
      const r1 = step * (t + 4);
      const r2 = step * (t + 5);
      const r3 = step * (t + 11);

      const pixelOverlays: string[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const a = raw[idx + 3] ?? 0;
          if (a === 0) continue;
          const dx0 = x - centerX;
          const dy0 = y - centerY;
          const dist = Math.sqrt(dx0 * dx0 + dy0 * dy0);

          if (dist <= r1) {
            continue;
          }
          if (dist <= r2) {
            pixelOverlays.push(`<rect x="${x}" y="${y}" width="1" height="1" fill="black"/>`);
            continue;
          }
          if (dist <= r3) {
            seed = seededNext(seed);
            const rand = (seed & 0xffff) / 0xffff;
            let factor = 0.5 + (dist - r2) / Math.max(0.001, r3 - r2);
            factor = Math.max(0, Math.min(1, factor));
            factor *= 0.9 + 0.2 * rand;
            const gray = Math.max(
              0,
              Math.min(255, Math.round((((raw[idx] ?? 0) + (raw[idx + 1] ?? 0) + (raw[idx + 2] ?? 0)) / 3) * factor)),
            );
            pixelOverlays.push(
              `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${gray},${gray},${gray})" fill-opacity="${(
                a / 255
              ).toFixed(3)}"/>`,
            );
          } else {
            const rr = raw[idx] ?? 0;
            const gg = raw[idx + 1] ?? 0;
            const bb = raw[idx + 2] ?? 0;
            pixelOverlays.push(
              `<rect x="${x}" y="${y}" width="1" height="1" fill="rgb(${rr},${gg},${bb})" fill-opacity="${(
                a / 255
              ).toFixed(3)}"/>`,
            );
          }
        }
      }

      for (let r = Math.floor(r1); r < Math.floor(r2); r++) {
        for (let theta = 0; theta < 180; theta++) {
          const rad = (theta * Math.PI) / 180;
          const x = Math.floor(centerX + r * Math.cos(rad));
          const y = Math.floor(centerY - r * Math.sin(rad));
          if (x < 0 || x >= width || y < 0 || y >= height) continue;
          const idx = (y * width + x) * 4;
          const a = raw[idx + 3] ?? 0;
          if (a === 0) continue;
          seed = seededNext(seed);
          if (((seed & 0xffff) / 0xffff) < 0.1) {
            const rr = Math.max(1, r);
            dusts.push({
              x,
              y,
              vx: 0,
              vy: 0,
              dx: (x - centerX) / rr,
              dy: (1.5 * (y - centerY)) / rr,
              radius: 1 + (((seed >>> 16) & 0xffff) / 0xffff) * 2,
              dead: false,
            });
          }
        }
      }

      for (const dot of dusts) {
        if (dot.dead) continue;
        const a = (0.02 * step) / Math.max(1, dot.radius);
        dot.vx += a * dot.dx;
        dot.vy += a * dot.dy;
        dot.x += dot.vx;
        dot.y += dot.vy;
        seed = seededNext(seed);
        if (((seed & 0xffff) / 0xffff) < 0.25) dot.radius -= 1;
        if (
          dot.radius <= 0 ||
          dot.x + dot.radius < 0 ||
          dot.x - dot.radius > width ||
          dot.y + dot.radius < 0 ||
          dot.y - dot.radius > height
        ) {
          dot.dead = true;
        }
      }

      const frameSvg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${pixelOverlays.join('')}</svg>`,
      );
      const dustSvg = buildDotSvg(width, height, dusts);
      frames.push(
        await sharp({
          create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([
            { input: frameSvg, left: 0, top: 0 },
            { input: dustSvg, left: 0, top: 0 },
          ])
          .png()
          .toBuffer(),
      );
    } else {
      for (const dot of dusts) {
        if (dot.dead) continue;
        const a = (0.02 * step) / Math.max(1, dot.radius);
        dot.vx += a * dot.dx;
        dot.vy += a * dot.dy;
        dot.x += dot.vx;
        dot.y += dot.vy;
        seed = seededNext(seed);
        if (((seed & 0xffff) / 0xffff) < 0.25) dot.radius -= 1;
        if (
          dot.radius <= 0 ||
          dot.x + dot.radius < 0 ||
          dot.x - dot.radius > width ||
          dot.y + dot.radius < 0 ||
          dot.y - dot.radius > height
        ) {
          dot.dead = true;
        }
      }
      const dustSvg = buildDotSvg(width, height, dusts);
      frames.push(
        await sharp({
          create: {
            width,
            height,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        })
          .composite([{ input: dustSvg, left: 0, top: 0 }])
          .png()
          .toBuffer(),
      );
    }
  }

  const buffer = await sharp({
    create: {
      width,
      height: height * frames.length,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      pageHeight: height,
    },
  })
    .composite(frames.map((input, i) => ({ input, left: 0, top: i * height })))
    .gif({ delay: 80, loop: 0, effort: 1 })
    .toBuffer();

  return { buffer, mime: 'image/gif', ext: 'gif' };
}

export const renderFadeAway = render;
