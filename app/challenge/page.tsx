import MissionClient from "./mission-client";

export const metadata = {
  title: "Challenge Briefing",
  description: "Your next long run. Should you choose to accept it.",
};

export default function Page() {
  // Client component will call /api/strava/route and do the reveal.
  return <MissionClient />;
}