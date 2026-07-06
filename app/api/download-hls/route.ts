import { NextRequest } from 'next/server';

export async function GET(req: NextRequest) {
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
