"use client";

import { useEffect, useRef, useState } from "react";

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const scrollerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const scroller = btnRef.current?.closest("[data-scroll]") as HTMLElement | null;
    if (!scroller) return;
    scrollerRef.current = scroller;
    const onScroll = () => setVisible(scroller.scrollTop > 300);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      ref={btnRef}
      onClick={() => scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      className={
        visible
          ? "fixed bottom-6 right-6 z-50 flex items-center gap-1.5 rounded-full border border-panel-border bg-surface-container-high px-3.5 py-2 text-body-sm font-medium text-on-surface shadow-lg cursor-pointer hover:bg-surface-container-highest hover:text-primary"
          : "hidden"
      }
      title="Back to top"
      aria-label="Scroll back to top"
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <span className="animate-pulse" aria-hidden="true">↑</span>
      
    </button>
  );
}
