import type { DownloadPlan } from "./downloadPlanner";

const DIR = "models";

async function modelsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}

export class OpfsDownloader {
  async existingSizes(names: string[]): Promise<Map<string, number>> {
    const dir = await modelsDir();
    const sizes = new Map<string, number>();
    for (const name of names) {
      try {
        const handle = await dir.getFileHandle(name);
        sizes.set(name, (await handle.getFile()).size);
      } catch {
        // file doesn't exist — leave unset
      }
    }
    return sizes;
  }

  async download(
    plan: DownloadPlan,
    onProgress: (received: number, total: number, file: string) => void,
  ): Promise<void> {
    const dir = await modelsDir();
    let received = plan.alreadyBytes;
    for (const { file, resumeFrom } of plan.toFetch) {
      const headers: HeadersInit = resumeFrom > 0 ? { Range: `bytes=${resumeFrom}-` } : {};
      const res = await fetch(file.url, { headers });
      if (!res.ok || !res.body) throw new Error(`download failed: ${file.url} → HTTP ${res.status}`);
      // A server ignoring Range returns 200 with the full body → restart the file.
      const effectiveOffset = res.status === 206 ? resumeFrom : 0;
      if (effectiveOffset === 0 && resumeFrom > 0) received -= resumeFrom;

      const handle = await dir.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable({ keepExistingData: effectiveOffset > 0 });
      if (effectiveOffset > 0) await writable.seek(effectiveOffset);

      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        await writable.write(value);
        received += value.byteLength;
        onProgress(received, plan.totalBytes, file.name);
      }
      await writable.close();
    }
  }

  async readFile(name: string): Promise<Uint8Array> {
    const dir = await modelsDir();
    const handle = await dir.getFileHandle(name);
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  }
}
