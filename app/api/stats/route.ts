import { NextResponse } from "next/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

const propertyId = process.env.GA_PROPERTY_ID;
const clientEmail = process.env.GA_CLIENT_EMAIL;
const privateKey = process.env.GA_PRIVATE_KEY
  ?.replace(/^"|"$/g, "")
  ?.replace(/\\n/g, "\n");

// Simple in-memory cache
let cachedStats: any = null;
let cacheExpiry = 0;
const CACHE_DURATION = 1000 * 60 * 60; // 1 hour cache

export async function GET() {
  try {
    const now = Date.now();

    // Return cached stats if they are still valid
    if (cachedStats && now < cacheExpiry) {
      return NextResponse.json({ ...cachedStats, cached: true });
    }

    if (!propertyId || !clientEmail || !privateKey) {
      // If credentials aren't set yet, return placeholder dummy stats so the UI doesn't crash
      return NextResponse.json({
        activeUsers: 1450,
        linksResolved: 12450,
        videosPlayed: 9840,
        message: "Demo stats (Please configure GA environment variables)",
      });
    }

    const analyticsDataClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });

    // 1. Fetch total events (All time or since project start, e.g., 2026-01-01)
    const [eventsResponse] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: "2026-01-01",
          endDate: "today",
        },
      ],
      dimensions: [{ name: "eventName" }],
      metrics: [{ name: "eventCount" }],
    });

    let linksResolved = 0;
    let videosPlayed = 0;

    eventsResponse.rows?.forEach((row) => {
      const eventName = row.dimensionValues?.[0]?.value;
      const count = parseInt(row.metricValues?.[0]?.value || "0", 10);

      if (eventName === "resolve_url") {
        linksResolved = count;
      } else if (eventName === "video_play") {
        videosPlayed = count;
      }
    });

    // 2. Fetch Active Users (Last 30 Days)
    const [usersResponse] = await analyticsDataClient.runReport({
      property: `properties/${propertyId}`,
      dateRanges: [
        {
          startDate: "30daysAgo",
          endDate: "today",
        },
      ],
      metrics: [{ name: "activeUsers" }],
    });

    const activeUsers = parseInt(usersResponse.rows?.[0]?.metricValues?.[0]?.value || "0", 10);

    // Save to cache
    cachedStats = {
      activeUsers,
      linksResolved,
      videosPlayed,
    };
    cacheExpiry = now + CACHE_DURATION;

    return NextResponse.json({ ...cachedStats, cached: false });
  } catch (err: any) {
    console.error("[Stats API Error]:", err);
    
    // Return fallback stats on error
    return NextResponse.json({
      activeUsers: 1450,
      linksResolved: 12450,
      videosPlayed: 9840,
      error: err.message || "Failed to fetch GA data",
    });
  }
}
