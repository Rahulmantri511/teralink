import type { NextRequest } from 'next/server';
import { ProxyAgent, fetch as undiciFetch } from 'undici';
import { encryptPayload, decryptPayload } from '../../../lib/crypto';

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
];

function isAllowedHost(rawUrl: string): boolean {
  try {
    const { hostname } = new URL(rawUrl);
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

let proxyAgentInstance: ProxyAgent | null = null;
function getDispatcher() {
  if (!process.env.TERABOX_PROXY) return undefined;
  if (!proxyAgentInstance) {
    proxyAgentInstance = new ProxyAgent({ uri: process.env.TERABOX_PROXY });
  }
  return proxyAgentInstance;
}

async function proxyFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const dispatcher = getDispatcher();
  const fetchOpts = { ...options };
  if (dispatcher) {
    // @ts-ignore
    fetchOpts.dispatcher = dispatcher;
  }
  // @ts-ignore
  return undiciFetch(url, fetchOpts);
}

function b64Encode(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64Decode(str: string): string {
  try {
    return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
  } catch {
    return decodeURIComponent(str);
  }
}

export async function GET(req: NextRequest) {
  // Security Origin / Referer Validation
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

  if (origin) {
    try {
      const originUrl = new URL(origin);
      if (!isDomainAllowed(originUrl.host)) {
        return new Response('Forbidden origin', { status: 403 });
      }
    } catch {
      return new Response('Invalid origin header', { status: 400 });
    }
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (!isDomainAllowed(refererUrl.host)) {
        return new Response('Forbidden referer', { status: 403 });
      }
    } catch {
      return new Response('Invalid referer header', { status: 400 });
    }
  }

  const { searchParams } = req.nextUrl;
  const payload = searchParams.get('p');
  const download = searchParams.get('dl') === '1';

  if (!payload) {
    return new Response('Missing ?p= parameter', { status: 400 });
  }

  let targetUrl: string;
  let cookiesStr: string;
  try {
    const decrypted = await decryptPayload(payload);
    targetUrl = decrypted.url;
    cookiesStr = decrypted.cookies;
  } catch (err: any) {
    return new Response('Invalid or expired encrypted payload', { status: 400 });
  }

  if (!isAllowedHost(targetUrl)) {
    return new Response('URL host not allowed', { status: 403 });
  }

  const workerUrl = process.env.TERABOX_WORKER_URL || '';

  const isPlaylist = targetUrl.includes('.m3u8') || 
                     targetUrl.includes('type=M3U8') || 
                     targetUrl.includes('/share/streaming');

  // ── Case 1: HLS Playlist (.m3u8) ───────────────────────────────────────────
  // We MUST fetch the playlist via the Next.js server (local residential IP or proxy)
  // because fetching it from the Cloudflare Worker IP triggers TeraBox verification block (403/400141).
  if (isPlaylist) {
    try {
      const headers: Record<string, string> = {
        'User-Agent': UA,
        'Referer': 'https://www.terabox.app/',
        'Accept': '*/*',
      };
      if (cookiesStr) headers['Cookie'] = cookiesStr;

      console.log(`[local-stream] Fetching HLS playlist from local IP: ${targetUrl.replace(/(sign|jsToken|cookies)=[^&]+/g, '$1=***')}`);
      
      const upstream = await proxyFetch(targetUrl, { headers, redirect: 'manual' });
      
      if (upstream.status === 301 || upstream.status === 302 ||
          upstream.status === 307 || upstream.status === 308) {
        const redirUrl = upstream.headers.get('location');
        if (redirUrl) {
          console.log(`[local-stream] Following playlist redirect: ${redirUrl}`);
          const redirResp = await proxyFetch(redirUrl, { headers });
          return handlePlaylistResponse(redirResp, redirUrl, workerUrl, cookiesStr);
        }
      }

      return handlePlaylistResponse(upstream, targetUrl, workerUrl, cookiesStr);
    } catch (err: any) {
      console.error('[local-stream] Playlist fetch failed:', err?.message);
      return new Response('Playlist fetch failed: ' + err?.message, { status: 502 });
    }
  }

  // ── Case 2: Progressive Video / Direct Download (Redirect to CDN) ───────────
  // Redirect directly to the signed CDN URL for speed and to avoid worker bandwidth limits.
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Location': targetUrl,
  };
  if (download) {
    try {
      const name = new URL(targetUrl).searchParams.get('name') || 'video.mp4';
      headers['Content-Disposition'] = `attachment; filename="${name}"`;
    } catch {
      headers['Content-Disposition'] = 'attachment';
    }
  }

  return new Response(null, {
    status: 302,
    headers,
  });
}

async function handlePlaylistResponse(upstream: Response, targetUrl: string, workerUrl: string, cookiesStr: string) {
  const text = await upstream.text();
  
  if (text.trim().startsWith('{') || text.includes('"errno"')) {
    console.error(`[local-stream] Playlist upstream returned error JSON: ${text}`);
    return new Response(text, {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  // Rewrite segment paths to route through the worker's /segment proxy (which adds CORS headers).
  const lines = text.split('\n');
  const workerBase = workerUrl.replace(/\/$/, '');
  
  const rewrittenLinesPromises = lines.map(async line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      let absoluteSegUrl = trimmed;
      if (!trimmed.startsWith('http')) {
        try {
          if (trimmed.startsWith('/')) {
            const urlObj = new URL(targetUrl);
            absoluteSegUrl = `${urlObj.protocol}//${urlObj.host}${trimmed}`;
          } else {
            absoluteSegUrl = new URL(trimmed, targetUrl).toString();
          }
        } catch {}
      }
      
      const encryptedSegPayload = await encryptPayload(absoluteSegUrl, cookiesStr);
      return `${workerBase}/segment?p=${encryptedSegPayload}`;
    }
    return line;
  });

  const rewrittenLines = await Promise.all(rewrittenLinesPromises);

  // Ensure mandatory HLS headers are present for mobile browser compatibility.
  // iOS Safari and Android Chrome require #EXT-X-VERSION and #EXT-X-MEDIA-SEQUENCE.
  let finalLines = rewrittenLines;
  const joined = rewrittenLines.join('\n');
  if (!joined.includes('#EXT-X-VERSION')) {
    const extm3uIdx = finalLines.findIndex(l => l.trim() === '#EXTM3U');
    if (extm3uIdx !== -1) {
      finalLines = [
        ...finalLines.slice(0, extm3uIdx + 1),
        '#EXT-X-VERSION:3',
        '#EXT-X-MEDIA-SEQUENCE:0',
        ...finalLines.slice(extm3uIdx + 1),
      ];
    }
  }

  return new Response(finalLines.join('\n'), {
    status: upstream.status,
    headers: {
      'Content-Type': 'application/x-mpegURL',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
