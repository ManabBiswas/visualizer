// Curated sample solutions shown to first-time visitors. Each sample is a
// self-contained Java solution that exercises a different part of the
// analyzer (loops, recursion, call graphs, helpers, tagged comments) so the
// user immediately sees what the tool can do, without having to paste code.
//
// The id is a short stable key — it's used in /analyze?sample=two-sum URLs so
// the picker can deep-link to a specific problem from the marketing site or
// a future blog post.

export type Sample = {
  id: string;
  name: string;
  link: string;
  difficulty: "Easy" | "Medium" | "Hard";
  topicTags: string[];
  /** One-line tagline shown on the picker card. */
  blurb: string;
  /** The Java source. Tagged with // q: / // note: / // why: / // complexity: */
  source: string;
};

export const SAMPLES: Sample[] = [
  {
    id: "binary-search",
    name: "Binary Search",
    link: "https://leetcode.com/problems/binary-search/",
    difficulty: "Easy",
    topicTags: ["Array", "Binary Search"],
    blurb: "Classic log n lookup. The // q: comment becomes a flashcard.",
    source: `class Solution {
    // why: each iteration halves the search range
    int search(int[] arr, int target) {
        int low = 0, high = arr.length - 1;
        // q: why use low + (high - low) / 2 instead of (low + high) / 2?
        while (low <= high) {
            int mid = low + (high - low) / 2;
            // note: mid belongs to the current search range
            if (arr[mid] == target) return mid;
            if (arr[mid] < target) low = mid + 1;
            else high = mid - 1;
        }
        return -1;
    }
}
`,
  },
  {
    id: "two-sum",
    name: "Two Sum",
    link: "https://leetcode.com/problems/two-sum/",
    difficulty: "Easy",
    topicTags: ["Array", "Hash Table"],
    blurb: "O(n) with a hash map. Try the Run console with a custom input.",
    source: `class Solution {
    // complexity: time O(n), space O(n) for the map
    int[] twoSum(int[] nums, int target) {
        // why: one pass is enough — for each value, look up its complement
        java.util.HashMap<Integer, Integer> seen = new java.util.HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int complement = target - nums[i];
            // q: why do we check the map before inserting the current value?
            if (seen.containsKey(complement)) {
                return new int[] { seen.get(complement), i };
            }
            seen.put(nums[i], i);
        }
        return new int[] {};
    }
}
`,
  },
  {
    id: "merge-sort",
    name: "Merge Sort",
    link: "https://leetcode.com/problems/sort-an-array/",
    difficulty: "Medium",
    topicTags: ["Array", "Divide and Conquer", "Sorting"],
    blurb: "Recursive with a call graph. The recurrence shows in the blocks tab.",
    source: `class Solution {
    // complexity: time O(n log n), space O(n) for the buffer
    int[] sortArray(int[] nums) {
        if (nums.length <= 1) return nums;
        return mergeSort(nums, 0, nums.length - 1);
    }

    int[] mergeSort(int[] arr, int lo, int hi) {
        // why: base case first so a single element is already "sorted"
        if (lo >= hi) return new int[] { arr[lo] };
        int mid = lo + (hi - lo) / 2;
        int[] left = mergeSort(arr, lo, mid);
        int[] right = mergeSort(arr, mid + 1, hi);
        // note: merge copies into a buffer so we don't overwrite inputs mid-pass
        return merge(left, right);
    }

    int[] merge(int[] a, int[] b) {
        int[] out = new int[a.length + b.length];
        int i = 0, j = 0, k = 0;
        while (i < a.length && j < b.length) {
            if (a[i] <= b[j]) out[k++] = a[i++];
            else out[k++] = b[j++];
        }
        while (i < a.length) out[k++] = a[i++];
        while (j < b.length) out[k++] = b[j++];
        return out;
    }
}
`,
  },
  {
    id: "bfs-graph",
    name: "Number of Islands (BFS)",
    link: "https://leetcode.com/problems/number-of-islands/",
    difficulty: "Medium",
    topicTags: ["Array", "BFS", "Graph", "Matrix"],
    blurb: "BFS over a grid. Tests the call graph and the Run console together.",
    source: `class Solution {
    // complexity: time O(m*n), space O(m*n) worst-case for the queue
    int numIslands(char[][] grid) {
        if (grid.length == 0) return 0;
        int count = 0;
        for (int r = 0; r < grid.length; r++) {
            for (int c = 0; c < grid[0].length; c++) {
                if (grid[r][c] == '1') {
                    count++;
                    bfs(grid, r, c);
                }
            }
        }
        return count;
    }

    void bfs(char[][] grid, int r, int c) {
        // q: why use a queue here instead of recursion?
        java.util.ArrayDeque<int[]> queue = new java.util.ArrayDeque<>();
        queue.offer(new int[] { r, c });
        while (!queue.isEmpty()) {
            int[] cell = queue.poll();
            int cr = cell[0], cc = cell[1];
            if (cr < 0 || cr >= grid.length || cc < 0 || cc >= grid[0].length) continue;
            if (grid[cr][cc] != '1') continue;
            // note: mark visited by flipping to '0' so we don't revisit
            grid[cr][cc] = '0';
            queue.offer(new int[] { cr + 1, cc });
            queue.offer(new int[] { cr - 1, cc });
            queue.offer(new int[] { cr, cc + 1 });
            queue.offer(new int[] { cr, cc - 1 });
        }
    }
}
`,
  },
  {
    id: "valid-parentheses",
    name: "Valid Parentheses",
    link: "https://leetcode.com/problems/valid-parentheses/",
    difficulty: "Easy",
    topicTags: ["Stack", "String"],
    blurb: "Stack-based. Switch statement shows up in the flowchart as a decision.",
    source: `class Solution {
    // complexity: time O(n), space O(n) for the stack
    boolean isValid(String s) {
        // why: stack of opening brackets — every closing must match the top
        java.util.ArrayDeque<Character> stack = new java.util.ArrayDeque<>();
        for (int i = 0; i < s.length(); i++) {
            char ch = s.charAt(i);
            switch (ch) {
                case '(': stack.push(')'); break;
                case '[': stack.push(']'); break;
                case '{': stack.push('}'); break;
                // q: why do we both check empty and peek?
                default:
                    if (stack.isEmpty() || stack.pop() != ch) return false;
            }
        }
        return stack.isEmpty();
    }
}
`,
  },
];

export function findSample(id: string | null | undefined): Sample | null {
  if (!id) return null;
  return SAMPLES.find((s) => s.id === id) ?? null;
}
