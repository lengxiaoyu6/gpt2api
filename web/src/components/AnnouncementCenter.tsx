import React from "react";
import { createPortal } from "react-dom";
import { Bell, X } from "lucide-react";

import { listPublicAnnouncements, type Announcement } from "@/api/announcement";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TriggerButtonProps {
  onClick?: () => void;
}

interface ProviderProps {
  active: boolean;
  children?: React.ReactNode;
}

interface AnnouncementContextValue {
  openList: () => void;
}

interface PopupState {
  open: boolean;
  items: Announcement[];
  currentID: number | null;
}

const READ_KEY = "gpt2api.announcement.read.ids";

const AnnouncementContext =
  React.createContext<AnnouncementContextValue | null>(null);

function readIDs(): number[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(READ_KEY) || "[]");
    if (Array.isArray(parsed)) {
      return parsed
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0);
    }
  } catch {
    return [];
  }
  return [];
}

function writeIDs(ids: number[]) {
  const uniq = Array.from(
    new Set(ids.filter((id) => Number.isFinite(id) && id > 0)),
  );
  localStorage.setItem(READ_KEY, JSON.stringify(uniq));
}

function buildUnreadPopupState(sourceItems: Announcement[]): PopupState {
  const read = new Set(readIDs());
  const unreadItems = sourceItems.filter((item) => !read.has(item.id));
  return {
    open: unreadItems.length > 0,
    items: unreadItems,
    currentID: unreadItems[0]?.id ?? null,
  };
}

function getPopupPosition(items: Announcement[], currentID: number | null) {
  const currentIndex = items.findIndex((item) => item.id === currentID);
  return {
    currentIndex,
    current: currentIndex >= 0 ? items[currentIndex] : null,
    total: items.length,
  };
}

export function AnnouncementTriggerButton({ onClick }: TriggerButtonProps) {
  const context = React.useContext(AnnouncementContext);

  return (
    <Button
      type="button"
      aria-label="公告"
      variant="secondary"
      size="sm"
      onClick={onClick ?? context?.openList}
      className="h-9 rounded-full border border-border/60 bg-secondary/70 px-2.5 shadow-sm sm:px-3"
    >
      <Bell className="h-4 w-4 shrink-0" />
      <span className="hidden sm:inline">公告</span>
    </Button>
  );
}

