import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Simple in-memory token cache (per server instance)
let cachedAccessToken: { token: string; expiresAt: number } | null = null;

type StravaRoute = {
  id: number;
  name: string;
  distance: number; // meters
  elevation_gain: number; // meters
  map?: { summary_polyline?: string };
};

async function getAccessToken(): Promise<string> {
  // If user supplied a raw token, use it
  if (process.env.STRAVA_ACCESS_TOKEN) return process.env.STRAVA_ACCESS_TOKEN;

  // Otherwise use refresh token flow
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const refreshToken = process.env.STRAVA_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Strava env vars. Provide STRAVA_ACCESS_TOKEN OR (STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_REFRESH_TOKEN)."
    );
  }

  // Return cached token if still valid (with small buffer)
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt - 30 > now) {
    return cachedAccessToken.token;
  }

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Strava token refresh failed (${res.status}): ${txt}`);
  }

  const data = (await res.json()) as { access_token: string; expires_at: number };

  cachedAccessToken = { token: data.access_token, expiresAt: data.expires_at };
  return data.access_token;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const routeId = searchParams.get("routeId") || process.env.STRAVA_DEFAULT_ROUTE_ID;

    if (!routeId) {
      return NextResponse.json(
        { error: "Missing routeId. Provide ?routeId=... or STRAVA_DEFAULT_ROUTE_ID." },
        { status: 400 }
      );
    }

    const token = await getAccessToken();

    const res = await fetch(`https://www.strava.com/api/v3/routes/${routeId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text();
      return NextResponse.json(
        { error: `Strava route fetch failed (${res.status})`, details: txt },
        { status: res.status }
      );
    }

    const route = (await res.json()) as StravaRoute;

    return NextResponse.json({
      id: route.id,
      name: route.name,
      distance: route.distance,
      elevation_gain: route.elevation_gain,
      summary_polyline: route.map?.summary_polyline || null,
      strava_url: `https://www.strava.com/routes/${route.id}`,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}