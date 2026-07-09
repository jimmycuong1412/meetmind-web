import type { DownloadPlan } from "./downloadPlanner";

const DIR = "models";

export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadError";
  }
}

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
      let res: Response;
      try {
        res = await fetch(file.url, { headers });
      } catch (err) {
        // Network-level rejection (e.g. TypeError before any response) is a
        // download failure too, not an engine failure.
        throw new DownloadError(err instanceof Error ? err.message : String(err));
      }
      if (!res.ok || !res.body) throw new DownloadError(`download failed: ${file.url} → HTTP ${res.status}`);
      // A server ignoring Range returns 200 with the full body → restart the file.
      const effectiveOffset = res.status === 206 ? resumeFrom : 0;
      if (effectiveOffset === 0 && resumeFrom > 0) received -= resumeFrom;

      const handle = await dir.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable({ keepExistingData: effectiveOffset > 0 });
      if (effectiveOffset > 0) await writable.seek(effectiveOffset);

      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          await writable.write(value);
          received += value.byteLength;
          onProgress(received, plan.totalBytes, file.name);
        }
      } catch (err) {
        throw new DownloadError(err instanceof Error ? err.message : String(err));
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
