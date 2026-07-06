import type { NextRequest } from 'next/server';

/**
 * /api/stream?url=<base64-encoded-dlink>&dl=1
 *
 * Server-side proxy that:
 *  1. If TERABOX_WORKER_URL is set → delegates to the Worker's /stream (bypasses blocking)
 *  2. Otherwise decodes the target URL, validates host, adds TERABOX_COOKIE, streams back
 *  3. Forwards Range headers for video seeking
 */

const ALLOWED_HOSTS = [
  'terabox.com',
  '1024tera.com',
  'terabox.app',
  'freeterabox.com',
  'terabytez.com',
  'teraboxapp.com',
  '1024terabox.com',
  'mirrobox.com',
  'nephobox.com',
  'momerybox.com',
  'terabox.fun',
  'terabox.tech',
  '4funbox.com',
  'workers.dev',
  'xapiverse.com',
  'baidu.com',
  'baidupcs.com',
];

function isAllowedHost(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// Memory cache to prevent duplicate xAPIverse credit consumption on stream/seeks
const cdnUrlCache = new Map<string, { rawUrl: string; expires: number }>();
const CACHE_TTL = 2 * 60 * 60 * 1000; // Cache for 2 hours

async function getRedirectUrl(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { 'Range': 'bytes=0-0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(5000),
    });
    return resp.url || url;
  } catch (err) {
    console.error(`[stream] Failed to follow redirect for ${url}:`, err);
    return url;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const urlParam = searchParams.get('url');
  const download = searchParams.get('dl') === '1';

  if (!urlParam) {
    return new Response('Missing ?url= parameter', { status: 400 });
  }

  // Decode base64 → original dlink
  let targetUrl: string;
  try {
    targetUrl = Buffer.from(urlParam, 'base64').toString('utf-8');
  } catch {
    targetUrl = urlParam;
  }

  // ── On-demand xAPIverse Redirect Resolution & Caching ────────────────────────
  const isXapiverse = targetUrl.includes('workers.dev') || targetUrl.includes('xapiverse.com');
  if (isXapiverse) {
    const cached = cdnUrlCache.get(targetUrl);
    if (cached && Date.now() < cached.expires) {
      targetUrl = cached.rawUrl;
    } else {
      console.log(`[stream] Resolving xAPIverse redirect on-demand: ${targetUrl}`);
      const resolved = await getRedirectUrl(targetUrl);
      console.log(`[stream] Resolved raw CDN URL: ${resolved}`);
      cdnUrlCache.set(targetUrl, {
        rawUrl: resolved,
        expires: Date.now() + CACHE_TTL,
      });
      targetUrl = resolved;
    }
  }

  const rangeHeader = req.headers.get('range');
  const envCookie = process.env.TERABOX_COOKIE ?? '';
  const workerUrl = process.env.TERABOX_WORKER_URL;

  // ── Option 1: Delegate to Cloudflare Worker (bypasses regional blocks) ──────
  if (workerUrl && !isXapiverse) {
    const cookiesParam = searchParams.get('cookies') || '';
    const workerStream = `${workerUrl.replace(/\/$/, '')}/stream?url=${encodeURIComponent(urlParam)}${download ? '&dl=1' : ''}${cookiesParam ? `&cookies=${encodeURIComponent(cookiesParam)}` : ''}`;
    try {
      const fwdHeaders: Record<string, string> = { 'User-Agent': UA };
      if (rangeHeader) fwdHeaders['Range'] = rangeHeader;

      const upstream = await fetch(workerStream, {
        headers: fwdHeaders,
        signal: AbortSignal.timeout(30_000),
      });

      const resHeaders: Record<string, string> = {
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      };
      const ct = upstream.headers.get('content-type');
      if (ct) resHeaders['Content-Type'] = ct;
      const cl = upstream.headers.get('content-length');
      if (cl) resHeaders['Content-Length'] = cl;
      const cr = upstream.headers.get('content-range');
      if (cr) resHeaders['Content-Range'] = cr;

      return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
    } catch (err: any) {
      console.warn('[stream] Worker relay failed, falling back to direct:', err?.message);
    }
  }

  // ── Option 2: Direct proxy (requires dlink host to be reachable) ─────────────
  if (!isAllowedHost(targetUrl)) {
    return new Response('URL host not allowed', { status: 403 });
  }

  const upstreamHeaders: Record<string, string> = {
    'User-Agent': UA,
    'Referer': 'https://www.terabox.app/',
    'Accept': 'video/*,application/octet-stream',
    'Accept-Encoding': 'identity',
    'Connection': 'keep-alive',
  };
  if (envCookie) upstreamHeaders['Cookie'] = envCookie;
  if (rangeHeader) upstreamHeaders['Range'] = rangeHeader;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      headers: upstreamHeaders,
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err: any) {
    console.error('[stream] fetch failed:', err?.message);
    return new Response('Upstream fetch failed: ' + (err?.message ?? 'unknown'), { status: 502 });
  }

  // Validate that we got actual video content
  const ct = upstream.headers.get('content-type') || '';
  if (upstream.ok && !ct.includes('video') && !ct.includes('octet-stream') && !ct.includes('mp4')) {
    console.warn(`[stream] Unexpected content-type: "${ct}", status: ${upstream.status}`);
  }

  // Prevent serving error pages as video
  if (!upstream.ok) {
    const text = await upstream.text();
    console.error(`[stream] Upstream error ${upstream.status}: ${text.substring(0, 200)}`);
    return new Response(`Upstream server error: ${upstream.status}`, { status: upstream.status });
  }

  // Safety check: if response is HTML, it's likely an error page
  if (ct.includes('text/html') || ct.includes('application/json')) {
    console.error(`[stream] Got ${ct} instead of video. Likely error page.`);
    return new Response('Server returned error page instead of video. Dlink may have expired.', { status: 502 });
  }

  const resHeaders: Record<string, string> = {
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  };
  
  // Ensure video content-type is set correctly
  if (ct) {
    resHeaders['Content-Type'] = ct.includes('video') || ct.includes('mp4') || ct.includes('octet-stream') 
      ? ct 
      : 'video/mp4'; // Default to mp4 if not recognized
  } else {
    resHeaders['Content-Type'] = 'video/mp4';
  }
  
  const cl = upstream.headers.get('content-length');
  if (cl) resHeaders['Content-Length'] = cl;
  const cr = upstream.headers.get('content-range');
  if (cr) resHeaders['Content-Range'] = cr;

  if (download) {
    try {
      const name = new URL(targetUrl).pathname.split('/').pop() || 'download';
      resHeaders['Content-Disposition'] = `attachment; filename="${name}"`;
    } catch {
      resHeaders['Content-Disposition'] = 'attachment';
    }
  }

  return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
}
