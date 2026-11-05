'use client';

import { useState } from 'react';

/** Draggable before/after comparison. `before` shows on the left side. */
export function BeforeAfter({
  before,
  after,
  ratio = 1,
  beforeAlt = 'Before edit',
  afterAlt = 'After edit',
  className = '',
}: {
  before: string;
  after: string;
  ratio?: number;
  beforeAlt?: string;
  afterAlt?: string;
  className?: string;
}) {
  const [pos, setPos] = useState(50);
  return (
    <div className={`bg-muted relative w-full overflow-hidden rounded-2xl select-none ${className}`} style={{ aspectRatio: String(ratio) }}>
      <img src={after} alt={afterAlt} className="absolute inset-0 h-full w-full object-contain" draggable={false} loading="lazy" />
      <img
        src={before}
        alt={beforeAlt}
        className="absolute inset-0 h-full w-full object-contain"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        draggable={false}
        loading="lazy"
      />
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" style={{ left: `${pos}%` }}>
        <div className="absolute top-1/2 left-1/2 flex size-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-neutral-900 shadow">
          ⇆
        </div>
      </div>
      <span className="absolute top-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">Before</span>
      <span className="absolute top-2 right-2 rounded-full bg-red-600/90 px-2 py-0.5 text-xs font-medium text-white">After</span>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Drag to compare before and after"
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
