// Cross-language golden tests: the SAME algorithm written in Java and
// Python must produce identical complexity verdicts from the analyzer —
// the core promise of multi-language support. Mirrors the fixture style of
// lib/parser/parity.test.ts (TS engine vs JVM CLI).
import { describe, it, expect } from "vitest";
import { parseJavaTs } from "@/lib/parser/javaTs";
import { parsePython } from "@/lib/parser/python";
import { analyzeComplexity } from "@/lib/complexity/analyze";
import { ProgramIR, MethodIR } from "@/lib/ir";

const GOLDEN: Record<string, { java: string; python: string }> = {
  binarySearch: {
    java: `class Solution {
    int search(int[] arr, int target) {
        int low = 0, high = arr.length - 1;
        while (low <= high) {
            int mid = low + (high - low) / 2;
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) low = mid + 1;
            else high = mid - 1;
        }
        return -1;
    }
}`,
    python: `def search(arr, target):
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`,
  },
  twoSum: {
    java: `class Solution {
    int[] twoSum(int[] nums, int target) {
        java.util.HashMap<Integer, Integer> seen = new java.util.HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int need = target - nums[i];
            if (seen.containsKey(need)) return new int[] { seen.get(need), i };
            seen.put(nums[i], i);
        }
        return new int[] {};
    }
}`,
    python: `def two_sum(nums, target):
    seen = {}  # value -> index
    for i, v in enumerate(nums):
        need = target - v
        if need in seen:
            return [seen[need], i]
        seen[v] = i
    return []
`,
  },
  bubbleSort: {
    java: `class Solution {
    void bubbleSort(int[] a) {
        for (int i = 0; i < a.length - 1; i++) {
            for (int j = 0; j < a.length - i - 1; j++) {
                if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; }
            }
        }
    }
}`,
    python: `def bubble_sort(a):
    for i in range(len(a) - 1):
        for j in range(len(a) - i - 1):
            if a[j] > a[j + 1]:
                a[j], a[j + 1] = a[j + 1], a[j]
`,
  },
  mergeSort: {
    java: `class Solution {
    void mergeSort(int[] a, int l, int r) {
        if (l < r) {
            int m = l + (r - l) / 2;
            mergeSort(a, l, m);
            mergeSort(a, m + 1, r);
            merge(a, l, m, r);
        }
    }
    void merge(int[] a, int l, int m, int r) {
        int[] out = new int[r - l + 1];
        int i = l, j = m + 1, k = 0;
        while (i <= m && j <= r) { out[k++] = a[i++]; }
    }
}`,
    python: `def merge_sort(a, l, r):
    if l < r:
        m = l + (r - l) // 2
        merge_sort(a, l, m)
        merge_sort(a, m + 1, r)
        merge(a, l, m, r)

def merge(a, l, m, r):
    out = []
    i, j = l, m + 1
    while i <= m and j <= r:
        out.append(a[i])
        i += 1
`,
  },
  halvingLoop: {
    java: `class Solution {
    int steps(int n) {
        int steps = 0;
        while (n > 1) { n = n / 2; steps++; }
        return steps;
    }
}`,
    python: `def steps(n):
    count = 0
    while n > 1:
        n = n // 2
        count += 1
    return count
`,
  },
};

function firstMethod(ir: ProgramIR): MethodIR {
  const m = ir.classes.flatMap((c) => c.methods ?? [])[0];
  if (!m) throw new Error("fixture produced no methods");
  return m;
}

describe("cross-language complexity parity (Java vs Python)", () => {
  for (const [name, { java, python }] of Object.entries(GOLDEN)) {
    it(`${name}: identical verdicts in both languages`, async () => {
      const jm = firstMethod(parseJavaTs(java));
      const pm = firstMethod(await parsePython(python));

      const jc = analyzeComplexity(jm);
      const pc = analyzeComplexity(pm);

      expect(pc.time.bigO, `${name} time`).toBe(jc.time.bigO);
      expect(pc.space.bigO, `${name} space`).toBe(jc.space.bigO);
    });
  }

  it("expected verdict sanity (the parity isn't vacuously equal-wrong)", async () => {
    const verdicts = await Promise.all(
      Object.entries(GOLDEN).map(async ([name, { python }]) => {
        const m = firstMethod(await parsePython(python));
        return [name, analyzeComplexity(m).time.bigO] as const;
      }),
    );
    const byName = Object.fromEntries(verdicts);
    expect(byName.binarySearch).toBe("O(log n)");
    expect(byName.twoSum).toBe("O(n)");
    expect(byName.bubbleSort).toBe("O(n²)");
    expect(byName.mergeSort).toBe("O(n log n)");
    expect(byName.halvingLoop).toBe("O(log n)");
  });
});
