"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

export function BackToTop() {
  const [visible, setVisible] = useState(false);
  const scrollerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const findScroller = () => {
      const btn = document.querySelector('[data-back-to-top-btn]');
      return btn?.closest("[data-scroll]") as HTMLElement | null;
    };

    const scroller = findScroller();
    if (!scroller) return;

    scrollerRef.current = scroller;
    const onScroll = () => setVisible(scroller.scrollTop > 300);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <Button
      ref={(el) => {
        if (el) el.setAttribute("data-back-to-top-btn", "");
      }}
      variant="outline"
      size="sm"
      onClick={() => scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-50 transition-opacity duration-200 ${visible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"} hover:cursor-pointer`}
      title="Back to top"
      aria-label="Scroll back to top"
      aria-hidden={!visible}
    >
      <span className="animate-pulse" aria-hidden="true">↑</span>
    </Button>
  );
}
