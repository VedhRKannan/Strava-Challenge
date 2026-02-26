import MissionClient from "./mission-client";

export const metadata = {
  title: "Weekly Long Run Challenge",
  description: "Track your weekly long run progress with Strava",
};

const WEEKLY_GOAL_KM = 20;

export default function ChallengePage() {
  return (
    <main className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🏃 Weekly Long Run Challenge
          </h1>
          <p className="text-gray-600">
            Goal: Run {WEEKLY_GOAL_KM} km this week
          </p>
        </div>
        <MissionClient weeklyGoalKm={WEEKLY_GOAL_KM} />
      </div>
    </main>
  );
}
