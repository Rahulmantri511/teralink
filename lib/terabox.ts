import { resolveFullLocal } from './resolver';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TeraboxFile = {
  fs_id: string;
  name: string;
  file_path: string;
  size: number;
  size_formatted: string;
  type: 'video' | 'audio' | 'image' | 'file';
  is_dir: '0' | '1';
  duration: string;
  quality: string;
  normal_dlink: string;
  stream_url: string;
  fast_stream_url: Record<string, string>;
  subtitle_url: string;
  thumbnail: string | null;
  folder: string;
  debugInfo?: any;
};

export type TeraboxResult = {
  status?: 'success' | 'failed';
  total_files?: number;
  total_folders?: number;
  list?: TeraboxFile[];
  error?: string;
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(2)} ${units[i]}`;
}

function proxyUrl(dlink: string, download = false): string {
  const encoded = Buffer.from(dlink).toString('base64');
  return `/api/stream?url=${encoded}${download ? '&dl=1' : ''}`;
}

// ─── Short-code extraction ─────────────────────────────────────────────────────

export function extractShortCode(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  try {
    const url = new URL(s);
    for (const key of ['surl', 'shorturl', 'shareid']) {
      const v = url.searchParams.get(key);
      if (v) return v;
    }
    const segs = url.pathname.split('/').filter(Boolean);
    const si = segs.findIndex(x => x === 's');
    if (si >= 0 && segs[si + 1]) return segs[si + 1];
    const m = s.match(/\/s\/([A-Za-z0-9_\-]+)/);
    if (m) return m[1];
    return null;
  } catch {
    const m = s.match(/^([A-Za-z0-9_\-]{6,})$/);
    return m ? m[1] : null;
  }
}

// ─── Call Cloudflare Worker ────────────────────────────────────────────────────

async function callWorker(
  shortCode: string,
  workerUrl: string,
  dir?: string,
): Promise<any> {
  // NOTE: We no longer pass ndus/cookies to the worker.
  // The worker picks an account from its own rotation pool (TERABOX_NDUS_1..4
  // env vars set in Cloudflare dashboard). This keeps credentials secret
  // and enables true per-request rotation without exposing account tokens.
  const params = new URLSearchParams({ code: shortCode });
  if (dir) params.set('dir', dir);
  const url = `${workerUrl.replace(/\/$/, '')}/resolve?${params}`;
  console.log(`[worker] Calling: ${url}`);

  const resp = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    headers: { 'User-Agent': 'TeraLink/1.0' },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => resp.statusText);
    throw new Error(`Worker returned HTTP ${resp.status}: ${text}`);
  }

  return resp.json();
}

// ─── Main resolver ─────────────────────────────────────────────────────────────

export async function resolveTerabox(
  shareUrl: string,
  _envCookie?: string,
  dir?: string,
  _userAgent?: string,
): Promise<TeraboxResult> {
  try {
    const code = extractShortCode(shareUrl);
    if (!code) return { error: 'Could not extract short code from the URL' };

    console.log(`[terabox] Resolving: ${code}`);

    const workerUrl = process.env.TERABOX_WORKER_URL;
    if (!workerUrl) {
      return {
        error:
          'TERABOX_WORKER_URL is not set. ' +
          'Deploy the Cloudflare Worker and add TERABOX_WORKER_URL to .env.local',
      };
    }

    // ── Call Local/Worker Resolver ──────────────────────────────────────────
    let workerData: any;
    try {
      if (process.env.NODE_ENV === 'production' || process.env.USE_WORKER === 'true') {
        // Production/Worker Mode: Worker handles account rotation internally.
        // Credentials (ndus) are stored as Cloudflare env vars — never sent over the wire.
        workerData = await callWorker(code, workerUrl, dir);
      } else {
        // Local Dev Mode: Resolve locally using env credentials
        // Get rotated account from pool
        const pool = [
          process.env.TERABOX_NDUS_1 || '',
          process.env.TERABOX_NDUS_2 || '',
          process.env.TERABOX_NDUS_3 || '',
          process.env.TERABOX_NDUS_4 || '',
          process.env.TERABOX_NDUS   || '',
        ].filter(Boolean);

        let activeNdus = process.env.TERABOX_NDUS || '';
        if (pool.length > 0) {
          let hash = 0;
          for (let i = 0; i < code.length; i++) {
            hash = (hash * 31 + code.charCodeAt(i)) >>> 0;
          }
          activeNdus = pool[hash % pool.length];
          console.log(`[terabox] Dev mode: picked account #${(hash % pool.length) + 1} of ${pool.length}`);
        }

        workerData = await resolveFullLocal(code, {
          ndus:      activeNdus,
          ndut_fmt:  process.env.TERABOX_NDUT_FMT,
          ndut_fmv:  process.env.TERABOX_NDUT_FMV,
          csrf:      process.env.TERABOX_CSRF,
          browserid: process.env.TERABOX_BROWSERID,
        }, workerUrl, dir);
      }
    } catch (err: any) {
      console.error('[resolver] Error:', err?.message);
      return { error: `Resolver error: ${err?.message}` };
    }

    if (workerData.status !== 'success') {
      return { error: workerData.error ?? 'Worker returned failure' };
    }

    if (!workerData.list?.length) {
      return { error: 'No files found in this share' };
    }

    return {
      status: 'success',
      total_files: workerData.total_files,
      total_folders: workerData.total_folders,
      list: workerData.list,
    };

  } catch (err: any) {
    console.error('[terabox] Unhandled error:', err);
    return { error: err?.message ?? 'Unknown error' };
  }
}
