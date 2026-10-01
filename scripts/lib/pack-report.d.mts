/** Types for the shared npm pack --json normalizer (consumed by TS tests). */
export declare function normalizePackReport(parsed: unknown): {
  filename: string;
  files?: Array<{ path: string; size: number }>;
  size: number;
};
