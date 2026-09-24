"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type View = { scale: number; x: number; y: number };

const MIN_FACTOR = 0.6;
const MAX_FACTOR = 5;

export function DiagramFocus({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);

  return (
    <figure className="mt-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative block w-full cursor-zoom-in overflow-x-auto rounded-md border border-zinc-200 bg-[#121212] text-left dark:border-zinc-800"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- raw SVG; Next/Image would cap size and break pan/zoom */}
        <img src={src} alt={alt} className="h-auto w-full min-w-[720px]" />
        <span className="pointer-events-none absolute right-3 bottom-3 rounded-full border border-white/15 bg-black/70 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] text-zinc-200 uppercase opacity-90 transition-opacity group-hover:opacity-100">
          Focus
        </span>
      </button>
      {open ? (
        <FocusStage src={src} alt={alt} onClose={() => setOpen(false)} />
      ) : null}
    </figure>
  );
}

function FocusStage({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewRef = useRef<View>({ scale: 1, x: 0, y: 0 });
  const fitRef = useRef(1);
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [fitScale, setFitScale] = useState(1);
  const [ready, setReady] = useState(false);

  const apply = useCallback((next: View) => {
    viewRef.current = next;
    setView(next);
  }, []);

  const fit = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img || img.naturalWidth === 0) return;
    const pad = 72;
    const scale = Math.min(
      (stage.clientWidth - pad) / img.naturalWidth,
      (stage.clientHeight - pad) / img.naturalHeight,
    );
    const safe = Number.isFinite(scale) && scale > 0 ? scale : 1;
    fitRef.current = safe;
    setFitScale(safe);
    apply({
      scale: safe,
      x: (stage.clientWidth - img.naturalWidth * safe) / 2,
      y: (stage.clientHeight - img.naturalHeight * safe) / 2,
    });
    setReady(true);
  }, [apply]);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const stage = stageRef.current;
      if (!stage) return;
      const current = viewRef.current;
      const fitScale = fitRef.current;
      const nextScale = clamp(
        current.scale * factor,
        fitScale * MIN_FACTOR,
        fitScale * MAX_FACTOR,
      );
      if (nextScale === current.scale) return;
      const rect = stage.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const k = nextScale / current.scale;
      apply({
        scale: nextScale,
        x: px - (px - current.x) * k,
        y: py - (py - current.y) * k,
      });
    },
    [apply],
  );

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "+" || event.key === "=") {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
      }
      if (event.key === "-" || event.key === "_") {
        const stage = stageRef.current;
        if (!stage) return;
        const rect = stage.getBoundingClientRect();
        zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2);
      }
      if (event.key === "0") fit();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [fit, onClose, zoomAt]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.12 : 1 / 1.12;
      zoomAt(event.clientX, event.clientY, factor);
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const percent = Math.round((view.scale / fitScale) * 100);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      className="fixed inset-0 z-50 bg-[#0c0c0c] text-zinc-200"
    >
      <div
        ref={stageRef}
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            originX: viewRef.current.x,
            originY: viewRef.current.y,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          apply({
            scale: viewRef.current.scale,
            x: drag.originX + (event.clientX - drag.x),
            y: drag.originY + (event.clientY - drag.y),
          });
        }}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId === event.pointerId) {
            dragRef.current = null;
          }
        }}
        onDoubleClick={(event) => {
          const fitScale = fitRef.current;
          const nearFit = Math.abs(viewRef.current.scale - fitScale) < fitScale * 0.08;
          if (!nearFit) {
            fit();
            return;
          }
          zoomAt(event.clientX, event.clientY, 2.2);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- raw SVG; Next/Image would cap size and break pan/zoom */}
        <img
          ref={imgRef}
          src={src}
          alt={alt}
          draggable={false}
          onLoad={fit}
          className="absolute top-0 left-0 max-w-none select-none"
          style={{
            transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            transformOrigin: "0 0",
            opacity: ready ? 1 : 0,
          }}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
        <p className="max-w-md text-xs leading-relaxed text-zinc-400">{alt}</p>
        <button
          type="button"
          onClick={onClose}
          className="pointer-events-auto rounded-full border border-white/15 bg-black/60 px-3 py-1.5 text-sm text-zinc-100 hover:bg-black"
        >
          Close
        </button>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-black/70 px-1.5 py-1.5 shadow-lg backdrop-blur-sm">
          <StageButton
            label="Zoom out"
            onClick={() => {
              const stage = stageRef.current;
              if (!stage) return;
              const rect = stage.getBoundingClientRect();
              zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1 / 1.2);
            }}
          >
            −
          </StageButton>
          <button
            type="button"
            onClick={fit}
            title="Fit the diagram"
            className="min-w-14 px-2 font-mono text-xs tabular-nums text-zinc-300 hover:text-white"
          >
            {ready ? `${percent}%` : "Fit"}
          </button>
          <StageButton
            label="Zoom in"
            onClick={() => {
              const stage = stageRef.current;
              if (!stage) return;
              const rect = stage.getBoundingClientRect();
              zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, 1.2);
            }}
          >
            +
          </StageButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function StageButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex size-8 items-center justify-center rounded-full text-lg leading-none text-zinc-100 hover:bg-white/10"
    >
      {children}
    </button>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
