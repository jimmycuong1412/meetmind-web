export interface ModelFile {
  url: string;
  name: string;
  sizeBytes: number;
}

export interface DownloadPlan {
  toFetch: { file: ModelFile; resumeFrom: number }[];
  alreadyComplete: ModelFile[];
  totalBytes: number;
  alreadyBytes: number;
}

export function planDownload(files: ModelFile[], existing: Map<string, number>): DownloadPlan {
  const plan: DownloadPlan = { toFetch: [], alreadyComplete: [], totalBytes: 0, alreadyBytes: 0 };
  for (const file of files) {
    plan.totalBytes += file.sizeBytes;
    const have = existing.get(file.name) ?? 0;
    if (have === file.sizeBytes) {
      plan.alreadyComplete.push(file);
      plan.alreadyBytes += file.sizeBytes;
    } else if (have > 0 && have < file.sizeBytes) {
      plan.toFetch.push({ file, resumeFrom: have });
      plan.alreadyBytes += have;
    } else {
      // 0 bytes, or larger than expected (corrupt/stale) → restart from scratch.
      plan.toFetch.push({ file, resumeFrom: 0 });
    }
  }
  return plan;
}
