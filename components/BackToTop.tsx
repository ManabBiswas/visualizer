"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

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
    <Button
      ref={btnRef}
      variant="outline"
      size="sm"
      onClick={() => scrollerRef.current?.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-50 ${visible ? "block" : "hidden"}`}
      title="Back to top"
      aria-label="Scroll back to top"
      aria-hidden={!visible}
    >
      <span className="animate-pulse" aria-hidden="true">↑</span>
      <span className="hidden sm:inline">Back to top</span>
    </Button>
  );
}
