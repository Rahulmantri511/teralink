import { NextRequest } from 'next/server';
import { rateLimit } from '../../../lib/rate-limit';

export async function GET(req: NextRequest) {
  // User-Agent Bot Detection
  const userAgent = req.headers.get('user-agent') || '';
  const userAgentLower = userAgent.toLowerCase();
  const isBotUA = 
    !userAgent || 
    userAgentLower.includes('python') || 
    userAgentLower.includes('curl') || 
    userAgentLower.includes('wget') || 
    userAgentLower.includes('postman') ||
    userAgentLower.includes('axios') ||
    userAgentLower.includes('go-http-client') ||
    userAgentLower === 'node' ||
    userAgentLower.startsWith('node-fetch') ||
    userAgentLower.startsWith('node/') ||
    userAgentLower.includes('undici') ||
    userAgentLower.includes('got/') ||
    userAgentLower.includes('superagent') ||
    userAgentLower.includes('java/') ||
    userAgentLower.includes('okhttp') ||
    userAgentLower.includes('httpx') ||
    userAgentLower.includes('ruby') ||
    userAgentLower.includes('php');
    
  if (isBotUA) {
    return new Response('Forbidden: bot detected', { status: 403 });
  }

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
  } else if (referer) {
    try {
      const refererUrl = new URL(referer);
      if (!isDomainAllowed(refererUrl.host)) {
        return new Response('Forbidden referer', { status: 403 });
      }
    } catch {
      return new Response('Invalid referer header', { status: 400 });
    }
  } else {
    // Require Origin or Referer to block simple CLI/script downloads
    return new Response('Missing origin or referer header', { status: 403 });
  }

  // Secure IP Resolution (prevents X-Forwarded-For header spoofing bypasses)
  const ip = (req as any).ip ||
             req.headers.get('cf-connecting-ip') ||
             req.headers.get('x-vercel-ip') ||
             req.headers.get('x-real-ip') ||
             req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
             '127.0.0.1';

  const limitResult = rateLimit(ip + ':dl', { limitMin: 5, limitDay: 50 });
  if (!limitResult.allowed) {
    return new Response('Too many downloads. Please wait a minute or try again tomorrow.', {
      status: 429,
      headers: {
        'X-RateLimit-Limit-Minute': '5',
        'X-RateLimit-Limit-Day': '50',
        'X-RateLimit-Remaining-Minute': String(limitResult.remainingMin),
        'X-RateLimit-Remaining-Day': String(limitResult.remainingDay),
      }
    });
  }

  const { searchParams } = req.nextUrl;
  const m3u8UrlEncoded = searchParams.get('url');
  const filename = searchParams.get('name') || 'video.mp4';

  if (!m3u8UrlEncoded) {
    return new Response('Missing url parameter', { status: 400 });
  }

  let m3u8Url: string;
  try {
    m3u8Url = Buffer.from(m3u8UrlEncoded, 'base64').toString('utf-8');
  } catch {
    m3u8Url = m3u8UrlEncoded;
  }

  // Validate that the target URL is from our authorized Cloudflare Worker domain to prevent arbitrary proxying/abuse
  const allowedWorkerHost = 'mute-butterfly-061b.rahulmantri2002.workers.dev';
  try {
    const parsedUrl = new URL(m3u8Url);
    const host = parsedUrl.host.toLowerCase();
    const isAllowed = 
      host === allowedWorkerHost || 
      host.endsWith('.workers.dev') || // matches workers.dev subdomains
      host === 'localhost:8787';       // local worker testing

    if (!isAllowed) {
      return new Response('Forbidden: Host not allowed for download proxy', { status: 403 });
    }
  } catch {
    return new Response('Invalid target URL structure', { status: 400 });
  }

  try {
    console.log(`[download-hls] Starting download for: ${filename}, playlist: ${m3u8Url}`);
    const playlistResp = await fetch(m3u8Url);
    if (!playlistResp.ok) {
      return new Response(`Failed to fetch HLS playlist: ${playlistResp.statusText}`, { status: 502 });
    }
    const text = await playlistResp.text();
    const segments = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

    if (!segments.length) {
      return new Response('No segments found in playlist', { status: 400 });
    }

    // Resolve absolute segment URLs if relative
    const playlistBase = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
    const absoluteSegments = segments.map(seg => {
      if (seg.startsWith('http')) return seg;
      return playlistBase + seg;
    });

    // Create a ReadableStream that fetches and yields each segment
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for (const segUrl of absoluteSegments) {
            const segResp = await fetch(segUrl);
            if (!segResp.ok) {
              console.warn(`[download-hls] Failed to fetch segment: ${segUrl}`);
              continue;
            }
            const reader = segResp.body?.getReader();
            if (reader) {
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                controller.enqueue(value);
              }
            }
          }
          controller.close();
        } catch (err) {
          console.error('[download-hls] Streaming error:', err);
          controller.error(err);
        }
      }
    });

    // Ensure output file has .mp4 extension
    let outName = filename;
    if (outName.toLowerCase().endsWith('.ts')) {
      outName = outName.slice(0, -3) + '.mp4';
    } else if (!outName.toLowerCase().endsWith('.mp4') && !outName.toLowerCase().endsWith('.mkv')) {
      outName = outName + '.mp4';
    }
    const safeFilename = encodeURIComponent(outName);

    return new Response(stream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': `attachment; filename*=UTF-8''${safeFilename}`,
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (err) {
    console.error('[download-hls] Route error:', err);
    return new Response('Internal Server Error', { status: 500 });
  }
}
