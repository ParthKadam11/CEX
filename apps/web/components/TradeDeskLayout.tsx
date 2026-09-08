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

function useIsLargeScreen() {
  const [large, setLarge] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setLarge(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return large;
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

export function TradeDeskLayout({
  id,
  chart,
  book,
  ticket,
  bottom,
  secondary,
  className,
}: TradeDeskLayoutProps) {
  const isLarge = useIsLargeScreen();
  const main = usePersistedLayout(`cex-desk-${id}-main`);
  const columns = usePersistedLayout(
    `cex-desk-${id}-cols-${isLarge ? "lg" : "sm"}`,
  );
  const footer = usePersistedLayout(`cex-desk-${id}-footer`);

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
          orientation={isLarge ? "horizontal" : "vertical"}
          className="h-full min-h-0"
          defaultLayout={columns.defaultLayout}
          onLayoutChanged={columns.onLayoutChanged}
          resizeTargetMinimumSize={{ coarse: 24, fine: 10 }}
        >
          <Panel
            id="chart"
            defaultSize={isLarge ? "52%" : "40%"}
            minSize={isLarge ? "22%" : "18%"}
            className="min-h-0 min-w-0"
          >
            <PanelFrame>{chart}</PanelFrame>
          </Panel>
          <DeskSeparator />
          <Panel
            id="book"
            defaultSize={isLarge ? "24%" : "30%"}
            minSize={isLarge ? "14%" : "16%"}
            className="min-h-0 min-w-0"
          >
            <PanelFrame>{book}</PanelFrame>
          </Panel>
          <DeskSeparator />
          <Panel
            id="ticket"
            defaultSize={isLarge ? "24%" : "30%"}
            minSize={isLarge ? "16%" : "16%"}
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
