'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Brush,
  Circle,
  Download,
  Eraser,
  Lasso,
  Loader2,
  RotateCcw,
  Undo2,
  Upload,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';

import { useSession } from '@/core/auth/client';
import { cn } from '@/lib/utils';
import { CREDITS_PER_EDIT, listPricingProducts, packEditCount } from '@/config/pricing';

import { BeforeAfter } from './before-after';
import { clearDraft, loadDraft, saveDraft } from './draft-store';

type Tool = 'ellipse' | 'brush' | 'lasso';
type Pt = { x: number; y: number };
type Shape =
  | { kind: 'ellipse'; a: Pt; b: Pt; w: number }
  | { kind: 'brush'; pts: Pt[]; w: number }
  | { kind: 'lasso'; pts: Pt[]; w: number };

const MAX_SIDE = 2048;
const MARK = '#ff1a1a';

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.strokeStyle = MARK;
  ctx.lineWidth = s.w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (s.kind === 'ellipse') {
    const cx = (s.a.x + s.b.x) / 2;
    const cy = (s.a.y + s.b.y) / 2;
    const rx = Math.max(2, Math.abs(s.b.x - s.a.x) / 2);
    const ry = Math.max(2, Math.abs(s.b.y - s.a.y) / 2);
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else {
    if (!s.pts.length) return;
    ctx.moveTo(s.pts[0].x, s.pts[0].y);
    for (const p of s.pts.slice(1)) ctx.lineTo(p.x, p.y);
    if (s.kind === 'lasso' && s.pts.length > 2) ctx.closePath();
    if (s.pts.length === 1) ctx.lineTo(s.pts[0].x + 0.1, s.pts[0].y);
  }
  ctx.stroke();
}

