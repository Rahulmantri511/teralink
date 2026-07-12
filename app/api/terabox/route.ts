import { NextRequest, NextResponse } from 'next/server';
import { resolveTerabox, extractShortCode } from '../../../lib/terabox';
import { rateLimit } from '../../../lib/rate-limit';
import { supabaseServer } from '../../../lib/supabaseServer';

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

export async function POST(req: NextRequest) {
  try {
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
      return NextResponse.json({ error: 'Forbidden: bot detected' }, { status: 403 });
    }

    // Secure IP Resolution (prevents X-Forwarded-For header spoofing bypasses)
    const ip = (req as any).ip ||
               req.headers.get('cf-connecting-ip') ||
               req.headers.get('x-vercel-ip') ||
               req.headers.get('x-real-ip') ||
               req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               '127.0.0.1';

    // Check authentication cookies
    const accessToken = req.cookies.get("sb-access-token")?.value;
    
    let user = null;
    let isPremium = false;
    let playCount = 0;

    if (accessToken) {
      const { data: { user: authUser } } = await supabaseServer.auth.getUser(accessToken);
      if (authUser) {
        user = authUser;
        const { data: profile } = await supabaseServer
          .from("profiles")
          .select("is_premium, premium_until, play_count")
          .eq("id", user.id)
          .single();
        
        if (profile) {
          isPremium = !!profile.is_premium && (!profile.premium_until || new Date(profile.premium_until) > new Date());
          playCount = isPremium ? 0 : (profile.premium_until && new Date(profile.premium_until) < new Date() ? 0 : profile.play_count || 0);
        }
      }
    }

    if (user) {
      if (!isPremium && playCount >= 10) {
        return NextResponse.json({ error: "Trial limit reached. Please upgrade to premium for unlimited plays." }, { status: 402 });
      }
    } else {
      // Guest Rate Limiting: 5 per IP address
      const limitResult = rateLimit(ip, { limitMin: 3, limitDay: 5 });
      if (!limitResult.allowed) {
        return NextResponse.json({
          error: "Guest trial limit reached (5 resolves). Please register for a free account (10 plays) or upgrade to premium.",
        }, { status: 429 });
      }
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
          return NextResponse.json({ error: 'Forbidden origin' }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid origin header' }, { status: 400 });
      }
    } else if (referer) {
      try {
        const refererUrl = new URL(referer);
        if (!isDomainAllowed(refererUrl.host)) {
          return NextResponse.json({ error: 'Forbidden referer' }, { status: 403 });
        }
      } catch {
        return NextResponse.json({ error: 'Invalid referer header' }, { status: 400 });
      }
    } else {
      // Require Origin or Referer to block simple CLI/script bots
      return NextResponse.json({ error: 'Missing origin or referer header' }, { status: 403 });
    }

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
    if (!code || !/^[A-Za-z0-9_\-]{6,30}$/.test(code)) {
      return NextResponse.json({
        error: 'Invalid or malformed short code. Verify your TeraBox link.',
      }, { status: 400 });
    }

    console.log(`[resolve] URL: ${trimmed}, code: ${code}${dir ? `, dir: ${dir}` : ''}`);

    const envCookie = process.env.TERABOX_COOKIE ?? '';
    const result = await resolveTerabox(trimmed, envCookie, dir, userAgent);

    if (result.status !== 'success') {
      return NextResponse.json(result, { status: 500 });
    }

    if (user && !isPremium) {
      console.log(`[resolve] Incrementing play_count for user: ${user.id}, current: ${playCount}`);
      const { data, error: updateError } = await supabaseServer
        .from("profiles")
        .upsert({
          id: user.id,
          email: user.email,
          play_count: playCount + 1
        }, { onConflict: "id" })
        .select();

      if (updateError) {
        console.error("[resolve] Failed to update play_count error:", updateError);
      } else {
        console.log("[resolve] Updated play_count successfully. Profile:", data);
      }
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[resolve] Unhandled error:', err);
    return NextResponse.json({ error: err?.message ?? 'Internal server error' }, { status: 500 });
  }
}
