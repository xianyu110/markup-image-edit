/**
 * Markup-guided image edits via the tryallapi.com OpenAI-compatible relay.
 *
 * Verified 2026-11-05 against the relay: POST /v1/images/edits (multipart)
 *   image   = source raster (PNG/JPEG/WebP)
 *   markup  = separate transparent PNG annotation layer, same width/height
 *             as `image` (red circles/strokes). NOT combined with `mask`.
 *   prompt  = instruction that references the red markup and asks the model
 *             to remove the marks from the final image.
 * SVG is rejected upstream ("invalid_image_file"); we reject it earlier.
 */
import { TRYALLAPI_BASE } from '@/core/ai/tryallapi';

export const EDIT_MODELS = {
  'gpt-image-2.6-flare': 'Flare (fast)',
  'gpt-image-2.6-sunburst': 'Sunburst (detail)',
} as const;
export type EditModel = keyof typeof EDIT_MODELS;
export const DEFAULT_EDIT_MODEL: EditModel = 'gpt-image-2.6-flare';

export const EDIT_QUALITIES = new Set(['low', 'medium', 'high']);

export class ImageEditError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 502, code = 'upstream_error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function buildMarkupPrompt(instruction: string): string {
  const clean = instruction.trim().replace(/\s+/g, ' ').slice(0, 1500);
  return [
    `Edit only the area marked by the red markup (circle, outline or strokes): ${clean}`,
    'Keep everything outside the marked area exactly unchanged — same composition, framing, lighting, colors, text and details.',
    'Match the original style, fonts, perspective and texture inside the edited area.',
    'Remove all red markup strokes from the finished image.',
  ].join(' ');
}

export async function runMarkupEdit(opts: {
  apiKey: string;
  image: Blob;
  imageName: string;
  markup: Blob;
  instruction: string;
  model: EditModel;
  quality: string;
  safetyId?: string;
}): Promise<{ b64: string; mime: string; size?: string; usage?: any; ms: number }> {
  const fd = new FormData();
  fd.append('model', opts.model);
  fd.append('prompt', buildMarkupPrompt(opts.instruction));
  fd.append('image', opts.image, opts.imageName);
  fd.append('markup', opts.markup, 'markup.png');
  fd.append('quality', opts.quality);
  fd.append('background', 'opaque');
  fd.append('output_format', 'png');
  fd.append('n', '1');
  if (opts.safetyId) fd.append('safety_identifier', opts.safetyId);

  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${TRYALLAPI_BASE}/v1/images/edits`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.apiKey}` },
      body: fd,
      signal: AbortSignal.timeout(170_000),
    });
  } catch (e: any) {
    throw new ImageEditError(
      e?.name === 'TimeoutError'
        ? 'The image model took too long. Your credits were refunded — please try again.'
        : 'Could not reach the image model. Your credits were refunded.',
      504,
      'network'
    );
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !json?.data?.[0]?.b64_json) {
    const code: string = json?.error?.code || json?.error?.type || `http_${res.status}`;
    const raw: string = json?.error?.message || text.slice(0, 300) || 'Unknown error';
    console.error('[image-edit] upstream failure', res.status, code, raw.slice(0, 300));
    let msg = 'The image model could not complete this edit. Your credits were refunded.';
    let status = 502;
    if (/moderation|safety/i.test(code + raw)) {
      msg = 'This edit was blocked by the model safety system. Your credits were refunded — try a different image or instruction.';
      status = 422;
    } else if (/invalid_image|image_file|unsupported/i.test(code + raw)) {
      msg = 'The model could not read this image. Please upload a PNG, JPEG or WebP file.';
      status = 400;
    } else if (res.status === 401 || res.status === 403 || /model_not_found|group|token/i.test(code + raw)) {
      msg = 'The image edit service is temporarily unavailable (relay rejected the request). Your credits were refunded.';
      status = 503;
    } else if (res.status === 429) {
      msg = 'The image model is busy right now. Your credits were refunded — please retry in a minute.';
      status = 503;
    }
    throw new ImageEditError(msg, status, code);
  }
  return {
    b64: json.data[0].b64_json,
    mime: `image/${json.output_format || 'png'}`,
    size: json.size,
    usage: json.usage,
    ms: Date.now() - t0,
  };
}
