import { NextResponse } from "next/server";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";
const ACTIVITIES_PER_PAGE = 30;

async function getAccessToken(): Promise<string> {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to refresh Strava access token");
  }

  const data = await response.json();
  return data.access_token as string;
}

export async function GET() {
  try {
    const accessToken = await getAccessToken();

    const activitiesResponse = await fetch(
      `${STRAVA_API_BASE}/athlete/activities?per_page=${ACTIVITIES_PER_PAGE}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!activitiesResponse.ok) {
      throw new Error("Failed to fetch Strava activities");
    }

    const activities = await activitiesResponse.json();

    const runs = activities.filter(
      (activity: { type: string }) => activity.type === "Run"
    );

    return NextResponse.json({ activities: runs });
  } catch (error) {
    console.error("Strava API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch Strava data" },
      { status: 500 }
    );
  }
}
