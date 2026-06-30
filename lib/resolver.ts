import { ProxyAgent, fetch as undiciFetch } from 'undici';
import crypto from 'crypto';
import { encryptPayload } from './crypto';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const SIGN_KEY = 'iuuPc64E4Fhn0rTXEzrnbLph0o5qyEEa';
const CLIENTTYPE = '0';
const CHANNEL = 'dubox';

const DOMAINS = [
  'dm.1024tera.com',
  'www.1024tera.com',
  'www.terabox.app',
  'www.mirrobox.com',
  'www.nephobox.com',
  'momerybox.com',
  'terabox.fun',
  'freeterabox.com',
  '4funbox.com',
  'www.terabox.com',
];

const SESSION_CACHE_TTL = 60;   // seconds
const FILELIST_CACHE_TTL = 30;  // seconds
const BYTES_PER_CHUNK = 4 * 1024 * 1024;
const MAX_SEQUENTIAL_FALLBACKS = 3;

// ── In-Memory Caches ──────────────────────────────────────────────────────────
const sessionCache = new Map<string, { expires: number; value: unknown }>();
const filelistCache = new Map<string, { expires: number; value: unknown }>();

function cacheGet(cache: Map<string, { expires: number; value: unknown }>, key: string): unknown {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.value;
}

function cachePut(cache: Map<string, { expires: number; value: unknown }>, key: string, value: unknown, ttl: number) {
  cache.set(key, { expires: Date.now() + ttl * 1000, value });
}

function simpleHash(s: string) {
  if (!s) return 'empty';
  return `${s.length}-${s.charCodeAt(0)}-${s.charCodeAt(s.length - 1)}`;
}

// ── Proxy Fetch Helper ────────────────────────────────────────────────────────
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
    // @ts-expect-error dispatcher is an undici-specific option on RequestInit
    fetchOpts.dispatcher = dispatcher;
  }
  // @ts-expect-error dispatcher option on undiciFetch is supported
  return undiciFetch(url, fetchOpts);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function describeTeraBoxErrno(errno: number | string, domain: string): string {
  switch (Number(errno)) {
    case 400141:
      return `TeraBox session needs verification (errno 400141 on ${domain}). Open https://${domain} in a browser, complete the CAPTCHA/SMS verification, then re-extract the cookies and update .env.local.`;
    case 400210:
      return `TeraBox verify_v2 required (errno 400210 on ${domain}). The cookies in .env.local have aged out — log in to TeraBox in a browser and re-extract ndus/ndut_fmt/ndut_fmv/csrf/browserid.`;
    case 2:
    case 110:
    case 111:
      return `TeraBox rate limit hit (errno ${errno} on ${domain}). Please slow down your requests.`;
    case 404:
      return `TeraBox share not found (errno 404 on ${domain}). The link may be expired or invalid.`;
    default:
      return `TeraBox errno ${errno} on ${domain}: check the share link and your cookies.`;
  }
}

function hmacSha1(key: string, message: string): string {
  return crypto.createHmac('sha1', key).update(message).digest('hex');
}

// Unused b64Encode and b64Decode removed

function parseCookies(setCookieHeaders: string[]): string {
  return setCookieHeaders.map(c => c.split(';')[0]).join('; ');
}

function getCookieValue(cookieStr: string, name: string): string {
  const match = cookieStr.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? match[1] : '';
}

function mergeCookieStrings(baseStr: string, overrideStr: string): string {
  const map = new Map<string, string>();
  const parse = (str: string) => {
    if (!str) return;
    str.split(';').forEach(p => {
      const part = p.trim();
      if (!part) return;
      const eq = part.indexOf('=');
      if (eq > 0) {
        map.set(part.substring(0, eq).trim(), part.substring(eq + 1).trim());
      }
    });
  };
  parse(baseStr);
  parse(overrideStr);
  return Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
}

function isVideo(filename: string): boolean {
  return /\.(mp4|mkv|webm|avi|mov|flv|m4v|ts|3gp)$/i.test(filename);
}
function isAudio(filename: string): boolean {
  return /\.(mp3|aac|ogg|flac|wav|m4a|opus)$/i.test(filename);
}
function isImage(filename: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename);
}

