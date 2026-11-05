import { createFileRoute } from '@tanstack/react-router';

import { envConfigs } from '@/config';
import { aiTask } from '@/config/db/schema';
import { CREDITS_PER_EDIT } from '@/config/pricing';
import { getAuth } from '@/core/auth';
import {
  DEFAULT_EDIT_MODEL,
  EDIT_MODELS,
  EDIT_QUALITIES,
  ImageEditError,
  runMarkupEdit,
  type EditModel,
} from '@/core/ai/image-edit';
import { db } from '@/core/db';
import { consume, getBalance, revoke } from '@/modules/credits/service';
import { getUuid } from '@/lib/hash';
import { enforceMinIntervalRateLimit } from '@/lib/rate-limit';
import { respData, respErr } from '@/lib/resp';

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 16_777_216;
const RASTER = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Read PNG/JPEG/WebP dimensions from the header bytes. */
function imageSize(buf: Uint8Array): { w: number; h: number; type: string } | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { w: dv.getUint32(16), h: dv.getUint32(20), type: 'png' };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      const len = dv.getUint16(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: dv.getUint16(i + 5), w: dv.getUint16(i + 7), type: 'jpeg' };
      }
      i += 2 + len;
    }
    return null;
  }
  if (buf.length > 30 && String.fromCharCode(...buf.slice(0, 4)) === 'RIFF' && String.fromCharCode(...buf.slice(8, 12)) === 'WEBP') {
    const fmt = String.fromCharCode(...buf.slice(12, 16));
    if (fmt === 'VP8X') return { w: 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16)), h: 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16)), type: 'webp' };
    if (fmt === 'VP8 ') return { w: dv.getUint16(26, true) & 0x3fff, h: dv.getUint16(28, true) & 0x3fff, type: 'webp' };
    if (fmt === 'VP8L') {
      const b = dv.getUint32(21, true);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1, type: 'webp' };
    }
  }
  return null;
}

function looksLikeSvg(file: File, head: Uint8Array) {
  if (/svg/i.test(file.type) || /\.svgz?$/i.test(file.name)) return true;
  const s = new TextDecoder().decode(head.slice(0, 512)).trimStart().toLowerCase();
  return s.startsWith('<svg') || (s.startsWith('<?xml') && s.includes('<svg'));
}

async function POST({ request }: { request: Request }) {
  const limited = enforceMinIntervalRateLimit(request, { intervalMs: 5_000, keyPrefix: 'mie-edit' });
  if (limited) return limited;

  const apiKey = envConfigs.tryallapi_api_key;
  if (!apiKey) return respErr('Image editing is not configured yet.', { status: 503 });

  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return respErr('Please buy a credit pack or sign in to edit.', { status: 401 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return respErr('Expected multipart form data.', { status: 400 });
  }
  const image = form.get('image');
  const markup = form.get('markup');
  const instruction = String(form.get('instruction') || '').trim();
  const modelRaw = String(form.get('model') || DEFAULT_EDIT_MODEL);
  const qualityRaw = String(form.get('quality') || 'medium');
  if (!(image instanceof File)) return respErr('Upload an image first.', { status: 400 });
  if (!(markup instanceof File)) return respErr('Mark the area you want to change first.', { status: 400 });
  if (instruction.length < 3) return respErr('Describe what to change inside the marked area.', { status: 400 });
  if (instruction.length > 1500) return respErr('Instruction is too long (max 1500 characters).', { status: 400 });
  if (image.size > MAX_BYTES || markup.size > MAX_BYTES) return respErr('Image is too large (max 20 MB).', { status: 413 });

  const imgBuf = new Uint8Array(await image.arrayBuffer());
  if (looksLikeSvg(image, imgBuf)) {
    return respErr('SVG files cannot be edited. Export your SVG to PNG (or JPEG/WebP) and upload that instead.', { status: 415 });
  }
  if (image.type === 'image/gif' || /\.gif$/i.test(image.name)) {
    return respErr('GIF is not supported for edits. Please upload a PNG, JPEG or WebP.', { status: 415 });
  }
  const isz = imageSize(imgBuf);
  if (!isz || (!RASTER.has(image.type) && image.type !== '')) {
    return respErr('Unsupported image. Please upload a PNG, JPEG or WebP.', { status: 415 });
  }
  if (isz.w * isz.h > MAX_PIXELS) return respErr('Image has too many pixels (max 16.7 MP).', { status: 413 });
  const mkBuf = new Uint8Array(await markup.arrayBuffer());
  const msz = imageSize(mkBuf);
  if (!msz || msz.type !== 'png') return respErr('Markup layer must be a PNG.', { status: 400 });
  if (msz.w !== isz.w || msz.h !== isz.h) {
    return respErr('Markup layer must match the image size. Please reload and try again.', { status: 400 });
  }

  const model: EditModel = modelRaw in EDIT_MODELS ? (modelRaw as EditModel) : DEFAULT_EDIT_MODEL;
  const quality = EDIT_QUALITIES.has(qualityRaw) ? qualityRaw : 'medium';

  const consumed = await consume({
    userId: session.user.id,
    userEmail: session.user.email,
    credits: CREDITS_PER_EDIT,
    scene: 'markup_edit',
    description: `Markup edit · ${model}`,
    metadata: JSON.stringify({ model, quality, w: isz.w, h: isz.h }),
  });
  if (!consumed.success) {
    const balance = await getBalance(session.user.id).catch(() => 0);
    return respErr('Insufficient credits', { status: 402, headers: { 'x-balance': String(balance) } });
  }
  const creditId = consumed.consumedCredit?.id || null;
  const taskId = getUuid();

  try {
    const out = await runMarkupEdit({
      apiKey,
      image: new Blob([imgBuf], { type: image.type || `image/${isz.type}` }),
      imageName: `source.${isz.type === 'jpeg' ? 'jpg' : isz.type}`,
      markup: new Blob([mkBuf], { type: 'image/png' }),
      instruction,
      model,
      quality,
      safetyId: (await sha256Hex(`mie:${session.user.id}`)).slice(0, 32),
    });
    try {
      await db().insert(aiTask).values({
        id: taskId,
        userId: session.user.id,
        mediaType: 'image',
        provider: 'tryallapi',
        model,
        prompt: instruction,
        options: JSON.stringify({ quality, w: isz.w, h: isz.h }),
        status: 'success',
        taskInfo: JSON.stringify({ ms: out.ms, size: out.size, usage: out.usage }),
        costCredits: CREDITS_PER_EDIT,
        scene: 'markup_edit',
        creditId,
      });
    } catch (e) {
      console.warn('[edit] task log failed', e);
    }
    const balance = await getBalance(session.user.id).catch(() => null);
    return respData({
      taskId,
      image: `data:${out.mime};base64,${out.b64}`,
      size: out.size,
      ms: out.ms,
      model,
      credits: CREDITS_PER_EDIT,
      balance,
    });
  } catch (e: any) {
    if (creditId) {
      try {
        await revoke(creditId);
      } catch (re) {
        console.error('[edit] refund failed', re);
      }
    }
    const err = e instanceof ImageEditError ? e : new ImageEditError('Edit failed. Your credits were refunded.');
    if (!(e instanceof ImageEditError)) console.error('[edit] unexpected', e?.message || e);
    return respErr(err.message, { status: err.status, headers: { 'x-error-code': err.code } });
  }
}

export const Route = createFileRoute('/api/edit')({
  server: { handlers: { POST } },
});
