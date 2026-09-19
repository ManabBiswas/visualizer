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
  /** Source language — drives the parser engine and editor highlighting. */
  language?: "java" | "python" | "cpp";
  /** One-line tagline shown on the picker card. */
  blurb: string;
  /** The source. Java: // q:/note:/why:/complexity: tags. Python: # tags. C++: // tags. */
  source: string;
};

export const SAMPLES: Sample[] = [
  {
    id: "binary-search",
    name: "Binary Search",
    link: "https://leetcode.com/problems/binary-search/",
    difficulty: "Easy",
    topicTags: ["Array", "Binary Search"],
    language: "java",
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
    language: "java",
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
    language: "java",
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
    language: "java",
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
    language: "java",
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
  {
    id: "py-binary-search",
    name: "Binary Search (Python)",
    link: "https://leetcode.com/problems/binary-search/",
    difficulty: "Easy",
    topicTags: ["Array", "Binary Search"],
    language: "python",
    blurb: "Same classic in Python — # tags become flashcards just like // tags.",
    source: `def search(arr, target):
    # why: each iteration halves the search range
    lo, hi = 0, len(arr) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        # note: mid belongs to the current search range
        if arr[mid] == target:
            return mid
        if arr[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
`,
  },
{
    id: "py-two-sum",
    name: "Two Sum (Python)",
    link: "https://leetcode.com/problems/two-sum/",
    difficulty: "Easy",
    topicTags: ["Array", "Hash Table"],
    language: "python",
    blurb: "Python dict one-pass. Try the diff tab against the Java version.",
    source: `def two_sum(nums, target):
    # complexity: time O(n), space O(n) for the dict
    seen = {}  # note: value -> index map
    for i, v in enumerate(nums):
        need = target - v
        # q: why do we check the dict before inserting the current value?
        if need in seen:
            return [seen[need], i]
        seen[v] = i
    return []`,
  },
  {
    id: "cpp-hello",
    name: "Hello C++",
    link: "https://en.cppreference.com/w/cpp/language/hello_world",
    difficulty: "Easy",
    topicTags: ["Basics"],
    language: "cpp",
    blurb: "Simple C++ program — introduces the // q: comment style for flashcards.",
    source: `// complexity: time O(1), space O(1) for the output
#include <iostream>

int main() {
    // why: print a greeting to the console
    std::cout << "Hello, World!" << std::endl;
    // q: why use std::endl instead of "\\n"?
    return 0;
}`,
  },
  {
    id: "cpp-binary-search",
    name: "Binary Search (C++)",
    link: "https://leetcode.com/problems/binary-search/",
    difficulty: "Easy",
    topicTags: ["Array", "Binary Search"],
    language: "cpp",
    blurb: "Classic log n lookup. The // q: comment becomes a flashcard.",
    source: `// why: each iteration halves the search range
// complexity: time O(log n), space O(1)
#include <vector>
using namespace std;

int search(vector<int>& arr, int target) {
    int low = 0, high = arr.size() - 1;
    // q: why use low + (high - low) / 2 instead of (low + high) / 2?
    while (low <= high) {
        int mid = low + (high - low) / 2;
        // note: mid belongs to the current search range
        if (arr[mid] == target) return mid;
        if (arr[mid] < target) low = mid + 1;
        else high = mid - 1;
    }
    return -1;
}`,
  },
  {
    id: "cpp-two-sum",
    name: "Two Sum (C++)",
    link: "https://leetcode.com/problems/two-sum/",
    difficulty: "Easy",
    topicTags: ["Array", "Hash Table"],
    language: "cpp",
    blurb: "O(n) with unordered_map. Try the Run console with custom input.",
    source: `// complexity: time O(n), space O(n) for the map
// q: why do we check the map before inserting the current value?
#include <vector>
#include <unordered_map>
using namespace std;

vector<int> twoSum(vector<int>& nums, int target) {
    unordered_map<int, int> seen;
    for (int i = 0; i < nums.size(); i++) {
        int complement = target - nums[i];
        if (seen.count(complement)) {
            return { seen[complement], i };
        }
        seen[nums[i]] = i;
    }
    return {};
}`,
  },
  {
    id: "cpp-merge-sort",
    name: "Merge Sort (C++)",
    link: "https://leetcode.com/problems/sort-an-array/",
    difficulty: "Medium",
    topicTags: ["Array", "Divide and Conquer", "Sorting"],
    language: "cpp",
    blurb: "Recursive with a call graph. The recurrence shows in the blocks tab.",
    source: `// complexity: time O(n log n), space O(n) for the buffer
// why: base case first so a single element is already "sorted"
#include <vector>
using namespace std;

vector<int> mergeSort(vector<int>& arr, int lo, int hi) {
    if (lo >= hi) return { arr[lo] };
    int mid = lo + (hi - lo) / 2;
    vector<int> left = mergeSort(arr, lo, mid);
    vector<int> right = mergeSort(arr, mid + 1, hi);
    // note: merge copies into a buffer so we don't overwrite inputs mid-pass
    return merge(left, right);
}

vector<int> merge(vector<int>& a, vector<int>& b) {
    vector<int> out(a.size() + b.size());
    int i = 0, j = 0, k = 0;
    while (i < a.size() && j < b.size()) {
        if (a[i] <= b[j]) out[k++] = a[i++];
        else out[k++] = b[j++];
    }
    while (i < a.size()) out[k++] = a[i++];
    while (j < b.size()) out[k++] = b[j++];
    return out;
}
vector<int> sortArray(vector<int>& nums) {
    if (nums.size() <= 1) return nums;
    return mergeSort(nums, 0, nums.size() - 1);
}`,
  },
  {
    id: "cpp-valid-parentheses",
    name: "Valid Parentheses (C++)",
    link: "https://leetcode.com/problems/valid-parentheses/",
    difficulty: "Easy",
    topicTags: ["Stack", "String"],
    language: "cpp",
    blurb: "Stack-based. Switch statement shows up in the flowchart as a decision.",
    source: `// complexity: time O(n), space O(n) for the stack
// why: stack of opening brackets — every closing must match the top
#include <string>
#include <stack>
using namespace std;

bool isValid(string s) {
    stack<char> st;
    for (char ch : s) {
        switch (ch) {
            case '(': st.push(')'); break;
            case '[': st.push(']'); break;
            case '{': st.push('}'); break;
            // q: why do we both check empty and peek?
            default:
                if (st.empty() || st.top() != ch) return false;
                st.pop();
        }
    }
    return st.empty();
}`,
  },
];

export function findSample(id: string | null | undefined): Sample | null {
  if (!id) return null;
  return SAMPLES.find((s) => s.id === id) ?? null;
}