export function AnnouncementProvider({ active, children }: ProviderProps) {
  const [items, setItems] = React.useState<Announcement[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(false);
  const [popupState, setPopupState] = React.useState<PopupState>({
    open: false,
    items: [],
    currentID: null,
  });
  const activatedRef = React.useRef(false);

  const openUnreadPopup = React.useCallback((sourceItems: Announcement[]) => {
    setPopupState(buildUnreadPopupState(sourceItems));
  }, []);

  const load = React.useCallback(
    async ({
      force = false,
      autoPopup = false,
    }: {
      force?: boolean;
      autoPopup?: boolean;
    } = {}) => {
      if (loading) return;
      if (!force && loaded) return;

      setLoading(true);
      try {
        const data = await listPublicAnnouncements();
        const nextItems = data.items || [];
        setItems(nextItems);
        setLoaded(true);
        setLoadFailed(false);
        if (active && autoPopup) {
          openUnreadPopup(nextItems);
        }
      } catch {
        setItems([]);
        setLoaded(false);
        setLoadFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [active, loaded, loading, openUnreadPopup],
  );

  React.useEffect(() => {
    if (!active) {
      activatedRef.current = false;
      return;
    }

    if (activatedRef.current) {
      return;
    }

    activatedRef.current = true;
    if (!loaded) {
      void load({ autoPopup: true });
      return;
    }

    openUnreadPopup(items);
  }, [active, items, load, loaded, openUnreadPopup]);

  const openList = React.useCallback(() => {
    setListOpen(true);
    if (!loaded || loadFailed) {
      void load({ force: true });
    }
  }, [load, loadFailed, loaded]);

  const closePopup = React.useCallback(() => {
    setPopupState((previous) => ({ ...previous, open: false }));
  }, []);

  const showPrevious = React.useCallback(() => {
    setPopupState((previous) => {
      const { currentIndex } = getPopupPosition(
        previous.items,
        previous.currentID,
      );
      if (currentIndex <= 0) {
        return previous;
      }
      return {
        ...previous,
        currentID: previous.items[currentIndex - 1]?.id ?? previous.currentID,
      };
    });
  }, []);

  const showNext = React.useCallback(() => {
    setPopupState((previous) => {
      const { currentIndex, total } = getPopupPosition(
        previous.items,
        previous.currentID,
      );
      if (currentIndex < 0 || currentIndex >= total - 1) {
        return previous;
      }
      return {
        ...previous,
        currentID: previous.items[currentIndex + 1]?.id ?? previous.currentID,
      };
    });
  }, []);

  const acknowledge = React.useCallback(() => {
    setPopupState((previous) => {
      const { currentIndex, current } = getPopupPosition(
        previous.items,
        previous.currentID,
      );
      if (!current || currentIndex < 0) {
        return previous;
      }

      writeIDs([...readIDs(), current.id]);
      const nextItems = previous.items.filter((item) => item.id !== current.id);
      if (nextItems.length === 0) {
        return {
          open: false,
          items: [],
          currentID: null,
        };
      }

      const nextIndex = Math.min(currentIndex, nextItems.length - 1);
      return {
        open: true,
        items: nextItems,
        currentID: nextItems[nextIndex]?.id ?? null,
      };
    });
  }, []);

  const { currentIndex, current, total } = getPopupPosition(
    popupState.items,
    popupState.currentID,
  );
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < total - 1;

  return (
    <AnnouncementContext.Provider value={{ openList }}>
      {children}

      {popupState.open && current && (
        <AnnouncementDialog title={current.title} onClose={closePopup}>
          <div className="max-h-[48vh] overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-muted/45 px-4 py-3 text-left text-sm leading-7 text-muted-foreground shadow-inner">
            {current.content}
          </div>
          <div className="mt-4 text-xs font-semibold tracking-[0.12em] text-muted-foreground">
            第 {currentIndex + 1} 条，共 {total} 条
          </div>
          <div className="mt-5 space-y-2">
            <Button
              variant="outline"
              className="h-11 w-full rounded-2xl"
              onClick={openList}
            >
              公告列表
            </Button>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant="outline"
                className="h-11 rounded-2xl"
                onClick={showPrevious}
                disabled={!hasPrevious}
              >
                上一条
              </Button>
              <Button
                variant="outline"
                className="h-11 rounded-2xl"
                onClick={showNext}
                disabled={!hasNext}
              >
                下一条
              </Button>
              <Button className="h-11 rounded-2xl" onClick={acknowledge}>
                知道了
              </Button>
            </div>
          </div>
        </AnnouncementDialog>
      )}

      {listOpen && (
        <AnnouncementDialog title="公告列表" onClose={() => setListOpen(false)}>
          <div
            className={cn(
              "max-h-[62vh] space-y-3 overflow-y-auto text-left",
              loading && "opacity-60",
            )}
          >
            {items.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                暂无公告
              </div>
            )}
            {items.map((item) => (
              <article
                key={item.id}
                className="rounded-2xl border border-border/70 bg-secondary/30 p-4"
              >
                <h3 className="text-sm font-bold leading-6">{item.title}</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-muted-foreground">
                  {item.content}
                </p>
              </article>
            ))}
          </div>
        </AnnouncementDialog>
      )}
    </AnnouncementContext.Provider>
  );
}

export default function AnnouncementCenter({ active }: { active: boolean }) {
  return (
    <AnnouncementProvider active={active}>
      <AnnouncementTriggerButton />
    </AnnouncementProvider>
  );
}

function AnnouncementDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const titleId = React.useId();

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[70] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/45 px-5 py-8 backdrop-blur-md"
    >
      <section className="relative w-full max-w-[min(92vw,42rem)] overflow-hidden rounded-[2rem] border border-white/70 bg-background/95 p-5 text-center text-foreground shadow-[0_24px_80px_rgba(15,23,42,0.28)] ring-1 ring-black/5 backdrop-blur-xl dark:border-white/10 dark:bg-card/95 dark:ring-white/10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/10 via-primary/5 to-transparent" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="关闭"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-background/70 text-muted-foreground shadow-sm backdrop-blur hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </Button>
        <div className="relative mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary ring-8 ring-primary/5">
          <Bell className="h-5 w-5" />
        </div>
        <div className="relative mb-2 text-xs font-semibold tracking-[0.24em] text-muted-foreground">
          重要公告
        </div>
        <h2
          id={titleId}
          className="relative mb-4 text-xl font-black tracking-tight"
        >
          {title}
        </h2>
        {children}
      </section>
    </div>,
    document.body,
  );
}
