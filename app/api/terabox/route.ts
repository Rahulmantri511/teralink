import { NextResponse } from 'next/server';
import { resolveTerabox, extractShortCode } from '../../../lib/terabox';

const TERABOX_DOMAINS = [
  'terabox.com',
  'teraboxurl.com',
  'teraboxshare.com',
  'terasharefile.com',
  '1024tera.com',
  'teraboxapp.com',
  '1024terabox.com',
  'terashare.com',
  'terabytez.com',
  'terabits.io',
  'terabox.app',
  'freeterabox.com',
  'nephobox.com',
  'mirrobox.com',
  '4funbox.com',
  'momerybox.com',
  'tibox.app',
  'dubox.com',
  'terabox.fun',
];

const TERABOX_KEYWORDS = [
  'terabox',
  'terashare',
  '1024tera',
  'nephobox',
  'mirrobox',
  '4funbox',
  'momerybox',
  'tibox',
  'terabytez',
  'terabits',
  'freeterabox',
  'dubox'
];

function isValidTeraboxUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    const host = hostname.toLowerCase();
    
    // Check if hostname matches any known domains
    if (TERABOX_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))) {
      return true;
    }
    
    // Fallback: check if the hostname contains any of the TeraBox keywords
    return TERABOX_KEYWORDS.some(kw => host.includes(kw));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { url, dir } = body ?? {};

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid url' }, { status: 400 });
    }

    const trimmed = url.trim();

    if (!isValidTeraboxUrl(trimmed)) {
      return NextResponse.json({
        error: `Unsupported domain. Supported: ${TERABOX_DOMAINS.join(', ')}`,
      }, { status: 400 });
    }

    const code = extractShortCode(trimmed);
    if (!code) {
      return NextResponse.json({
        error: 'Could not extract short code. Use format: https://terabox.com/s/1ABC',
      }, { status: 400 });
    }

    console.log(`[resolve] URL: ${trimmed}, code: ${code}${dir ? `, dir: ${dir}` : ''}`);

    const envCookie = process.env.TERABOX_COOKIE ?? '';
    const result = await resolveTerabox(trimmed, envCookie, dir);

    if (result.status !== 'success') {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[resolve] Unhandled error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
