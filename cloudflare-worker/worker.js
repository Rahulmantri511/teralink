/**
 * TeraLink — Cloudflare Worker
 *
 * Endpoints:
 *   GET  /resolve?code=xxx              — Resolves share URL, returns dlink + fast_stream_url
 *   GET  /stream?url=<b64>&cookies=<b64> — HLS/segment proxy with Cookie + Range forwarding
 *   GET  /fast_stream?code=xxx          — Synthetic full-video M3U8 built from dlink byte-ranges
 *   GET  /segment?url=<b64>&cookies=<b64>&range=<start>-<end> — Byte-range segment proxy
 *
 * Sign algorithm: HMAC-SHA1("iuuPc64E4Fhn0rTXEzrnbLph0o5qyEEa", clienttype + channel + browserid + timestamp)
 */

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
  'terasharefile.com',
  'baidu.com',
  'baidupcs.com',
];

function isAllowedHost(rawUrl) {
  try {
    const { hostname } = new URL(rawUrl);
    return ALLOWED_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// ── Cache layer ───────────────────────────────────────────────────────────────
// Session and file-list lookups are hit on every /resolve call. Caching them
// at the edge for a short window (30-60s) dramatically reduces the request
// rate we send to TeraBox — which directly helps avoid the rate-limit /
// verification prompts (errno 400141/400210) that triggered the account flag.
// dlinks and HLS URLs are NEVER cached (time-limited signatures).

const SESSION_CACHE_TTL = 60;   // seconds
const FILELIST_CACHE_TTL = 30;  // seconds

async function cacheGet(key) {
  try {
    const cache = caches.default;
    const cached = await cache.match(`https://cache.internal/${key}`);
    if (!cached) return null;
    const data = await cached.json();
    if (Date.now() - data._cachedAt > data._ttl * 1000) return null;
    return data.value;
  } catch {
    return null;
  }
}

async function cachePut(key, value, ttl) {
  try {
    const cache = caches.default;
    const data = { _cachedAt: Date.now(), _ttl: ttl, value };
    const resp = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${ttl}` },
    });
    await cache.put(`https://cache.internal/${key}`, resp);
  } catch {}
}

// Cheap non-crypto hash for cache key derivation. Length+first/last chars is
// enough to distinguish different cookie strings for cache invalidation.
function simpleHash(s) {
  if (!s) return 'empty';
  return `${s.length}-${s.charCodeAt(0)}-${s.charCodeAt(s.length - 1)}`;
}

// Approximate bytes per second at each quality level
// Used to decide chunk size when we don't know exact segment length
const BYTES_PER_CHUNK = 4 * 1024 * 1024; // 4 MB per segment ≈ ~10s at 360p

// ── TeraBox errno translator ─────────────────────────────────────────────────
// TeraBox returns opaque numeric errnos. The most common ones related to
// session/verification need to surface clear instructions so the user knows
// exactly what to do (instead of staring at "errno 400141").
function describeTeraBoxErrno(errno, domain) {
  switch (Number(errno)) {
    case 400141:
      return `TeraBox session needs verification (errno 400141 on ${domain}). Open https://${domain} in a browser, complete the CAPTCHA/SMS verification, then re-extract the cookies and update .env.local.`;
    case 400210:
      return `TeraBox verify_v2 required (errno 400210 on ${domain}). The cookies in .env.local have aged out — log in to TeraBox in a browser and re-extract ndus/ndut_fmt/ndut_fmv/csrf/browserid.`;
    case 2:
    case 110:
    case 111:
      return `TeraBox rate limit hit (errno ${errno} on ${domain}). The Cloudflare edge cache should help, but if this persists, slow down your requests.`;
    case 404:
      return `TeraBox share not found (errno 404 on ${domain}). The link may be expired or invalid.`;
    default:
      return `TeraBox errno ${errno} on ${domain}: check the share link and your cookies.`;
  }
}

// ── Crypto ────────────────────────────────────────────────────────────────────

async function hmacSha1(key, message) {
  const keyData = new TextEncoder().encode(key);
  const msgData = new TextEncoder().encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Encoding ──────────────────────────────────────────────────────────────────

function b64Encode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64Decode(str) {
  try {
    return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return decodeURIComponent(str);
  }
}

// ── Cookie helpers ────────────────────────────────────────────────────────────

function parseCookies(setCookieHeaders) {
  return setCookieHeaders.map(c => c.split(';')[0]).join('; ');
}

function getCookieValue(cookieStr, name) {
  const match = cookieStr.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? match[1] : '';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isVideo(filename) {
  return /\.(mp4|mkv|webm|avi|mov|flv|m4v|ts|3gp)$/i.test(filename);
}
function isAudio(filename) {
  return /\.(mp3|aac|ogg|flac|wav|m4a|opus)$/i.test(filename);
}
function isImage(filename) {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(filename);
}

function formatSize(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes, i = 0;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(2)} ${units[i]}`;
}

function mapFile(f) {
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

function extractJsToken(html) {
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

function extractBdstoken(html) {
  const m = html.match(/bdstoken["'\s:=]+["']([a-f0-9]{32})["']/i);
  return m ? m[1] : '';
}

function mergeCookieStrings(baseStr, overrideStr) {
  const map = new Map();
  const parse = (str) => {
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

// ── Guest session ─────────────────────────────────────────────────────────────

async function getSession(domain, shortCode, premiumCookies = '') {
  // Cache the session per (domain, shortCode, cookie-hash). premiumCookies is
  // included in the cache key so a fresh login invalidates prior entries.
  const cookieHash = premiumCookies ? simpleHash(premiumCookies) : 'guest';
  const cacheKey = `session:${domain}:${shortCode}:${cookieHash}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return { ...cached, domain };

  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };
  if (premiumCookies) {
    headers['Cookie'] = premiumCookies;
  }

  const resp = await fetch(`https://${domain}/sharing/link?surl=${shortCode}`, {
    headers,
    signal: AbortSignal.timeout(12000),
  });
  const setCookies = resp.headers.getSetCookie?.() ?? [];
  const cookies = parseCookies(setCookies);
  const html = await resp.text();
  const jsToken = extractJsToken(html);
  const bdstoken = extractBdstoken(html);
  const browserid = getCookieValue(cookies, 'browserid');
  const session = { cookies, jsToken, bdstoken, browserid };
  await cachePut(cacheKey, session, SESSION_CACHE_TTL);
  return { ...session, domain };
}

// ── File list via /api/shorturlinfo ───────────────────────────────────────────

async function callShorturlinfo(domain, shortCode, jsToken, cookies, dir = '') {
  // Cache the file list per (domain, shortCode, dir, cookie-hash) for a
  // short window. Cache is short because the share owner can add/remove
  // files at any time. Key includes cookie hash so a fresh login bypasses
  // any cached "needs verify" responses from the previous session.
  const cookieHash = simpleHash(cookies);
  const cacheKey = `filelist:${domain}:${shortCode}:${dir}:${cookieHash}`;
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // Compute the result via the inner logic, then cache + return.
  const result = await _callShorturlinfoInner(domain, shortCode, jsToken, cookies, dir);
  // Fire-and-forget cache write; do not block the response.
  cachePut(cacheKey, result, FILELIST_CACHE_TTL).catch(() => {});
  return result;
}

async function _callShorturlinfoInner(domain, shortCode, jsToken, cookies, dir = '') {
  // If shortCode starts with '1' and has length 23 (1 + 22 char key),
  // strip the leading '1' to get the raw shortCode.
  // TeraBox's /share/list requires the raw shortCode (without '1' prefix),
  // whereas /api/shorturlinfo accepts or expects the prefix.
  const rawShortCode = (shortCode.startsWith('1') && shortCode.length === 23)
    ? shortCode.substring(1)
    : shortCode;

  // If dir is specified (subfolder traversal), query /share/list directly
  // since /api/shorturlinfo does not return contents for subfolders.
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
    const listResp = await fetch(`https://${domain}/share/list?${listQueryString}`, {
      headers: {
        'User-Agent': UA,
        'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(12000),
    });
    const listJson = await listResp.json();
    if (listJson.errno) throw new Error(describeTeraBoxErrno(listJson.errno, domain));
    if (!listJson.list?.length) throw new Error('empty list');
    return {
      list: listJson.list,
      shareid: listJson.shareid ?? listJson.share_id,
      uk: listJson.uk,
      shareInfo: listJson.share_info,
    };
  }

  // Otherwise (root folder query), try /api/shorturlinfo first
  const surlVariants = ['1' + shortCode, shortCode];
  for (const shorturl of surlVariants) {
    const params = new URLSearchParams({
      app_id: '250528', web: '1', clienttype: CLIENTTYPE,
      channel: CHANNEL, clientfrom: 'h5',
      shorturl, root: '1', scene: '',
      jsToken: jsToken || '',
    });
    const queryString = params.toString().replace(/\+/g, '%20');
    const resp = await fetch(`https://${domain}/api/shorturlinfo?${queryString}`, {
      headers: {
        'User-Agent': UA,
        'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookies,
      },
      signal: AbortSignal.timeout(12000),
    });
    const json = await resp.json();
    if (!json.errno && json.list?.length) return json;
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
  const listResp = await fetch(`https://${domain}/share/list?${listQueryString}`, {
    headers: {
      'User-Agent': UA,
      'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
    },
    signal: AbortSignal.timeout(12000),
  });
  const listJson = await listResp.json();
  if (listJson.errno) throw new Error(`errno ${listJson.errno} on ${domain}`);
  if (!listJson.list?.length) throw new Error('empty list');
  return {
    list: listJson.list,
    shareid: listJson.shareid ?? listJson.share_id,
    uk: listJson.uk,
    shareInfo: listJson.share_info,
  };
  return result;
}

// ── Get dlink with authentication ─────────────────────────────────────────────
// TeraBox requires bdstoken (extracted from the sharing page HTML) + ndus cookie
// for /share/download to work.

async function getDlink(domain, fsId, uk, shareId, shortCode, jsToken, bdstoken, cookies) {
  // Call /share/download with bdstoken from page HTML
  const dlParams = new URLSearchParams({
    app_id: '250528', web: '1', clienttype: CLIENTTYPE,
    channel: CHANNEL, clientfrom: 'h5',
    jsToken: jsToken || '',
    fid_list: JSON.stringify([Number(fsId)]),
    uk, shareid: shareId,
  });
  if (bdstoken) dlParams.set('bdstoken', bdstoken);

  const dlResp = await fetch(`https://${domain}/share/download?${dlParams}`, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Referer': `https://${domain}/sharing/link?surl=${shortCode}`,
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': cookies,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': `https://${domain}`,
    },
    signal: AbortSignal.timeout(12000),
  });

  // TeraBox returns errno != 0 when the session is dead (400210 = verify_v2
  // required, etc.). Throwing here lets the caller mark the dlink as dead
  // and skip the broken HLS fallback. Without this, getDlink silently
  // returned '' and the worker happily tried the equally-broken HLS path.
  if (dlResp.status === 401 || dlResp.status === 403) {
    throw new Error(`share/download returned ${dlResp.status} (TeraBox session likely expired)`);
  }

  try {
    const j = await dlResp.json();
    console.log(`[worker] share/download errno: ${j.errno} on ${domain}`);
    if (j.errno) throw new Error(describeTeraBoxErrno(j.errno, domain) + (j.show_msg ? ` (${j.show_msg})` : ''));
    if (j.list?.[0]?.dlink) return j.list[0].dlink;
    if (j.dlink) return j.dlink;
  } catch (e) {
    if (e.message?.includes('share/download')) throw e;
  }

  // Fallback — /api/filemetas
  try {
    const fmParams = new URLSearchParams({
      app_id: '250528', web: '1', clienttype: CLIENTTYPE,
      channel: CHANNEL, clientfrom: 'h5',
      target: JSON.stringify([`/0/${fsId}`]),
      dlink: '1', jsToken: jsToken || '',
    });
    const fmResp = await fetch(`https://${domain}/api/filemetas?${fmParams}`, {
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
    const fmJson = await fmResp.json();
    if (fmJson.errno) throw new Error(describeTeraBoxErrno(fmJson.errno, domain));
    if (fmJson.info?.[0]?.dlink) return fmJson.info[0].dlink;
  } catch (e) {
    if (e.message?.includes('filemetas') || e.message?.includes('share/download')) throw e;
  }

  return '';
}

// ── Resolve actual CDN download link (follow redirects) ───────────────────────

async function resolveRedirect(dlink, cookies) {
  if (!dlink) return '';
  const fetchOpts = {
    method: 'HEAD',
    headers: {
      'User-Agent': UA,
      'Referer': 'https://www.1024tera.com/',
      'Cookie': cookies,
    },
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  };
  try {
    const resp = await fetch(dlink, fetchOpts);

    // 4xx means the session is dead or verification is required. Throw so
    // the caller can mark the dlink as broken and skip the broken-by-design
    // HLS fallback.
    if (resp.status === 401 || resp.status === 403 || resp.status === 410) {
      throw new Error(`dlink auth failed (${resp.status}) — TeraBox session likely expired`);
    }

    if (resp.status === 301 || resp.status === 302 || resp.status === 307 || resp.status === 308) {
      const loc = resp.headers.get('location') || dlink;
      // Follow the redirect and re-check status.
      const redirResp = await fetch(loc, fetchOpts);
      if (redirResp.status === 401 || redirResp.status === 403 || redirResp.status === 410) {
        throw new Error(`dlink redirect auth failed (${redirResp.status}) — TeraBox session likely expired`);
      }
      return loc;
    }

    if (resp.ok || resp.status === 206) return dlink;
    throw new Error(`dlink HEAD returned ${resp.status}`);
  } catch (e) {
    // Re-throw auth errors so the caller can surface them.
    if (e.message?.includes('session likely expired') || e.message?.includes('auth failed')) throw e;
    console.log('[redirect] Failed to follow dlink redirect:', e?.message);
    throw e;
  }
}

// ── Get file size from CDN URL ────────────────────────────────────────────────

async function getFileSize(cdnUrl, cookies) {
  const headers = {
    'User-Agent': UA,
    'Referer': 'https://www.1024tera.com/',
    'Cookie': cookies,
  };
  try {
    const resp = await fetch(cdnUrl, { method: 'HEAD', headers, signal: AbortSignal.timeout(10000) });
    if (resp.status === 401 || resp.status === 403 || resp.status === 410) {
      throw new Error(`CDN auth failed (${resp.status}) — TeraBox session likely expired`);
    }
    const cl = resp.headers.get('content-length');
    if (cl) return parseInt(cl, 10);
    const r = await fetch(cdnUrl, { headers: { ...headers, 'Range': 'bytes=0-0' }, signal: AbortSignal.timeout(10000) });
    if (r.status === 401 || r.status === 403 || r.status === 410) {
      throw new Error(`CDN auth failed (${r.status}) — TeraBox session likely expired`);
    }
    const cr = r.headers.get('content-range');
    if (cr) {
      const m = cr.match(/\/(\d+)$/);
      if (m) return parseInt(m[1], 10);
    }
  } catch (e) {
    if (e.message?.includes('session likely expired')) throw e;
    console.log('[size] Failed to get file size:', e?.message);
    throw e;
  }
  return 0;
}

// ── Generate synthetic M3U8 from byte ranges ──────────────────────────────────

function buildM3U8(workerBase, p, fileSize, filename) {
  const chunkSize = BYTES_PER_CHUNK;
  const segments = [];
  let offset = 0;

  while (offset < fileSize) {
    const end = Math.min(offset + chunkSize - 1, fileSize - 1);
    segments.push({ start: offset, end });
    offset = end + 1;
  }

  // Use a nominal per-segment duration. The actual bytes may not align to real
  // time, but HLS.js and native players only care that TARGETDURATION >= any
  // single EXTINF value. We set it equal to the per-segment value.
  const duration = 10; // nominal seconds per 4 MB chunk
  const lines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-MEDIA-SEQUENCE:0',
    `#EXT-X-TARGETDURATION:${duration}`,
    '#EXT-X-PLAYLIST-TYPE:VOD',
  ];

  for (const seg of segments) {
    const encodedRange = b64Encode(`${seg.start}-${seg.end}`);
    const segUrl = `${workerBase}/segment?p=${encodeURIComponent(p)}&range=${encodedRange}`;
    lines.push(`#EXTINF:${duration},`);
    lines.push(segUrl);
  }

  lines.push('#EXT-X-ENDLIST');
  return lines.join('\n');
}

// ── Compute streaming sign ────────────────────────────────────────────────────

async function computeStreamSign(browserid, timestamp) {
  return hmacSha1(SIGN_KEY, CLIENTTYPE + CHANNEL + browserid + timestamp);
}

// ── /share/streaming → HLS m3u8 (30s preview, kept for backwards compat) ──────

async function getStreamingUrl(domain, shareId, uk, fsId, jsToken, browserid, cookies, qualityType = 'M3U8_AUTO_360', encryptionKey = 'default-secret-key-change-me-987') {
  const cookieBrowserid = getCookieValue(cookies, 'browserid') || browserid;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = await hmacSha1(SIGN_KEY, CLIENTTYPE + CHANNEL + cookieBrowserid + timestamp);

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

  const resp = await fetch(`https://${domain}/share/streaming?${params}`, {
    headers: {
      'User-Agent': UA,
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
    const json = await resp.json();
    if (json.errno) throw new Error(describeTeraBoxErrno(json.errno, domain) + (json.show_msg ? ` (${json.show_msg})` : ''));
    finalUrl = json.m3u8_url || json.url || json.hls_mp4_url;
  } else {
    const text = await resp.text().catch(() => '');
    if (text.startsWith('#EXTM3U')) {
      finalUrl = `https://${domain}/share/streaming?${params}`;
    } else if (text.includes('errno')) {
      const j = JSON.parse(text);
      throw new Error(describeTeraBoxErrno(j.errno, domain) + (j.show_msg ? ` (${j.show_msg})` : ''));
    } else {
      throw new Error(`Unknown streaming response (${resp.status}): ${text.substring(0, 100)}`);
    }
  }

  if (finalUrl) {
    const encrypted = await encryptPayload(finalUrl, cookies, encryptionKey);
    return `/stream?p=${encrypted}`;
  }

  throw new Error('No valid stream URL resolved');
}

// ── Subrequest budget ─────────────────────────────────────────────────────────
// Cloudflare Workers default limit is 50 subrequests per invocation.
// Unlimited plans allow 1000. We cap ourselves well below both limits.

// Cap parallel domain probes to keep the total subrequest count predictable.
const MAX_PARALLEL_DOMAINS = 4;
// Cap sequential fallback depth to limit worst-case subrequest count.
const MAX_SEQUENTIAL_FALLBACKS = 3;

// ── Main resolve ──────────────────────────────────────────────────────────────

async function resolveFull(shortCode, auth = {}, workerBase = '', dir = '', encryptionKey = 'default-secret-key-change-me-987') {
  console.log(`[worker] Resolving: ${shortCode}`);

  // Construct premium cookies string if provided
  let premCookiesStr = '';
  if (auth && auth.ndus) {
    const premParts = [];
    premParts.push(`ndus=${auth.ndus}`);
    if (auth.ndut_fmt) premParts.push(`ndut_fmt=${auth.ndut_fmt}`);
    if (auth.ndut_fmv) premParts.push(`ndut_fmv=${auth.ndut_fmv}`);
    if (auth.csrf)     premParts.push(`csrfToken=${auth.csrf}`);
    if (auth.browserid) premParts.push(`browserid=${auth.browserid}`);
    premCookiesStr = premParts.join('; ');
  }

  // Step 1: Get guest/premium session — probe top domains in parallel.
  // We pick the session with the most cookies (= most auth state).
  const topDomains = DOMAINS.slice(0, MAX_PARALLEL_DOMAINS);
  const sessionResults = await Promise.allSettled(
    topDomains.map(d => getSession(d, shortCode, premCookiesStr))
  );

  let bestCookies = premCookiesStr || '', bestJsToken = '', bestBdstoken = '',
      bestBrowserid = auth.browserid || '', bestDomain = topDomains[0];
  let maxCookiesLen = -1;

  for (const r of sessionResults) {
    if (r.status !== 'fulfilled') continue;
    const { cookies, jsToken, bdstoken, browserid, domain } = r.value;
    const merged = mergeCookieStrings(premCookiesStr, cookies);

    if (merged.length > maxCookiesLen) {
      bestCookies   = merged;
      bestJsToken   = jsToken || bestJsToken;
      bestBdstoken  = bdstoken || bestBdstoken;
      bestBrowserid = auth.browserid || browserid || bestBrowserid;
      bestDomain    = domain;
      maxCookiesLen = merged.length;
      console.log(`[worker] Best session from ${domain}, bdstoken: ${bdstoken ? 'found' : 'none'}, jsToken: ${jsToken ? 'found' : 'none'}`);
    }
  }

  if (bestBrowserid) {
    bestCookies = mergeCookieStrings(bestCookies, `browserid=${bestBrowserid}`);
  }

  if (!bestBrowserid && !auth.ndus) {
    return { success: false, error: 'Could not get guest session from any domain.' };
  }

  // Step 2: Get file list — try bestDomain first, then sequential fallbacks.
  // Sequential (not Promise.all) prevents blowing the subrequest limit when
  // bestDomain succeeds — we stop probing once we have a result.
  let files = [], shareId = '', uk = '';
  const listDomainOrder = [
    bestDomain,
    ...DOMAINS.filter(d => d !== bestDomain).slice(0, MAX_SEQUENTIAL_FALLBACKS),
  ];

  for (const d of listDomainOrder) {
    try {
      const api = await callShorturlinfo(d, shortCode, bestJsToken, bestCookies, dir);
      files   = (api.list ?? []).map(mapFile);
      shareId = String(api.shareid ?? '');
      uk      = String(api.uk ?? '');
      bestDomain = d;  // remember which domain worked for downstream steps
      console.log(`[worker] Got ${files.length} file(s) from ${d}, uk=${uk}, shareid=${shareId}`);
      break;
    } catch (err) {
      console.log(`[worker] callShorturlinfo failed on ${d}: ${err?.message}`);
    }
  }

  if (!files.length) {
    return { success: false, error: 'Could not fetch file list from any domain.' };
  }

  // Step 3: For each file, build the dlink-based fast_stream M3U8 (PRIMARY).
  // HLS streaming URL is fetched only as a fallback if dlink resolution fails.
  for (const f of files) {
    if (f.isDir) continue;
    f.sizeFormatted = formatSize(f.size);
    f.hlsUrl        = '';
    f.qualities     = {};
    f.fastStreamUrl = '';
    f.dlinkResolved = f.dlink || '';
    f.debugInfo     = { streamErrors: [], dlinkErrors: [] };

    // 3a: Get authenticated dlink — try bestDomain first, then sequential fallbacks.
    // We track dlinkErrored=true if getDlink throws for any domain (e.g. TeraBox
    // errno 400210 = verify_v2 required). This means the session is dead and
    // the HLS fallback would also fail, so we skip it in step 3c.
    let dlinkErrored = false;
    if (!f.dlink) {
      const dlinkDomainOrder = [
        bestDomain,
        ...DOMAINS.filter(d => d !== bestDomain).slice(0, MAX_SEQUENTIAL_FALLBACKS),
      ];
      for (const d of dlinkDomainOrder) {
        try {
          const dl = await getDlink(d, f.fs_id, uk, shareId, shortCode, bestJsToken, bestBdstoken, bestCookies);
          if (dl) {
            f.dlinkResolved = dl;
            console.log(`[worker] Got dlink for ${f.filename} from ${d}`);
            break;
          }
          f.debugInfo.dlinkErrors.push({
            domain: d,
            error: 'getDlink returned empty (no dlink in response)',
          });
        } catch (err) {
          f.debugInfo.dlinkErrors.push({
            domain: d,
            error: err?.message ?? 'getDlink threw',
          });
          dlinkErrored = true;
          console.log(`[worker] getDlink failed on ${d}: ${err?.message}`);
        }
      }
    }

    // 3b: Build fast_stream M3U8 from dlink byte-ranges (PRIMARY strategy).
    // This is the FULL video, not a 30-second preview, and the CDN URL
    // doesn't need time-based signature refresh like HLS streaming URLs.
    // If the dlink returns 401/403, we know the session is dead and the
    // HLS fallback will also fail — mark dlinkStatus='dead' to skip it.
    let dlinkStatus = f.dlinkResolved ? 'pending' : 'no_dlink';
    if (f.dlinkResolved && workerBase) {
      try {
        const cdnUrl = await resolveRedirect(f.dlinkResolved, bestCookies);
        let fileSize = f.size || 0;
        if (!fileSize) {
          fileSize = await getFileSize(cdnUrl, bestCookies);
        }

        if (fileSize > 0) {
          const encryptedPayload = await encryptPayload(cdnUrl, bestCookies, encryptionKey);
          const fastStreamParams = new URLSearchParams({
            p:       encryptedPayload,
            size:    String(fileSize),
            name:    f.filename,
          });
          f.fastStreamUrl = `${workerBase}/fast_stream?${fastStreamParams}`;
          dlinkStatus = 'ok';
          console.log(`[worker] fast_stream URL built for ${f.filename}, size=${fileSize}, segments=${Math.ceil(fileSize / BYTES_PER_CHUNK)}`);
        } else {
          dlinkStatus = 'zero_size';
          f.debugInfo.dlinkErrors.push({ error: 'CDN returned 0 bytes for content-length' });
        }
      } catch (e) {
        dlinkStatus = 'dead';
        f.debugInfo.dlinkErrors.push({
          error: e?.message ?? 'fast_stream build failed',
        });
        console.log(`[worker] dlink is dead for ${f.filename}: ${e?.message}`);
      }
    }
    f.debugInfo.dlinkStatus = dlinkStatus;

    // 3c: HLS streaming URL — FALLBACK only when dlink-based fast_stream failed
    // AND the dlink isn't provably dead. Two ways the dlink can be dead:
    //   1. resolveRedirect threw on 4xx (dlinkStatus === 'dead')
    //   2. getDlink threw on errno (dlinkErrored === true) — TeraBox's
    //      /share/download returned errno 400210 (verify_v2 required) and
    //      similar auth errors. In both cases the CDN will 403, so skip HLS.
    const skipHls = !f.fastStreamUrl && (dlinkStatus === 'dead' || dlinkErrored);
    if (!f.fastStreamUrl && !skipHls && shareId && uk) {
      const fallbackQuality = 'M3U8_AUTO_480';
      const streamDomainOrder = [
        bestDomain,
        ...DOMAINS.filter(d => d !== bestDomain).slice(0, MAX_SEQUENTIAL_FALLBACKS),
      ];

      for (const d of streamDomainOrder) {
        try {
          const streamUrl = await getStreamingUrl(d, shareId, uk, f.fs_id, bestJsToken, bestBrowserid, bestCookies, fallbackQuality, encryptionKey);
          if (streamUrl) {
            f.qualities['480'] = streamUrl;
            f.hlsUrl = streamUrl;
            console.log(`[worker] Got HLS streaming URL for ${f.filename} from ${d}`);
            break;
          }
          f.debugInfo.streamErrors.push({ domain: d, quality: '480', error: 'getStreamingUrl returned empty' });
        } catch (err) {
          f.debugInfo.streamErrors.push({
            domain: d,
            quality: '480',
            error: err?.message ?? 'Unknown error',
          });
        }
      }
    } else if (skipHls) {
      console.log(`[worker] Skipping HLS for ${f.filename} — dlink is dead, session likely expired`);
      f.debugInfo.streamErrors.push({
        error: 'HLS skipped: dlink returned 4xx (session expired or verification required)',
      });
    }
  }

  // Build response
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

    // Map qualities to fast_stream_url.
    // Priority: dlink-based fast_stream (full video, no signature refresh) > HLS (30s preview).
    const fastStreamUrlMap = {};

    // Primary: dlink-based fast_stream M3U8 (full video).
    // The byte-range M3U8 is the same URL for all "qualities" — the player
    // requests whatever byte ranges it needs, and the original file's quality
    // is whatever the uploader chose.
    if (f.fastStreamUrl) {
      for (const q of ['360p', '480p', '720p', '1080p']) {
        fastStreamUrlMap[q] = f.fastStreamUrl;
      }
      fastStreamUrlMap['Original (Full)'] = f.fastStreamUrl;
    }

    // Secondary: HLS streaming URLs (30-second preview), if dlink-based failed.
    if (!f.fastStreamUrl && f.qualities) {
      for (const qKey of Object.keys(f.qualities)) {
        fastStreamUrlMap[`${qKey}p`] = `${workerBase}${f.qualities[qKey]}`;
      }
    }

    // Direct download link.
    if (f.dlinkResolved) {
      const encrypted = await encryptPayload(f.dlinkResolved, bestCookies, encryptionKey);
      fastStreamUrlMap['Direct Download'] = `${workerBase}/stream?p=${encrypted}&dl=1`;
    }

    // Determine primary quality label for the file.
    let primaryQuality = '360p';
    if (fastStreamUrlMap['480p']) primaryQuality = '480p';
    else if (fastStreamUrlMap['360p']) primaryQuality = '360p';
    else if (Object.keys(fastStreamUrlMap).length > 0) primaryQuality = Object.keys(fastStreamUrlMap)[0];

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
      normal_dlink: f.dlinkResolved ? `${workerBase}/stream?p=${await encryptPayload(f.dlinkResolved, bestCookies, encryptionKey)}&dl=1` : "",
      stream_url: f.hlsUrl
        ? `${workerBase}${f.hlsUrl}`
        : (f.dlinkResolved
          ? `${workerBase}/stream?p=${await encryptPayload(f.dlinkResolved, bestCookies, encryptionKey)}`
          : (f.fastStreamUrl || "")),
      fast_stream_url: fastStreamUrlMap,
      subtitle_url: "",
      thumbnail: f.thumbnail,
      folder: "root",
      debugInfo: f.debugInfo
    });
  }

  // If no file has a working playback URL, return a clear top-level error
  // instead of status: "success" with broken URLs. This gives the caller a
  // reliable signal that the session needs refreshing, rather than letting
  // the player discover the failure later via 403 from the CDN.
  const anyPlayable = filesList.some(f =>
    (f.fast_stream_url && Object.keys(f.fast_stream_url).length > 0) || f.stream_url
  );

  if (!anyPlayable && totalFiles > 0) {
    // Detect whether this is a session/auth failure vs. some other issue
    // (e.g. all files are folders, unsupported file types).
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

async function deriveKey(password) {
  const passwordBytes = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', passwordBytes);
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

function arrayBufferToBase64Url(buffer) {
  let binary = '';
  const len = buffer.byteLength;
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToArrayBuffer(base64url) {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function decryptPayload(base64url, password) {
  const key = await deriveKey(password);
  const combined = base64UrlToArrayBuffer(base64url);
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  const decryptedText = new TextDecoder().decode(decrypted);
  return JSON.parse(decryptedText);
}

async function encryptPayload(url, cookies, password) {
  const data = JSON.stringify({ url, cookies });
  const key = await deriveKey(password);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(data);
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoded
  );
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return arrayBufferToBase64Url(combined);
}

// ── CORS ──────────────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
};

function jsonResp(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function textResp(text, status = 200) {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/plain', ...CORS },
  });
}

// ── Worker entry ──────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const workerBase = `${url.protocol}//${url.host}`;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Health check
    if (url.pathname === '/') {
      return jsonResp({ status: 'ok', message: 'TeraLink Worker is running' });
    }

    // GET /resolve?code=xxx&dir=yyy
    if (url.pathname === '/resolve') {
      const code = url.searchParams.get('code');
      const dir  = url.searchParams.get('dir') || '';
      if (!code || !/^[A-Za-z0-9_\-]{6,30}$/.test(code)) {
        return jsonResp({ error: 'Invalid or malformed ?code=' }, 400);
      }
      try {
        const auth = {
          ndus:      url.searchParams.get('ndus') || '',
          ndut_fmt:  url.searchParams.get('ndut_fmt') || '',
          ndut_fmv:  url.searchParams.get('ndut_fmv') || '',
          csrf:      url.searchParams.get('csrf') || '',
          browserid: url.searchParams.get('browserid') || '',
        };
        const encryptionKey = env.ENCRYPTION_KEY || 'default-secret-key-change-me-987';
        const result = await resolveFull(code, auth, workerBase, dir, encryptionKey);
        return jsonResp(result, result.status === 'success' ? 200 : 500);
      } catch (err) {
        return jsonResp({ error: err?.message ?? 'Worker error' }, 500);
      }
    }

    // GET /fast_stream?p=<encrypted>&size=<bytes>&name=<filename>
    if (url.pathname === '/fast_stream') {
      const p    = url.searchParams.get('p');
      const size = parseInt(url.searchParams.get('size') || '0', 10);
      const name = url.searchParams.get('name') || 'video.mp4';

      if (!p)    return textResp('Missing ?p=', 400);
      if (!size) return textResp('Missing ?size=', 400);

      let targetUrl = '';
      try {
        const password = env.ENCRYPTION_KEY || 'default-secret-key-change-me-987';
        const decrypted = await decryptPayload(p, password);
        targetUrl = decrypted.url;
      } catch (err) {
        return textResp('Invalid ?p=', 400);
      }

      if (!isAllowedHost(targetUrl)) {
        return textResp('Host not allowed', 403);
      }

      const m3u8 = buildM3U8(workerBase, p, size, name);
      return new Response(m3u8, {
        status: 200,
        headers: {
          'Content-Type': 'application/x-mpegURL',
          'Cache-Control': 'no-store',
          ...CORS,
        },
      });
    }

    // GET /segment?p=<encrypted>&range=<b64-encoded "start-end">
    if (url.pathname === '/segment') {
      const p            = url.searchParams.get('p');
      const encodedRange = url.searchParams.get('range');

      if (!p) {
        return textResp('Missing required ?p= parameter', 400);
      }

      let targetUrl = '';
      let cookiesStr = '';
      try {
        const password = env.ENCRYPTION_KEY || 'default-secret-key-change-me-987';
        const decrypted = await decryptPayload(p, password);
        targetUrl = decrypted.url;
        cookiesStr = decrypted.cookies;
      } catch (err) {
        return textResp('Invalid or expired encrypted payload', 400);
      }

      if (!isAllowedHost(targetUrl)) {
        return textResp('Host not allowed', 403);
      }

      let rangeStr = '';
      if (encodedRange) {
        try {
          rangeStr = b64Decode(encodedRange); // "start-end"
        } catch {
          return textResp('Invalid range parameter', 400);
        }
      }

      // Fallback: if no range in query params, use the incoming request's Range header
      if (!rangeStr) {
        const reqRange = request.headers.get('Range');
        if (reqRange) {
          rangeStr = reqRange.replace(/^bytes=/, '');
        }
      }

      const fetchHeaders = {
        'User-Agent': UA,
        'Referer': 'https://www.1024tera.com/',
        'Accept': '*/*',
      };
      if (rangeStr) fetchHeaders['Range'] = `bytes=${rangeStr}`;
      if (cookiesStr) fetchHeaders['Cookie'] = cookiesStr;

      try {
        let upstream = await fetch(targetUrl, {
          headers: fetchHeaders,
          redirect: 'manual',
          signal: AbortSignal.timeout(30000),
        });

        // Handle redirects manually to preserve headers
        if (upstream.status === 301 || upstream.status === 302 ||
            upstream.status === 307 || upstream.status === 308) {
          const redirUrl = upstream.headers.get('location');
          if (redirUrl) {
            upstream = await fetch(redirUrl, { headers: fetchHeaders, signal: AbortSignal.timeout(30000) });
          }
        }

        // Pass through upstream status. Critically, do NOT collapse 4xx/5xx to 200 —
        // the player needs to see real error codes (e.g. 403 when the TeraBox session
        // has expired) so hls.js can surface a useful error message.
        if (upstream.status >= 400) {
          return new Response(upstream.body, {
            status: upstream.status,
            headers: {
              'Content-Type': upstream.headers.get('content-type') || 'text/plain',
              ...CORS,
            },
          });
        }

        const resHeaders = {
          'Content-Type': 'video/mp2t',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'max-age=86400',
          ...CORS,
        };
        const cl = upstream.headers.get('content-length');
        if (cl) resHeaders['Content-Length'] = cl;
        const cr = upstream.headers.get('content-range');
        if (cr) resHeaders['Content-Range'] = cr;

        return new Response(upstream.body, {
          status: upstream.status,
          headers: resHeaders,
        });
      } catch (err) {
        return new Response(`Segment fetch failed: ${err?.message}`, { status: 502, headers: CORS });
      }
    }

async function refreshStreamingUrl(targetUrl, cookies) {
  try {
    if (!targetUrl.includes('/share/streaming')) {
      return targetUrl;
    }
    const urlObj = new URL(targetUrl);
    const browserid = getCookieValue(cookies, 'browserid');
    if (!browserid) return targetUrl;
    
    const timestamp = String(Math.floor(Date.now() / 1000));
    const sign = await hmacSha1(SIGN_KEY, CLIENTTYPE + CHANNEL + browserid + timestamp);
    
    urlObj.searchParams.set('timestamp', timestamp);
    urlObj.searchParams.set('sign', sign);
    
    console.log(`[worker] Refreshed streaming URL signature for quality ${urlObj.searchParams.get('type')}`);
    return urlObj.toString();
  } catch (e) {
    console.log(`[worker] Failed to refresh streaming URL signature: ${e.message}`);
    return targetUrl;
  }
}

    // GET /stream?p=<encrypted>&dl=1 — proxy with Range + Cookie support
    if (url.pathname === '/stream') {
      const p = url.searchParams.get('p');
      if (!p) return textResp('Missing ?p=', 400);

      let targetUrl = '';
      let cookiesStr = '';
      try {
        const password = env.ENCRYPTION_KEY || 'default-secret-key-change-me-987';
        const decrypted = await decryptPayload(p, password);
        targetUrl = decrypted.url;
        cookiesStr = decrypted.cookies;
      } catch (err) {
        return textResp('Invalid or expired encrypted payload', 400);
      }

      if (!isAllowedHost(targetUrl)) {
        return textResp('Host not allowed', 403);
      }

      // Refresh signature dynamically if it is a manifest streaming URL
      targetUrl = await refreshStreamingUrl(targetUrl, cookiesStr);

      // Check if this is an HLS playlist (.m3u8) or has type=M3U8
      const isPlaylist = targetUrl.includes('.m3u8') || targetUrl.includes('type=M3U8');

      if (isPlaylist) {
        const headers = {
          'User-Agent': UA,
          'Referer': 'https://www.terabox.app/',
          'Accept': '*/*',
        };
        if (cookiesStr) headers['Cookie'] = cookiesStr;

        let upstream = await fetch(targetUrl, { headers, redirect: 'manual' });

        if (upstream.status === 301 || upstream.status === 302 ||
            upstream.status === 307 || upstream.status === 308) {
          const redirUrl = upstream.headers.get('location');
          if (redirUrl) {
            upstream = await fetch(redirUrl, { headers });
          }
        }

        const text = await upstream.text();
        if (text.trim().startsWith('{') || text.includes('"errno"')) {
          return new Response(text, {
            status: 403,
            headers: { 'Content-Type': 'application/json', ...CORS }
          });
        }

        // Rewrite segment paths to route through the worker's /segment proxy.
        // This ensures CORS headers are present, avoiding browser CORS blocks on CDN URLs.
        const lines = text.split('\n');
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
            // Route segment through worker proxy to add CORS headers
            const password = env.ENCRYPTION_KEY || 'default-secret-key-change-me-987';
            const encryptedSeg = await encryptPayload(absoluteSegUrl, cookiesStr, password);
            return `${workerBase}/segment?p=${encryptedSeg}`;
          }
          return line;
        });

        const rewrittenLines = await Promise.all(rewrittenLinesPromises);

        return new Response(rewrittenLines.join('\n'), {
          status: upstream.status,
          headers: {
            'Content-Type': 'application/x-mpegURL',
            ...CORS,
          }
        });
      }

      // Otherwise, it is a progressive download/stream: redirect the browser directly
      // to the target signed CDN URL for maximum speed, saving massive worker bandwidth.
      const dl = url.searchParams.get('dl');
      if (dl === '1') {
        return new Response(null, {
          status: 302,
          headers: {
            'Location': targetUrl,
            'Content-Disposition': 'attachment',
            ...CORS
          }
        });
      }

      return new Response(null, {
        status: 302,
        headers: {
          'Location': targetUrl,
          ...CORS
        }
      });
    }

    return textResp('Not found', 404);
  },
};
