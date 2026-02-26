"use client";

import { useEffect, useState } from "react";

interface Activity {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  start_date: string;
  type: string;
}

interface MissionClientProps {
  weeklyGoalKm: number;
}

export default function MissionClient({ weeklyGoalKm }: MissionClientProps) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchActivities() {
      try {
        const response = await fetch("/api/strava/route");
        if (!response.ok) {
          throw new Error("Failed to fetch activities");
        }
        const data = await response.json();
        setActivities(data.activities);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    }

    fetchActivities();
  }, []);

  const totalKm = activities.reduce(
    (sum, activity) => sum + activity.distance / 1000,
    0
  );

  const progressPercent = Math.min((totalKm / weeklyGoalKm) * 100, 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <p className="text-gray-500">Loading activities...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg">
        <p>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-xl font-semibold mb-2">Weekly Progress</h2>
        <p className="text-gray-600 mb-4">
          {totalKm.toFixed(2)} km / {weeklyGoalKm} km
        </p>
        <div className="w-full bg-gray-200 rounded-full h-4">
          <div
            className="bg-orange-500 h-4 rounded-full transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <p className="text-sm text-gray-500 mt-2">
          {progressPercent.toFixed(1)}% complete
        </p>
      </div>

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Recent Runs</h2>
        {activities.length === 0 ? (
          <p className="text-gray-500">No runs found this week.</p>
        ) : (
          activities.map((activity) => (
            <div
              key={activity.id}
              className="bg-white rounded-xl shadow p-4 flex justify-between items-center"
            >
              <div>
                <p className="font-medium">{activity.name}</p>
                <p className="text-sm text-gray-500">
                  {new Date(activity.start_date).toLocaleDateString()}
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-orange-600">
                  {(activity.distance / 1000).toFixed(2)} km
                </p>
                <p className="text-sm text-gray-500">
                  {Math.floor(activity.moving_time / 60)} min
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