async function normalizeImage(file: File): Promise<{ blob: Blob; name: string; w: number; h: number }> {
  const lower = file.name.toLowerCase();
  if (file.type.includes('svg') || lower.endsWith('.svg') || lower.endsWith('.svgz')) {
    throw new Error('SVG files cannot be edited — export it to PNG first, then upload the PNG.');
  }
  if (file.type === 'image/gif' || lower.endsWith('.gif')) {
    throw new Error('GIF is not supported for edits. Please upload a PNG, JPEG or WebP.');
  }
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
    throw new Error('Please upload a PNG, JPEG or WebP image.');
  }
  if (file.size > 25 * 1024 * 1024) throw new Error('Image is too large (max 25 MB).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not read this image.'));
      i.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    c.getContext('2d')!.drawImage(img, 0, 0, w, h);
    const png = file.type === 'image/png';
    const blob = await new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error('Encode failed'))), png ? 'image/png' : 'image/jpeg', 0.95)
    );
    return { blob, name: png ? 'source.png' : 'source.jpg', w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function MarkupEditor({ onNeedCredits }: { onNeedCredits?: () => void }) {
  const { data: session } = useSession();
  const [src, setSrc] = useState<{ blob: Blob; name: string; url: string; w: number; h: number } | null>(null);
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [draft, setDraft] = useState<Shape | null>(null);
  const [tool, setTool] = useState<Tool>('ellipse');
  const [instruction, setInstruction] = useState('');
  const [model, setModel] = useState('gpt-image-2.6-flare');
  const [quality, setQuality] = useState('medium');
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ url: string; before: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [showBuy, setShowBuy] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoredMarkup = useRef<Blob | null>(null);
  const [restoredLayer, setRestoredLayer] = useState<ImageBitmap | null>(null);

  const strokeW = src ? Math.max(4, Math.round(Math.max(src.w, src.h) * 0.008)) : 8;

  const refreshBalance = useCallback(async () => {
    try {
      const r = await fetch('/api/credits', { credentials: 'include' });
      const j = await r.json();
      if (j?.code === 0) setBalance(Number(j.data?.balance) || 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (session?.user) refreshBalance();
  }, [session?.user?.id, refreshBalance]);

  const setSource = useCallback((blob: Blob, name: string, w: number, h: number) => {
    setSrc((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { blob, name, url: URL.createObjectURL(blob), w, h };
    });
    setShapes([]);
    setResult(null);
    setError(null);
  }, []);

  // Restore an in-progress draft (e.g. after Stripe checkout) + sync payment.
  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const paid = params.get('paid') === '1';
      const sid = params.get('session_id') || '';
      const d = await loadDraft();
      if (d?.image) {
        const bmp = await createImageBitmap(d.image);
        setSource(d.image, d.imageName, bmp.width, bmp.height);
        setInstruction(d.instruction || '');
        setModel(d.model || 'gpt-image-2.6-flare');
        setQuality(d.quality || 'medium');
        restoredMarkup.current = d.markup;
      }
      if (paid && sid.startsWith('cs_')) {
        for (let i = 0; i < 6; i++) {
          try {
            const r = await fetch('/api/guest/sync-payment', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ session_id: sid }),
            });
            const j = await r.json();
            if (j?.code === 0 && j.data?.paid) {
              setBalance(Number(j.data.balance) || 0);
              toast.success(`Payment received — ${j.data.creditsGranted ?? ''} credits added. Click “Apply edit”.`);
              break;
            }
          } catch {
            /* retry */
          }
          await new Promise((r) => setTimeout(r, 2000));
        }
        const url = new URL(window.location.href);
        url.searchParams.delete('paid');
        url.searchParams.delete('session_id');
        window.history.replaceState(null, '', url.pathname + url.search + '#editor');
        document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth' });
      }
    })();
  }, [setSource]);

  // Paint a restored markup layer once the canvas is ready.
  useEffect(() => {
    const blob = restoredMarkup.current;
    if (!blob || !src || !canvasRef.current) return;
    restoredMarkup.current = null;
    createImageBitmap(blob).then((bmp) => setRestoredLayer(bmp)).catch(() => {});
  }, [src]);
  // Redraw overlay
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !src) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (restoredLayer) ctx.drawImage(restoredLayer, 0, 0, c.width, c.height);
    for (const s of shapes) drawShape(ctx, s);
    if (draft) drawShape(ctx, draft);
  }, [shapes, draft, src, restoredLayer]);

  const toPt = (e: React.PointerEvent): Pt => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!src || busy) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    const p = toPt(e);
    setDraft(tool === 'ellipse' ? { kind: 'ellipse', a: p, b: p, w: strokeW } : { kind: tool, pts: [p], w: strokeW });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!draft) return;
    const p = toPt(e);
    setDraft((d) => {
      if (!d) return d;
      if (d.kind === 'ellipse') return { ...d, b: p };
      return { ...d, pts: [...d.pts, p] };
    });
  };
  const onUp = () => {
    if (!draft) return;
    const ok =
      draft.kind === 'ellipse'
        ? Math.abs(draft.b.x - draft.a.x) > 6 && Math.abs(draft.b.y - draft.a.y) > 6
        : draft.pts.length > 1;
    if (ok) setShapes((s) => [...s, draft]);
    setDraft(null);
  };

  const hasMarks = shapes.length > 0 || !!restoredLayer;

  async function onFile(file: File | undefined | null) {
    if (!file) return;
    try {
      const n = await normalizeImage(file);
      setSource(n.blob, n.name, n.w, n.h);
      setRestoredLayer(null);
    } catch (e: any) {
      toast.error(e?.message || 'Could not load image');
    }
  }

  async function buildMarkup(): Promise<Blob> {
    const c = document.createElement('canvas');
    c.width = src!.w;
    c.height = src!.h;
    const ctx = c.getContext('2d')!;
    if (restoredLayer) ctx.drawImage(restoredLayer, 0, 0, c.width, c.height);
    for (const s of shapes) drawShape(ctx, s);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('markup'))), 'image/png'));
  }

  async function persistDraft() {
    if (!src) return;
    await saveDraft({
      image: src.blob,
      imageName: src.name,
      markup: hasMarks ? await buildMarkup() : null,
      instruction,
      model,
      quality,
      savedAt: Date.now(),
    });
  }

  async function buy(productId: string) {
    setBuying(productId);
    try {
      await persistDraft();
      const r = await fetch('/api/guest/checkout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, kind: 'pack' }),
      });
      const j = await r.json();
      if (j?.code === 0 && j.data?.checkout_url) {
        window.location.href = j.data.checkout_url;
        return;
      }
      toast.error(j?.message || 'Checkout is unavailable right now.');
    } catch {
      toast.error('Checkout failed — please try again.');
    } finally {
      setBuying(null);
    }
  }

  async function apply() {
    if (!src) return toast.error('Upload an image first.');
    if (!hasMarks) return toast.error('Circle or paint over the area you want to change.');
    if (instruction.trim().length < 3) return toast.error('Describe the change you want inside the marked area.');
    if (!session?.user || (balance !== null && balance < CREDITS_PER_EDIT)) {
      await persistDraft();
      setShowBuy(true);
      onNeedCredits?.();
      return;
    }
    setBusy(true);
    setError(null);
    setElapsed(0);
    const t0 = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    try {
      const fd = new FormData();
      fd.append('image', src.blob, src.name);
      fd.append('markup', await buildMarkup(), 'markup.png');
      fd.append('instruction', instruction.trim());
      fd.append('model', model);
      fd.append('quality', quality);
      const r = await fetch('/api/edit', { method: 'POST', body: fd, credentials: 'include' });
      const j = await r.json().catch(() => null);
      if (r.status === 401 || r.status === 402) {
        await persistDraft();
        setShowBuy(true);
        return;
      }
      if (!j || j.code !== 0) {
        setError(j?.message || `Edit failed (HTTP ${r.status}). Credits were refunded.`);
        return;
      }
      setResult({ url: j.data.image, before: src.url });
      if (typeof j.data.balance === 'number') setBalance(j.data.balance);
      await clearDraft();
      setTimeout(() => document.getElementById('result')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    } catch {
      setError('Network error — if credits were deducted they will be refunded automatically.');
    } finally {
      clearInterval(timer);
      setBusy(false);
    }
  }

  async function continueFromResult() {
    if (!result) return;
    const blob = await (await fetch(result.url)).blob();
    const file = new File([blob], 'edited.png', { type: 'image/png' });
    await onFile(file);
  }

  const tools: { id: Tool; label: string; icon: any }[] = [
    { id: 'ellipse', label: 'Circle', icon: Circle },
    { id: 'brush', label: 'Brush', icon: Brush },
    { id: 'lasso', label: 'Lasso', icon: Lasso },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0">
        {!src ? (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              onFile(e.dataTransfer.files?.[0]);
            }}
            className={cn(
              'border-border bg-muted/30 flex aspect-[4/3] w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition',
              drag && 'border-red-500 bg-red-500/5'
            )}
          >
            <Upload className="text-muted-foreground size-10" />
            <span className="text-lg font-semibold">Drop an image or click to upload</span>
            <span className="text-muted-foreground text-sm">PNG, JPEG or WebP · up to 25 MB · SVG and GIF are not supported</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </label>
        ) : (
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {tools.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTool(t.id)}
                  className={cn(
                    'inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition',
                    tool === t.id ? 'border-red-500 bg-red-500 text-white' : 'border-border hover:bg-muted'
                  )}
                >
                  <t.icon className="size-4" /> {t.label}
                </button>
              ))}
              <span className="bg-border mx-1 h-6 w-px" />
              <button
                type="button"
                onClick={() => (shapes.length ? setShapes((s) => s.slice(0, -1)) : setRestoredLayer(null))}
                disabled={!hasMarks}
                className="border-border hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm disabled:opacity-40"
              >
                <Undo2 className="size-4" /> Undo
              </button>
              <button
                type="button"
                onClick={() => {
                  setShapes([]);
                  setRestoredLayer(null);
                }}
                disabled={!hasMarks}
                className="border-border hover:bg-muted inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm disabled:opacity-40"
              >
                <Eraser className="size-4" /> Clear marks
              </button>
              <label className="border-border hover:bg-muted ml-auto inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-sm">
                <RotateCcw className="size-4" /> New image
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            </div>
            <div className="bg-muted/40 relative mx-auto w-full overflow-hidden rounded-2xl" style={{ aspectRatio: `${src.w} / ${src.h}`, maxHeight: '72vh' }}>
              <img src={src.url} alt="Your uploaded image" className="absolute inset-0 h-full w-full object-contain select-none" draggable={false} />
              <canvas
                ref={canvasRef}
                width={src.w}
                height={src.h}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
              />
              {busy && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/45 text-white">
                  <Loader2 className="size-8 animate-spin" />
                  <span className="text-sm font-medium">Editing the marked area… {elapsed}s</span>
                  <span className="text-xs opacity-80">Usually 15–40 seconds</span>
                </div>
              )}
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {src.w}×{src.h}px · Draw red marks around exactly what should change. The marks are sent as a separate transparent layer and removed from the result.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="mie-instruction" className="mb-1.5 block text-sm font-semibold">
            What should change inside the red marks?
          </label>
          <textarea
            id="mie-instruction"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            rows={5}
            maxLength={1500}
            placeholder={'e.g. Change the word "BREW" to "ROAST" in the same font and color.\nor: Make the bottle matte forest green.'}
            className="border-border bg-background w-full rounded-xl border p-3 text-sm outline-none focus:border-red-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Model</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="border-border bg-background h-10 w-full rounded-lg border px-2">
              <option value="gpt-image-2.6-flare">GPT Image 2.6 Flare</option>
              <option value="gpt-image-2.6-sunburst">GPT Image 2.6 Sunburst</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Quality</span>
            <select value={quality} onChange={(e) => setQuality(e.target.value)} className="border-border bg-background h-10 w-full rounded-lg border px-2">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={busy}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-red-600 px-6 text-base font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Wand2 className="size-5" />}
          Apply edit · {CREDITS_PER_EDIT} credits
        </button>
        <p className="text-muted-foreground text-xs">
          {session?.user
            ? `Balance: ${balance ?? '…'} credits. Failed edits are refunded automatically.`
            : 'Pay per edit with a one-time credit pack — no subscription. Failed edits are refunded automatically.'}
        </p>
        {error && <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">{error}</div>}

        {showBuy && (
          <div className="border-border rounded-2xl border p-4">
            <p className="mb-1 font-semibold">Get credits to run this edit</p>
            <p className="text-muted-foreground mb-3 text-xs">
              Your image, marks and instruction are saved in this browser and restored after checkout.
            </p>
            <div className="grid gap-2">
              {listPricingProducts().map((p) => (
                <button
                  key={p.productId}
                  type="button"
                  disabled={!!buying}
                  onClick={() => buy(p.productId)}
                  className="border-border hover:border-red-500 flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition disabled:opacity-50"
                >
                  <span>
                    <b>{packEditCount(p.productId)} edits</b>
                    <span className="text-muted-foreground"> · {p.credits} credits</span>
                  </span>
                  <span className="font-semibold">
                    {buying === p.productId ? <Loader2 className="size-4 animate-spin" /> : `$${(p.priceInCents / 100).toFixed(2)}`}
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setShowBuy(false)} className="text-muted-foreground mt-2 text-xs underline">
              Not now
            </button>
          </div>
        )}
      </div>

      {result && (
        <div id="result" className="lg:col-span-2">
          <h3 className="mb-3 text-lg font-semibold">Before / after</h3>
          <BeforeAfter before={result.before} after={result.url} ratio={src ? src.w / src.h : 1} />
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={result.url}
              download="markup-edit.png"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-neutral-900 px-4 text-sm font-semibold text-white dark:bg-white dark:text-neutral-900"
            >
              <Download className="size-4" /> Download PNG
            </a>
            <button type="button" onClick={continueFromResult} className="border-border hover:bg-muted inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm">
              Keep editing this result
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
