// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  setArrowAnim,
  getArrowAnim,
  toggleArrowAnim,
  subscribeArrowAnim,
  ARROW_ANIM_STORAGE_KEY,
} from "@/lib/animation";

// Node 25 ships an experimental global localStorage that shadows happy-dom's
// and lacks removeItem/clear — stub a plain in-memory implementation so the
// persistence contract is tested against real storage semantics.

function stubLocalStorage(): void {
  const store = new Map<string, string>();
  vi.stubGlobal(
    "localStorage",
    {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => void store.clear(),
    },
  );
}

describe("arrow-anim preference store", () => {
  beforeEach(() => {
    stubLocalStorage();
    localStorage.removeItem(ARROW_ANIM_STORAGE_KEY);
    setArrowAnim("on");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to on", () => {
    expect(getArrowAnim()).toBe("on");
  });

  it("persists off across the API", () => {
    setArrowAnim("off");
    expect(getArrowAnim()).toBe("off");
    expect(localStorage.getItem(ARROW_ANIM_STORAGE_KEY)).toBe("off");
  });

  it("toggle flips between on and off", () => {
    expect(getArrowAnim()).toBe("on");
    toggleArrowAnim();
    expect(getArrowAnim()).toBe("off");
    toggleArrowAnim();
    expect(getArrowAnim()).toBe("on");
  });

  it("notifies subscribers on change", () => {
    const calls: string[] = [];
    const unsub = subscribeArrowAnim(() => calls.push(getArrowAnim()));
    setArrowAnim("off");
    setArrowAnim("on");
    unsub();
    setArrowAnim("off");
    expect(calls).toEqual(["off", "on"]); // post-unsub update not delivered
  });
});
