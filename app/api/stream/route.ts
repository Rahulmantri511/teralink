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

import { rateLimit } from '../../../lib/rate-limit';

export async function GET(req: NextRequest) {
  // 1. User-Agent Bot Detection
  const userAgent = req.headers.get('user-agent') || '';
  const userAgentLower = userAgent.toLowerCase();
  const isBotUA = 
    !userAgent || 
    userAgentLower.includes('python') || 
    userAgentLower.includes('curl') || 
    userAgentLower.includes('wget') || 
    userAgentLower.includes('postman') ||
    userAgentLower.includes('axios') ||
    userAgentLower.includes('go-http-client');
    
  if (isBotUA) {
    return new Response('Forbidden: bot detected', { status: 403 });
  }

  // 2. Security Origin / Referer Validation
  const origin = req.headers.get('origin');
  const referer = req.headers.get('referer');
  const host = req.headers.get('host') || '';
  const customAllowedOrigin = process.env.ALLOWED_ORIGIN || '';

  const isDomainAllowed = (domainHost: string) => {
    if (domainHost === host) return true;
    if (domainHost.startsWith('localhost:')) return true;
    if (domainHost.endsWith('.vercel.app')) return true;
    if (customAllowedOrigin && domainHost === customAllowedOrigin) return true;
    return false;
  };

  let isRequestAllowed = false;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (isDomainAllowed(originUrl.host)) isRequestAllowed = true;
    } catch {}
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (isDomainAllowed(refererUrl.host)) isRequestAllowed = true;
    } catch {}
  }

  // Require Origin or Referer to prevent direct hot-linking by other websites / CLI scripts
  if (!isRequestAllowed) {
    return new Response('Forbidden: Unauthorized request origin', { status: 403 });
  }

  // 3. Secure IP Rate Limiting
  const ip = (req as any).ip ||
             req.headers.get('cf-connecting-ip') ||
             req.headers.get('x-vercel-ip') ||
             req.headers.get('x-real-ip') ||
             req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
             '127.0.0.1';

  const limitResult = rateLimit(ip + ':stream', { limitMin: 15, limitDay: 150 });
  if (!limitResult.allowed) {
    return new Response('Too many stream requests. Please wait a minute.', { status: 429 });
  }

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

  const rangeHeader = req.headers.get('range');
  const envCookie = process.env.TERABOX_COOKIE ?? '';
  const workerUrl = process.env.TERABOX_WORKER_URL;

  // ── Option 1: Delegate to Cloudflare Worker (bypasses regional blocks) ──────
  if (workerUrl) {
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
