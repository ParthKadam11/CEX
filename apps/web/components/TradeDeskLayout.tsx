"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  type LayoutStorage,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";

const noopStorage: LayoutStorage = {
  getItem: () => null,
  setItem: () => {},
};

type TradeDeskLayoutProps = {
  /** Unique key for persisting panel sizes (e.g. "spot", "perp"). */
  id: string;
  chart: ReactNode;
  book: ReactNode;
  ticket: ReactNode;
  /** Bottom strip — usually open/recent orders. */
  bottom: ReactNode;
  /** Optional mid strip above bottom (e.g. perp position). */
  secondary?: ReactNode;
  className?: string;
};

function useViewportMode() {
  const [mode, setMode] = useState<"unknown" | "mobile" | "desktop">("unknown");

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setMode(mq.matches ? "desktop" : "mobile");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return mode;
}

function DeskSeparator({ className }: { className?: string }) {
  return (
    <Separator
      className={cn(
        "z-20 shrink-0 self-stretch bg-zinc-300 outline-none transition-colors dark:bg-zinc-600",
        "hover:bg-zinc-500 focus-visible:bg-zinc-500 dark:hover:bg-zinc-400",
        "aria-[orientation=vertical]:w-px aria-[orientation=vertical]:cursor-col-resize",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:cursor-row-resize",
        className,
      )}
    />
  );
}

function PanelFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white dark:bg-zinc-950",
        className,
      )}
    >
      {children}
    </div>
  );
}

function usePersistedLayout(id: string) {
  const [storage, setStorage] = useState<LayoutStorage>(noopStorage);

  useEffect(() => {
    setStorage(localStorage);
  }, []);

  return useDefaultLayout({
    id,
    storage,
    onlySaveAfterUserInteractions: true,
  });
}

/** Mobile: scrollable stack. Desktop (lg+): resizable panels. */
export function TradeDeskLayout({
  id,
  chart,
  book,
  ticket,
  bottom,
  secondary,
  className,
}: TradeDeskLayoutProps) {
  const mode = useViewportMode();
  const main = usePersistedLayout(`cex-desk-${id}-main`);
  const columns = usePersistedLayout(`cex-desk-${id}-cols-lg`);
  const footer = usePersistedLayout(`cex-desk-${id}-footer`);

  if (mode === "unknown") {
    return (
      <div
        className={cn("min-h-[280px] w-full bg-zinc-100 dark:bg-zinc-900", className)}
        aria-hidden
      />
    );
  }

  if (mode === "mobile") {
    return (
      <div
        className={cn(
          "flex w-full flex-col gap-px bg-zinc-200 dark:bg-zinc-800",
          className,
        )}
      >
        <section className="flex min-h-[260px] flex-col bg-white dark:bg-zinc-950 sm:min-h-[300px]">
          {chart}
        </section>
        <section className="flex h-[min(380px,50dvh)] flex-col overflow-hidden bg-white dark:bg-zinc-950">
          {book}
        </section>
        <section className="bg-white dark:bg-zinc-950">{ticket}</section>
        {secondary ? (
          <section className="bg-white dark:bg-zinc-950">{secondary}</section>
        ) : null}
        <section className="min-h-[180px] bg-white pb-6 dark:bg-zinc-950">
          {bottom}
        </section>
      </div>
    );
  }

  return (
    <Group
      id={`${id}-main`}
      orientation="vertical"
      className={cn("h-full min-h-0 w-full", className)}
      defaultLayout={main.defaultLayout}
      onLayoutChanged={main.onLayoutChanged}
      resizeTargetMinimumSize={{ coarse: 24, fine: 10 }}
    >
      <Panel id="workspace" defaultSize="72%" minSize="35%" className="min-h-0">
        <Group
          id={`${id}-cols`}
          orientation="horizontal"
          className="h-full min-h-0"
          defaultLayout={columns.defaultLayout}
          onLayoutChanged={columns.onLayoutChanged}
          resizeTargetMinimumSize={{ coarse: 24, fine: 10 }}
        >
          <Panel
            id="chart"
            defaultSize="52%"
            minSize="22%"
            className="min-h-0 min-w-0"
          >
            <PanelFrame>{chart}</PanelFrame>
          </Panel>
          <DeskSeparator />
          <Panel
            id="book"
            defaultSize="24%"
            minSize="14%"
            className="min-h-0 min-w-0"
          >
            <PanelFrame>{book}</PanelFrame>
          </Panel>
          <DeskSeparator />
          <Panel
            id="ticket"
            defaultSize="24%"
            minSize="16%"
            className="min-h-0 min-w-0"
          >
            <PanelFrame className="overflow-y-auto">{ticket}</PanelFrame>
          </Panel>
        </Group>
      </Panel>
      <DeskSeparator />
      <Panel id="footer" defaultSize="28%" minSize="14%" className="min-h-0">
        {secondary ? (
          <Group
            id={`${id}-footer`}
            orientation="vertical"
            className="h-full min-h-0"
            defaultLayout={footer.defaultLayout}
            onLayoutChanged={footer.onLayoutChanged}
            resizeTargetMinimumSize={{ coarse: 24, fine: 10 }}
          >
            <Panel
              id="secondary"
              defaultSize="28%"
              minSize="12%"
              className="min-h-0 min-w-0"
            >
              <PanelFrame className="overflow-y-auto">{secondary}</PanelFrame>
            </Panel>
            <DeskSeparator />
            <Panel
              id="bottom"
              defaultSize="72%"
              minSize="16%"
              className="min-h-0 min-w-0"
            >
              <PanelFrame className="overflow-hidden">{bottom}</PanelFrame>
            </Panel>
          </Group>
        ) : (
          <PanelFrame className="overflow-hidden">{bottom}</PanelFrame>
        )}
      </Panel>
    </Group>
  );
}