function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes, i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(2)} ${units[i]}`;
}

interface TeraBoxRawFile {
  fs_id?: string | number;
  server_filename?: string;
  filename?: string;
  size?: string | number;
  md5?: string;
  dlink?: string;
  thumbs?: {
    url3?: string;
    url2?: string;
  };
  isdir?: string | number;
  path?: string;
}

function mapFile(f: TeraBoxRawFile) {
  return {
    fs_id:     String(f.fs_id ?? ''),
    filename:  f.server_filename || f.filename || '',
    size:      Number(f.size) || 0,
    md5:       f.md5 || '',
    dlink:     f.dlink || '',
    thumbnail: f.thumbs?.url3 || f.thumbs?.url2 || null,
    isDir:     f.isdir === '1' || f.isdir === 1,
    path:      f.path || '',
  };
}

function extractJsToken(html: string): string {
  const evalMatch = html.match(/decodeURIComponent\(`([^`]+)`\)/);
  if (evalMatch) {
    try {
      const decoded = decodeURIComponent(evalMatch[1]);
      const tok = decoded.match(/fn\("([A-F0-9a-f]+)"\)/i);
      if (tok) return tok[1];
    } catch {}
  }
  const plain = html.match(/jsToken["'\s:=]+["']([A-F0-9a-f]{20,})["']/i);
  return plain ? plain[1] : '';
}

function extractBdstoken(html: string): string {
  const m = html.match(/bdstoken["'\s:=]+["']([a-f0-9]{32})["']/i);
  return m ? m[1] : '';
}

