// Server-side in-memory rate limiter to protect xAPIverse credits from bot abuse

interface RateLimitRecord {
  minuteCount: number;
  minuteReset: number;
  dayCount: number;
  dayReset: number;
}

const cache = new Map<string, RateLimitRecord>();

// Clean up expired cache entries periodically to prevent memory leaks
if (typeof global !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of cache.entries()) {
      if (now > record.dayReset) {
        cache.delete(ip);
      }
    }
  }, 60 * 60 * 1000); // Every hour
}

export interface RateLimitConfig {
  limitMin?: number;    // Requests per minute
  limitDay?: number;    // Requests per day
}

export function rateLimit(ip: string, config: RateLimitConfig = {}): { allowed: boolean; remainingMin: number; remainingDay: number } {
  const now = Date.now();
  const limitMin = config.limitMin ?? 3;   // Default: 3 requests per minute
  const limitDay = config.limitDay ?? 30;  // Default: 30 requests per day

  const record = cache.get(ip);

  if (!record) {
    const newRecord: RateLimitRecord = {
      minuteCount: 1,
      minuteReset: now + 60 * 1000,
      dayCount: 1,
      dayReset: now + 24 * 60 * 60 * 1000,
    };
    cache.set(ip, newRecord);
    return {
      allowed: true,
      remainingMin: limitMin - 1,
      remainingDay: limitDay - 1,
    };
  }

  // Handle minute reset
  if (now > record.minuteReset) {
    record.minuteCount = 0;
    record.minuteReset = now + 60 * 1000;
  }

  // Handle day reset
  if (now > record.dayReset) {
    record.dayCount = 0;
    record.dayReset = now + 24 * 60 * 60 * 1000;
  }

  // Check limits
  if (record.minuteCount >= limitMin || record.dayCount >= limitDay) {
    return {
      allowed: false,
      remainingMin: Math.max(0, limitMin - record.minuteCount),
      remainingDay: Math.max(0, limitDay - record.dayCount),
    };
  }

  // Increment counts
  record.minuteCount++;
  record.dayCount++;

  return {
    allowed: true,
    remainingMin: limitMin - record.minuteCount,
    remainingDay: limitDay - record.dayCount,
  };
}
