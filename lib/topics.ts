// Fixed topic taxonomy shared by the editor metadata bar and the /log filters.
// Keep both in sync by always importing from here.
export const TOPICS = [
  "Array",
  "String",
  "Two Pointer",
  "Sliding Window",
  "Hash Map",
  "Stack",
  "Queue",
  "Linked List",
  "Tree",
  "Graph",
  "Heap",
  "DP",
  "Backtracking",
  "Greedy",
  "Binary Search",
  "Bit Manipulation",
  "Other",
] as const;

export type Topic = (typeof TOPICS)[number];