// ── Session Lookup ────────────────────────────────────────────────────────────
async function getSession(domain: string, shortCode: string, premiumCookies = '', ua = UA) {
  const cookieHash = premiumCookies ? simpleHash(premiumCookies) : 'guest';
  const cacheKey = `session:${domain}:${shortCode}:${cookieHash}`;
  const cached = cacheGet(sessionCache, cacheKey) as { cookies: string; jsToken: string; bdstoken: string; browserid: string } | null;
  if (cached) return { ...cached, domain };

  const headers: Record<string, string> = {
    'User-Agent': ua,
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (premiumCookies) {
    headers['Cookie'] = premiumCookies;
  }

  const resp = await proxyFetch(`https://${domain}/sharing/link?surl=${shortCode}`, {
    headers,
    signal: AbortSignal.timeout(12000),
  });

  // Node.js Headers.get() for 'set-cookie' yields a comma-separated string of cookies,
  // or we can use resp.headers.getSetCookie() if supported.
  const getSetCookieList = () => {
    if (typeof resp.headers.getSetCookie === 'function') {
      return resp.headers.getSetCookie();
    }
    const raw = resp.headers.get('set-cookie');
    return raw ? raw.split(', ') : [];
  };

  const cookies = parseCookies(getSetCookieList());
  const html = await resp.text();
  const jsToken = extractJsToken(html);
  const bdstoken = extractBdstoken(html);
  const browserid = getCookieValue(cookies, 'browserid');
  const session = { cookies, jsToken, bdstoken, browserid };
  cachePut(sessionCache, cacheKey, session, SESSION_CACHE_TTL);
  return { ...session, domain };
}

interface ShortUrlInfoResponse {
  list?: TeraBoxRawFile[];
  shareid?: string | number;
  share_id?: string | number;
  uk?: string;
  shareInfo?: unknown;
  errno?: number;
}

// ── File list via /api/shorturlinfo ───────────────────────────────────────────
async function callShorturlinfo(domain: string, shortCode: string, jsToken: string, cookies: string, dir = '', ua = UA): Promise<ShortUrlInfoResponse> {
  const cookieHash = simpleHash(cookies);
  const cacheKey = `filelist:${domain}:${shortCode}:${dir}:${cookieHash}`;
  const cached = cacheGet(filelistCache, cacheKey) as ShortUrlInfoResponse | null;
  if (cached) return cached;

  const result = await _callShorturlinfoInner(domain, shortCode, jsToken, cookies, dir, ua);
  cachePut(filelistCache, cacheKey, result, FILELIST_CACHE_TTL);
  return result;
}

async function _callShorturlinfoInner(domain: string, shortCode: string, jsToken: string, cookies: string, dir = '', ua = UA): Promise<ShortUrlInfoResponse> {
  const rawShortCode = (shortCode.startsWith('1') && shortCode.length === 23)
    ? shortCode.substring(1)
    : shortCode;

  if (dir) {
    const listParams = new URLSearchParams({
      app_id: '250528', web: '1', clienttype: CLIENTTYPE,
      channel: CHANNEL, clientfrom: 'h5',
      shorturl: rawShortCode, root: '0', scene: '',
      page: '1', num: '20', by: 'name', order: 'asc',
      jsToken: jsToken || '',
      dir,
    });
    const listQueryString = listParams.toString().replace(/\+/g, '%20');
    const listResp = await proxyFetch(`https://${domain}/share/list?${listQueryString}`, {
      headers: {
        'User-Agent': ua,
        'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(12000),
    });
    const listJson = (await listResp.json()) as { errno?: number; list?: TeraBoxRawFile[]; shareid?: string | number; share_id?: string | number; uk?: string; share_info?: unknown };
    if (listJson.errno) throw new Error(describeTeraBoxErrno(listJson.errno, domain));
    if (!listJson.list?.length) throw new Error('empty list');
    return {
      list: listJson.list,
      shareid: listJson.shareid ?? listJson.share_id,
      uk: listJson.uk,
      shareInfo: listJson.share_info,
    };
  }

  const surlVariants = ['1' + shortCode, shortCode];
  for (const shorturl of surlVariants) {
    const params = new URLSearchParams({
      app_id: '250528', web: '1', clienttype: CLIENTTYPE,
      channel: CHANNEL, clientfrom: 'h5',
      shorturl, root: '1', scene: '',
      jsToken: jsToken || '',
    });
    const queryString = params.toString().replace(/\+/g, '%20');
    try {
      const resp = await proxyFetch(`https://${domain}/api/shorturlinfo?${queryString}`, {
        headers: {
          'User-Agent': ua,
          'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
          'X-Requested-With': 'XMLHttpRequest',
          'Cookie': cookies,
        },
        signal: AbortSignal.timeout(12000),
      });
      const json = (await resp.json()) as { errno?: number; list?: TeraBoxRawFile[] };
      if (!json.errno && json.list?.length) return json;
    } catch {}
  }

  // Fallback for root folder: use /share/list
  const listParams = new URLSearchParams({
    app_id: '250528', web: '1', clienttype: CLIENTTYPE,
    channel: CHANNEL, clientfrom: 'h5',
    shorturl: rawShortCode, root: '1', scene: '',
    page: '1', num: '20', by: 'name', order: 'asc',
    jsToken: jsToken || '',
  });
  const listQueryString = listParams.toString().replace(/\+/g, '%20');
  const listResp = await proxyFetch(`https://${domain}/share/list?${listQueryString}`, {
    headers: {
      'User-Agent': ua,
      'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
    },
    signal: AbortSignal.timeout(12000),
  });
  const listJson = (await listResp.json()) as { errno?: number; list?: TeraBoxRawFile[]; shareid?: string | number; share_id?: string | number; uk?: string; share_info?: unknown };
  if (listJson.errno) throw new Error(`errno ${listJson.errno} on ${domain}`);
  if (!listJson.list?.length) throw new Error('empty list');
  return {
    list: listJson.list,
    shareid: listJson.shareid ?? listJson.share_id,
    uk: listJson.uk,
    shareInfo: listJson.share_info,
  };
}

// ── Get dlink with authentication ─────────────────────────────────────────────
async function getDlink(domain: string, fsId: string, uk: string, shareId: string, shortCode: string, jsToken: string, bdstoken: string, cookies: string, ua = UA) {
  const dlParams = new URLSearchParams({
    app_id: '250528', web: '1', clienttype: CLIENTTYPE,
    channel: CHANNEL, clientfrom: 'h5',
    jsToken: jsToken || '',
    fid_list: JSON.stringify([Number(fsId)]),
    uk, shareid: shareId,
  });
  if (bdstoken) dlParams.set('bdstoken', bdstoken);

  const dlResp = await proxyFetch(`https://${domain}/share/download?${dlParams}`, {
    method: 'POST',
    headers: {
      'User-Agent': ua,
      'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': `https://${domain}`,
    },
    signal: AbortSignal.timeout(12000),
  });

  if (dlResp.status === 401 || dlResp.status === 403) {
    throw new Error(`share/download returned ${dlResp.status} (TeraBox session likely expired)`);
  }

  try {
    const j = (await dlResp.json()) as { errno?: number; list?: { dlink?: string }[]; dlink?: string; show_msg?: string };
    console.log(`[local-resolver] share/download errno: ${j.errno} on ${domain}`);
    if (j.errno) throw new Error(describeTeraBoxErrno(j.errno, domain) + (j.show_msg ? ` (${j.show_msg})` : ''));
    if (j.list?.[0]?.dlink) return j.list[0].dlink;
    if (j.dlink) return j.dlink;
  } catch (e: unknown) {
    if (e instanceof Error && e.message?.includes('share/download')) throw e;
  }

  // Fallback — /api/filemetas
  try {
    const fmParams = new URLSearchParams({
      app_id: '250528', web: '1', clienttype: CLIENTTYPE,
      channel: CHANNEL, clientfrom: 'h5',
      target: JSON.stringify([`/0/${fsId}`]),
      dlink: '1', jsToken: jsToken || '',
    });
    const fmResp = await proxyFetch(`https://${domain}/api/filemetas?${fmParams}`, {
      headers: {
        'User-Agent': UA,
        'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(12000),
    });
    if (fmResp.status === 401 || fmResp.status === 403) {
      throw new Error(`filemetas returned ${fmResp.status} (TeraBox session likely expired)`);
    }
    const fmJson = (await fmResp.json()) as { errno?: number; info?: { dlink?: string }[] };
    if (fmJson.errno) throw new Error(describeTeraBoxErrno(fmJson.errno, domain));
    if (fmJson.info?.[0]?.dlink) return fmJson.info[0].dlink;
  } catch (e: unknown) {
    if (e instanceof Error && (e.message?.includes('filemetas') || e.message?.includes('share/download'))) throw e;
  }

  return '';
}

// ── Resolve actual CDN download link (follow redirects) ───────────────────────
async function resolveRedirect(dlink: string, cookies: string) {
  if (!dlink) return '';
  const fetchOpts = {
    method: 'HEAD' as const,
    headers: {
      'User-Agent': UA,
      'Referer': 'https://www.1024tera.com/',
      'Cookie': cookies,
    },
    redirect: 'manual' as const,
    signal: AbortSignal.timeout(10000),
  };
  try {
    const resp = await proxyFetch(dlink, fetchOpts);

    if (resp.status === 401 || resp.status === 403 || resp.status === 410) {
      throw new Error(`dlink auth failed (${resp.status}) — TeraBox session likely expired`);
    }

    if (resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) {
      const loc = resp.headers.get('location') || dlink;
      const redirResp = await proxyFetch(loc, fetchOpts);
      if (redirResp.status === 401 || redirResp.status === 403 || redirResp.status === 410) {
        throw new Error(`dlink redirect auth failed (${redirResp.status}) — TeraBox session likely expired`);
      }
      return loc;
    }

    if (resp.ok || resp.status === 206) return dlink;
    throw new Error(`dlink HEAD returned ${resp.status}`);
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message?.includes('session likely expired') || e.message?.includes('auth failed')) throw e;
      console.log('[redirect] Failed to follow dlink redirect:', e.message);
    }
    throw e;
  }
}

// ── Get file size from CDN URL ────────────────────────────────────────────────
async function getFileSize(cdnUrl: string, cookies: string) {
  const headers = {
    'User-Agent': UA,
    'Referer': 'https://www.1024tera.com/',
    'Cookie': cookies,
  };
  try {
    const resp = await proxyFetch(cdnUrl, { method: 'HEAD', headers, signal: AbortSignal.timeout(10000) });
    if (resp.status === 401 || resp.status === 403 || resp.status === 410) {
      throw new Error(`CDN auth failed (${resp.status}) — TeraBox session likely expired`);
    }
    const cl = resp.headers.get('content-length');
    if (cl) return parseInt(cl, 10);
    const r = await proxyFetch(cdnUrl, { headers: { ...headers, 'Range': 'bytes=0-0' }, signal: AbortSignal.timeout(10000) });
    if (r.status === 401 || r.status === 403 || r.status === 410) {
      throw new Error(`CDN auth failed (${r.status}) — TeraBox session likely expired`);
    }
    const cr = r.headers.get('content-range');
    if (cr) {
      const m = cr.match(/\/(\d+)$/);
      if (m) return parseInt(m[1], 10);
    }
  } catch (e: unknown) {
    if (e instanceof Error) {
      if (e.message?.includes('session likely expired')) throw e;
      console.log('[size] Failed to get file size:', e.message);
    }
    throw e;
  }
  return 0;
}

// ── /share/streaming → HLS m3u8 (30s preview, kept for backwards compat) ──────
async function getStreamingUrl(domain: string, shareId: string, uk: string, fsId: string, jsToken: string, browserid: string, cookies: string, qualityType = 'M3U8_AUTO_360', ua = UA) {
  const cookieBrowserid = getCookieValue(cookies, 'browserid') || browserid;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = hmacSha1(SIGN_KEY, CLIENTTYPE + CHANNEL + cookieBrowserid + timestamp);

  const params = new URLSearchParams({
    uk,
    shareid:    shareId,
    fid:        fsId,
    sign,
    timestamp,
    jsToken:    jsToken || '',
    type:       qualityType,
    esl:        '1',
    isplayer:   '1',
    ehps:       '1',
    clienttype: CLIENTTYPE,
    app_id:     '250528',
    web:        '1',
    channel:    CHANNEL,
  });

  const resp = await proxyFetch(`https://${domain}/share/streaming?${params}`, {
    headers: {
      'User-Agent': ua,
      'Referer': `https://${domain}/sharing/link?surl=`,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/plain, */*',
      'Cookie': cookies,
    },
    signal: AbortSignal.timeout(15000),
  });

  const contentType = resp.headers.get('content-type') || '';
  let finalUrl = '';

  if (contentType.includes('mpegurl') || contentType.includes('m3u8')) {
    finalUrl = `https://${domain}/share/streaming?${params}`;
  } else if (contentType.includes('json')) {
    const json = (await resp.json()) as { errno?: number; m3u8_url?: string; url?: string; hls_mp4_url?: string; show_msg?: string };
    if (json.errno) throw new Error(describeTeraBoxErrno(json.errno, domain) + (json.show_msg ? ` (${json.show_msg})` : ''));
    finalUrl = json.m3u8_url || json.url || json.hls_mp4_url || '';
  } else {
    const text = await resp.text().catch(() => '');
    if (text.startsWith('#EXTM3U')) {
      finalUrl = `https://${domain}/share/streaming?${params}`;
    } else if (text.includes('errno')) {
      const j = JSON.parse(text) as { errno?: number; show_msg?: string };
      throw new Error(describeTeraBoxErrno(j.errno ?? '', domain) + (j.show_msg ? ` (${j.show_msg})` : ''));
    } else {
      throw new Error(`Unknown streaming response (${resp.status}): ${text.substring(0, 100)}`);
    }
  }

  if (finalUrl) {
    return finalUrl;
  }

  throw new Error('No valid stream URL resolved');
}

interface MappedFile {
  fs_id: string;
  filename: string;
  size: number;
  md5: string;
  dlink: string;
  thumbnail: string | null;
  isDir: boolean;
  path: string;
  sizeFormatted?: string;
  hlsUrl?: string;
  qualities?: Record<string, string>;
  fastStreamUrl?: string;
  dlinkResolved?: string;
  debugInfo?: {
    streamErrors: { domain?: string; quality?: string; error?: string }[];
    dlinkErrors: { domain?: string; error?: string }[];
    dlinkStatus?: string;
  };
}

// ── Main resolve ──────────────────────────────────────────────────────────────
export async function resolveFullLocal(shortCode: string, auth: { ndus?: string; ndut_fmt?: string; ndut_fmv?: string; csrf?: string; browserid?: string } = {}, workerBase = '', dir = '') {
  console.log(`[local-resolver] Resolving: ${shortCode}`);

  // We MUST use the desktop UA when fetching from TeraBox, otherwise TeraBox treats it as mobile and limits video playback to 30s or blocks dlinks.
  const fetchUa = UA;

  let premCookiesStr = '';
  if (auth && auth.ndus) {
    premCookiesStr = `ndus=${auth.ndus}`;
  }

  let session: { cookies: string; jsToken: string; bdstoken: string; browserid: string; domain: string } | null = null;
  try {
    session = await getSession('dm.1024tera.com', shortCode, premCookiesStr, fetchUa);
  } catch (err: unknown) {
    if (err instanceof Error) {
      console.log(`[local-resolver] Primary domain session lookup failed: ${err.message}. Trying fallbacks...`);
    }
  }

  let bestCookies = premCookiesStr || '', bestJsToken = '', bestBdstoken = '',
      bestBrowserid = auth.browserid || '', bestDomain = 'dm.1024tera.com';

  if (session) {
    const merged = mergeCookieStrings(session.cookies, premCookiesStr);
    bestCookies   = merged;
    bestJsToken   = session.jsToken || bestJsToken;
    bestBdstoken  = session.bdstoken || bestBdstoken;
    bestBrowserid = auth.browserid || session.browserid || bestBrowserid;
    bestDomain    = session.domain;
    console.log(`[local-resolver] Best session from ${bestDomain} (fast path), bdstoken: ${bestBdstoken ? 'found' : 'none'}, jsToken: ${bestJsToken ? 'found' : 'none'}`);
  } else {
    const fallbackDomains = DOMAINS.filter(d => d !== 'dm.1024tera.com').slice(0, 3);
    const sessionResults = await Promise.allSettled(
      fallbackDomains.map(d => getSession(d, shortCode, premCookiesStr, fetchUa))
    );

    let maxCookiesLen = -1;
    for (const r of sessionResults) {
      if (r.status !== 'fulfilled') continue;
      const { cookies, jsToken, bdstoken, browserid, domain } = r.value;
      const merged = mergeCookieStrings(cookies, premCookiesStr);

      if (merged.length > maxCookiesLen) {
        bestCookies   = merged;
        bestJsToken   = jsToken || bestJsToken;
        bestBdstoken  = bdstoken || bestBdstoken;
        bestBrowserid = auth.browserid || browserid || bestBrowserid;
        bestDomain    = domain;
        maxCookiesLen = merged.length;
        console.log(`[local-resolver] Best session from ${domain} (fallback path), bdstoken: ${bdstoken ? 'found' : 'none'}, jsToken: ${jsToken ? 'found' : 'none'}`);
      }
    }
  }

  if (bestBrowserid) {
    bestCookies = mergeCookieStrings(bestCookies, `browserid=${bestBrowserid}`);
  }

  if (!bestBrowserid && !auth.ndus) {
    return { success: false, error: 'Could not get guest session from any domain.' };
  }

  const listDomainOrder = [
    bestDomain,
    ...DOMAINS.filter(d => d !== bestDomain).slice(0, MAX_SEQUENTIAL_FALLBACKS),
  ];

  let files: MappedFile[] = [];
  let shareId = '';
  let uk = '';

  const listErrors: string[] = [];
  for (const d of listDomainOrder) {
    try {
      const api = await callShorturlinfo(d, shortCode, bestJsToken, bestCookies, dir, fetchUa);
      files   = (api.list ?? []).map(mapFile);
      shareId = String(api.shareid ?? '');
      uk      = String(api.uk ?? '');
      bestDomain = d;
      console.log(`[local-resolver] Got ${files.length} file(s) from ${d}, uk=${uk}, shareid=${shareId}`);
      break;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      listErrors.push(`${d}: ${msg}`);
      console.log(`[local-resolver] callShorturlinfo failed on ${d}: ${msg}`);
    }
  }

  if (!files.length) {
    return { success: false, error: `Could not fetch file list from any domain. Details: ${listErrors.join(' | ')}` };
  }

  for (const f of files) {
    if (f.isDir) continue;
    f.sizeFormatted = formatSize(f.size);
    f.hlsUrl        = '';
    f.qualities     = {};
    f.fastStreamUrl = '';
    f.dlinkResolved = '';
    f.debugInfo     = { streamErrors: [], dlinkErrors: [] };

    let dlinkErrored = false;
    const dlinkDomainOrder = [
      bestDomain,
      ...DOMAINS.filter(d => d !== bestDomain).slice(0, MAX_SEQUENTIAL_FALLBACKS),
    ];
    for (const d of dlinkDomainOrder) {
      try {
        const dl = await getDlink(d, f.fs_id, uk, shareId, shortCode, bestJsToken, bestBdstoken, bestCookies, fetchUa);
        if (dl) {
          f.dlinkResolved = dl;
          console.log(`[local-resolver] Got dlink for ${f.filename} from ${d}`);
          break;
        }
        f.debugInfo!.dlinkErrors.push({
          domain: d,
          error: 'getDlink returned empty (no dlink in response)',
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'getDlink threw';
        f.debugInfo!.dlinkErrors.push({
          domain: d,
          error: message,
        });
        const errMsg = message.toLowerCase();
        const isAuthError = errMsg.includes('expired') || 
                            errMsg.includes('verify') || 
                            errMsg.includes('400141') || 
                            errMsg.includes('400210') ||
                            errMsg.includes('401') ||
                            errMsg.includes('403');
        if (isAuthError) {
          dlinkErrored = true;
          break; // session issue, don't try other domains
        }
        console.log(`[local-resolver] getDlink failed on ${d}: ${message}`);
      }
    }

    if (!f.dlinkResolved && f.dlink) {
      console.log(`[local-resolver] getDlink failed, falling back to raw list dlink for ${f.filename}`);
      f.dlinkResolved = f.dlink;
    }

    let dlinkStatus = f.dlinkResolved ? 'pending' : 'no_dlink';
    if (f.dlinkResolved && workerBase) {
      try {
        const cdnUrl = await resolveRedirect(f.dlinkResolved, bestCookies);
        let fileSize = f.size || 0;
        if (!fileSize) {
          fileSize = await getFileSize(cdnUrl, bestCookies);
        }

        if (fileSize > 0) {
          const encryptedPayload = await encryptPayload(cdnUrl, bestCookies);
          f.fastStreamUrl = `/stream?p=${encryptedPayload}&format=mp4`;
          dlinkStatus = 'ok';
          console.log(`[local-resolver] fast_stream URL built for ${f.filename}, size=${fileSize}, segments=${Math.ceil(fileSize / BYTES_PER_CHUNK)}`);
        } else {
          dlinkStatus = 'zero_size';
          f.debugInfo!.dlinkErrors.push({ error: 'CDN returned 0 bytes for content-length' });
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'fast_stream build failed';
        const isAuthError = message.toLowerCase().includes('expired') || message.toLowerCase().includes('auth failed');
        dlinkStatus = isAuthError ? 'dead' : 'error';
        f.debugInfo!.dlinkErrors.push({
          error: message,
        });
        console.log(`[local-resolver] dlink failed for ${f.filename} (status: ${dlinkStatus}): ${message}`);
      }
    }
    f.debugInfo!.dlinkStatus = dlinkStatus;

    const skipHls = dlinkStatus === 'dead' || dlinkErrored;
    if (!skipHls && shareId && uk) {
      const fallbackQuality = 'M3U8_AUTO_480';
      const streamDomainOrder = [
        bestDomain,
        ...DOMAINS.filter(d => d !== bestDomain).slice(0, MAX_SEQUENTIAL_FALLBACKS),
      ];

      for (const d of streamDomainOrder) {
        try {
          const streamUrl = await getStreamingUrl(d, shareId, uk, f.fs_id, bestJsToken, bestBrowserid, bestCookies, fallbackQuality, fetchUa);
          if (streamUrl) {
            f.qualities['480'] = streamUrl;
            f.hlsUrl = streamUrl;
            console.log(`[local-resolver] Got HLS streaming URL for ${f.filename} from ${d}`);
            break;
          }
          f.debugInfo!.streamErrors.push({ domain: d, quality: '480', error: 'getStreamingUrl returned empty' });
        } catch (err: unknown) {
          f.debugInfo!.streamErrors.push({
            domain: d,
            quality: '480',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    } else if (skipHls) {
      console.log(`[local-resolver] Skipping HLS for ${f.filename} — dlink is dead, session likely expired`);
      f.debugInfo!.streamErrors.push({
        error: 'HLS skipped: dlink returned 4xx (session expired or verification required)',
      });
    }
  }

  const filesList = [];
  let totalFiles = 0;
  let totalFolders = 0;

  for (const f of files) {
    if (f.isDir) {
      totalFolders++;
    } else {
      totalFiles++;
    }

    const type = isVideo(f.filename) ? 'video' : isAudio(f.filename) ? 'audio' : isImage(f.filename) ? 'image' : 'file';
    const fastStreamUrlMap: Record<string, string> = {};

    // 1. Prioritize HLS qualities (not IP-bound, proxyable on Edge)
    if (f.qualities) {
      for (const qKey of Object.keys(f.qualities)) {
        const encrypted = await encryptPayload(f.qualities[qKey], bestCookies);
        fastStreamUrlMap[`${qKey}p`] = `/stream?p=${encrypted}`;
      }
    }

    // 2. Fast stream qualities (fallback or Original Full quality)
    if (f.fastStreamUrl) {
      fastStreamUrlMap['Original (Full)'] = f.fastStreamUrl;
    } else if (f.dlinkResolved) {
      const encrypted = await encryptPayload(f.dlinkResolved, bestCookies);
      fastStreamUrlMap['Original (Full)'] = `/stream?p=${encrypted}&format=mp4`;
    }

    if (fastStreamUrlMap['Original (Full)']) {
      // If we don't have any HLS streaming resolved, map it as the primary stream qualities
      if (Object.keys(fastStreamUrlMap).length === 1) { // only 'Original (Full)' is present
        for (const q of ['360p', '480p', '720p', '1080p']) {
          fastStreamUrlMap[q] = fastStreamUrlMap['Original (Full)'];
        }
      }
    }

    if (f.dlinkResolved) {
      const encrypted = await encryptPayload(f.dlinkResolved, bestCookies);
      fastStreamUrlMap['Direct Download'] = `/stream?p=${encrypted}&dl=1`;
    }

    let primaryQuality = '360p';
    if (fastStreamUrlMap['Original (Full)']) primaryQuality = 'Original (Full)';
    else if (fastStreamUrlMap['Preview (480p)']) primaryQuality = 'Preview (480p)';
    else if (fastStreamUrlMap['Preview (360p)']) primaryQuality = 'Preview (360p)';
    else if (Object.keys(fastStreamUrlMap).length > 0) primaryQuality = Object.keys(fastStreamUrlMap)[0];

    let finalStreamUrl = '';
    if (f.fastStreamUrl) {
      finalStreamUrl = f.fastStreamUrl;
    } else if (f.dlinkResolved) {
      const encrypted = await encryptPayload(f.dlinkResolved, bestCookies);
      finalStreamUrl = `/stream?p=${encrypted}&format=mp4`;
    } else if (f.hlsUrl) {
      const encrypted = await encryptPayload(f.hlsUrl, bestCookies);
      finalStreamUrl = `/stream?p=${encrypted}`;
    }

    filesList.push({
      fs_id: f.fs_id,
      name: f.filename,
      file_path: f.path || `/${f.filename}`,
      size: f.size,
      size_formatted: f.sizeFormatted,
      type,
      is_dir: f.isDir ? "1" : "0",
      duration: "00:00:00",
      quality: primaryQuality,
      normal_dlink: f.dlinkResolved ? `/stream?p=${await encryptPayload(f.dlinkResolved, bestCookies)}&dl=1` : "",
      stream_url: finalStreamUrl,
      fast_stream_url: fastStreamUrlMap,
      subtitle_url: "",
      thumbnail: f.thumbnail,
      folder: "root",
      debugInfo: f.debugInfo
    });
  }

  const anyPlayable = filesList.some(f =>
    (f.fast_stream_url && Object.keys(f.fast_stream_url).length > 0) || f.stream_url
  );

  if (!anyPlayable && totalFiles > 0) {
    const anyDlinkDead = filesList.some(f => f.debugInfo?.dlinkStatus === 'dead');
    const errorMsg = anyDlinkDead
      ? 'TeraBox session expired or verification is required. Please refresh the cookies in .env.local and try again.'
      : 'No playable video files found in this share. The link may have expired, or all files may be unsupported types.';

    return {
      status: "failed",
      error: errorMsg,
      total_files: totalFiles,
      total_folders: totalFolders,
      list: filesList,
    };
  }

  return {
    status: "success",
    total_files: totalFiles,
    total_folders: totalFolders,
    list: filesList
  };
}
