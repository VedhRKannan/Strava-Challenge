"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type RoutePayload = {
  id: number;
  name: string;
  distance: number; // meters
  elevation_gain: number; // meters
  summary_polyline: string | null;
  strava_url: string;
};

function decodePolyline(encoded: string): Array<[number, number]> {
  // Google polyline algorithm: returns [lat, lng]
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates: Array<[number, number]> = [];

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push([lat / 1e5, lng / 1e5]);
  }

  return coordinates;
}

function formatKm(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(km < 10 ? 2 : 1)} km`;
}

function formatMeters(m: number): string {
  return `${Math.round(m)} m`;
}

function parsePaceToSeconds(pace: string): number | null {
  // "4:45" => 285 sec
  const trimmed = pace.trim();
  const match = trimmed.match(/^(\d{1,2}):([0-5]\d)$/);
  if (!match) return null;
  const mm = Number(match[1]);
  const ss = Number(match[2]);
  return mm * 60 + ss;
}

function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function getQueryParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function buildSvgPath(points: Array<[number, number]>, width: number, height: number, padding = 16) {
  if (points.length < 2) return { d: "", bbox: null as any };

  // Convert [lat,lng] -> x,y (lng as x, lat as y) then normalize into viewBox
  const xs = points.map((p) => p[1]);
  const ys = points.map((p) => p[0]);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const dx = maxX - minX || 1;
  const dy = maxY - minY || 1;

  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);

  // Keep aspect ratio
  const scale = Math.min(innerW / dx, innerH / dy);

  const offsetX = padding + (innerW - dx * scale) / 2;
  const offsetY = padding + (innerH - dy * scale) / 2;

  const mapped = points.map(([lat, lng]) => {
    const x = offsetX + (lng - minX) * scale;
    // invert y so north is up
    const y = offsetY + (maxY - lat) * scale;
    return [x, y] as const;
  });

  const d = mapped
    .map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(" ");

  return { d, bbox: { minX, maxX, minY, maxY } };
}

export default function MissionClient() {
  const [route, setRoute] = useState<RoutePayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<"boot" | "briefing" | "reveal" | "complete">("boot");
  const [goalPace, setGoalPace] = useState<string>(() => {
    return getQueryParam("pace") || process.env.NEXT_PUBLIC_GOAL_PACE || "4:45";
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const routeId = useMemo(() => getQueryParam("routeId"), []);
  const title = useMemo(() => getQueryParam("title") || "OPERATION: LONG RUN", []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setError(null);

        const qp = new URLSearchParams();
        if (routeId) qp.set("routeId", routeId);

        const res = await fetch(`/api/strava/route?${qp.toString()}`, { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data?.error ? `${data.error}${data.details ? ` — ${data.details}` : ""}` : "Failed to load route");
        }

        if (!cancelled) {
          setRoute(data);
          setStage("briefing");
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Unknown error");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [routeId]);

  // Dramatic sequence timing
  useEffect(() => {
    if (stage !== "briefing") return;

    const t1 = window.setTimeout(() => setStage("reveal"), 1600);
    const t2 = window.setTimeout(() => setStage("complete"), 4200);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [stage]);

  const paceSeconds = useMemo(() => parsePaceToSeconds(goalPace), [goalPace]);
  const goalTime = useMemo(() => {
    if (!route || !paceSeconds) return null;
    const km = route.distance / 1000;
    return formatHMS(km * paceSeconds);
  }, [route, paceSeconds]);

  const points = useMemo(() => {
    if (!route?.summary_polyline) return [];
    try {
      return decodePolyline(route.summary_polyline);
    } catch {
      return [];
    }
  }, [route?.summary_polyline]);

  const svg = useMemo(() => buildSvgPath(points, 640, 360, 20), [points]);

  function playBeep() {
    // Optional: uses a tiny base64 beep. If autoplay is blocked, user can click.
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }

  function onStart() {
    playBeep();
    setStage("briefing");
  }

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,255,200,0.16),transparent_40%),radial-gradient(circle_at_80%_30%,rgba(255,0,120,0.14),transparent_45%),radial-gradient(circle_at_60%_90%,rgba(0,120,255,0.12),transparent_45%)]" />
        <div className="absolute inset-0 opacity-40 bg-[linear-gradient(to_bottom,transparent,rgba(0,0,0,0.9))]" />
        <div className="absolute inset-0 opacity-[0.12] bg-[repeating-linear-gradient(to_bottom,rgba(255,255,255,0.08)_0px,rgba(255,255,255,0.08)_1px,transparent_2px,transparent_6px)]" />
      </div>

      {/* Audio (tiny beep) */}
      <audio
        ref={audioRef}
        preload="auto"
        src="data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA="
      />

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-14">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs tracking-[0.35em] text-white/60">SYNCRA // TEAM RUN BRIEFING</div>
          <div className="text-xs text-white/50">{new Date().toLocaleString()}</div>
        </div>

        <div className="mt-8 rounded-3xl border border-white/15 bg-white/5 shadow-[0_0_80px_rgba(0,0,0,0.55)] overflow-hidden">
          <div className="p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
              <div>
                <div className="text-sm text-white/60 tracking-[0.2em]">CLASSIFIED DOSSIER</div>
                <h1 className="mt-3 text-3xl md:text-5xl font-semibold leading-tight">
                  {title}
                </h1>
                <p className="mt-4 text-white/70 max-w-2xl">
                  This message will self-destruct in spirit only. The legs will remember.
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-black/40 p-4 w-full md:w-[320px]">
                <label className="text-xs text-white/60 tracking-wide">GOAL PACE (min/km)</label>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    value={goalPace}
                    onChange={(e) => setGoalPace(e.target.value)}
                    placeholder="4:45"
                    className="w-full rounded-xl bg-white/10 border border-white/15 px-3 py-2 outline-none focus:border-white/30 text-white"
                  />
                  <span className="text-xs text-white/50 whitespace-nowrap">e.g. 4:45</span>
                </div>
                {paceSeconds === null && (
                  <div className="mt-2 text-xs text-rose-300/90">Use format mm:ss (e.g. 4:45)</div>
                )}
              </div>
            </div>

            {/* Status line */}
            <div className="mt-8 flex items-center gap-3 text-xs text-white/60">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.9)]" />
              <span className="tracking-[0.25em]">UPLINK STABLE</span>
              <span className="text-white/30">/</span>
              <span className="tracking-[0.25em]">
                {route ? "ROUTE ACQUIRED" : error ? "ROUTE FAILED" : "ACQUIRING ROUTE…"}
              </span>
            </div>

            {/* Main content */}
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div className="rounded-2xl border border-white/15 bg-black/35 p-6">
                {!route && !error && (
                  <div className="text-white/70">
                    <div className="text-sm tracking-[0.25em] text-white/50">DECRYPTING</div>
                    <div className="mt-4 text-2xl font-semibold animate-pulse">Fetching your Strava route…</div>
                    <div className="mt-3 text-sm text-white/50">Tip: add <span className="text-white/70">?routeId=123</span> to the URL.</div>
                  </div>
                )}

                {error && (
                  <div>
                    <div className="text-sm tracking-[0.25em] text-rose-200/80">ERROR</div>
                    <div className="mt-3 text-lg font-semibold text-rose-100">Could not load route.</div>
                    <pre className="mt-3 text-xs text-white/60 whitespace-pre-wrap">{error}</pre>
                    <div className="mt-4 text-sm text-white/60">
                      Check env vars + route privacy (must be accessible via your token).
                    </div>
                  </div>
                )}

                {route && (
                  <div>
                    <div className="text-sm tracking-[0.25em] text-white/50">BRIEFING</div>

                    {/* Dramatic line */}
                    <div className="mt-4 text-white/80">
                      <div className="text-sm text-white/60">Your next big challenge, should you choose to accept it, will be…</div>

                      <div className="mt-4 relative">
                        <div
                          className={[
                            "text-3xl md:text-4xl font-semibold leading-tight transition-all duration-700",
                            stage === "briefing" ? "blur-sm opacity-40" : "blur-0 opacity-100",
                          ].join(" ")}
                        >
                          {route.name}
                        </div>

                        {/* Reveal overlay */}
                        {stage !== "complete" && (
                          <div className="absolute inset-0 pointer-events-none">
                            <div className="h-full w-full bg-gradient-to-r from-black via-black/40 to-black animate-pulse" />
                          </div>
                        )}
                      </div>

                      {/* Start button if we never ran sequence (e.g. user clicked before load) */}
                      {stage === "boot" && (
                        <button
                          onClick={onStart}
                          className="mt-5 rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 transition"
                        >
                          Begin briefing
                        </button>
                      )}
                    </div>

                    <div className="mt-6 grid grid-cols-2 gap-4">
                      <Stat label="Distance" value={formatKm(route.distance)} />
                      <Stat label="Elevation gain" value={formatMeters(route.elevation_gain)} />
                      <Stat label="Goal pace" value={paceSeconds ? `${goalPace} /km` : "—"} />
                      <Stat label="Goal time" value={goalTime ?? "—"} />
                    </div>

                    <div className="mt-6 flex flex-wrap gap-3">
                      <a
                        href={route.strava_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 transition"
                      >
                        Open route in Strava ↗
                      </a>

                      <CopyLinkButton
                        label="Share this briefing"
                        getText={() => window.location.href}
                      />

                      <CopyLinkButton
                        label="Share with pace"
                        getText={() => {
                          const url = new URL(window.location.href);
                          url.searchParams.set("pace", goalPace);
                          return url.toString();
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/15 bg-black/35 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm tracking-[0.25em] text-white/50">TACTICAL MAP</div>
                    <div className="mt-2 text-white/70 text-sm">
                      Polyline render (no tiles). Clean. Fast. Shareable.
                    </div>
                  </div>
                  {route?.summary_polyline ? (
                    <span className="text-xs text-emerald-200/80 border border-emerald-200/30 bg-emerald-200/10 px-2 py-1 rounded-full">
                      SIGNAL LOCK
                    </span>
                  ) : (
                    <span className="text-xs text-white/50 border border-white/15 bg-white/5 px-2 py-1 rounded-full">
                      NO POLYLINE
                    </span>
                  )}
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-black/50 overflow-hidden">
                  <svg viewBox="0 0 640 360" className="w-full h-auto block">
                    <defs>
                      <filter id="glow">
                        <feGaussianBlur stdDeviation="2.5" result="blur" />
                        <feMerge>
                          <feMergeNode in="blur" />
                          <feMergeNode in="SourceGraphic" />
                        </feMerge>
                      </filter>
                    </defs>

                    {/* Frame */}
                    <rect x="0" y="0" width="640" height="360" fill="rgba(0,0,0,0.65)" />
                    <rect x="16" y="16" width="608" height="328" rx="22" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.10)" />

                    {/* Route */}
                    {svg.d ? (
                      <>
                        <path d={svg.d} stroke="rgba(255,255,255,0.25)" strokeWidth="8" fill="none" strokeLinejoin="round" strokeLinecap="round" />
                        <path d={svg.d} stroke="rgba(255,255,255,0.95)" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round" filter="url(#glow)" />

                        {/* Start/Finish dots */}
                        {points.length > 1 && (
                          <>
                            <circle cx={Number(svg.d.split(" ")[1])} cy={Number(svg.d.split(" ")[2])} r="5" fill="rgba(52,211,153,0.95)" />
                            {/* end dot: approximate by taking last coordinate from path string */}
                            <circle
                              cx={Number(svg.d.trim().split(" ").slice(-2)[0])}
                              cy={Number(svg.d.trim().split(" ").slice(-1)[0])}
                              r="5"
                              fill="rgba(244,114,182,0.95)"
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <text x="40" y="190" fill="rgba(255,255,255,0.6)" fontSize="16">
                        No polyline available — route may not include map data.
                      </text>
                    )}
                  </svg>
                </div>

                <div className="mt-5 text-xs text-white/55 leading-relaxed">
                  Pro tip: make a new route in Strava, copy its URL, then open:
                  <span className="text-white/75"> /challenge?routeId=ROUTE_ID&pace=4:45</span>
                </div>
              </div>
            </div>

            {/* Footer dramatic line */}
            <div className="mt-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-sm text-white/60">
              <div>
                <span className="text-white/80">Reminder:</span> Warm up. Fuel. No hero starts.
              </div>
              <div className="tracking-[0.25em] text-xs text-white/45">
                THIS MESSAGE WILL NOT SELF-DESTRUCT (YOUR QUADS MIGHT)
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs text-white/55 tracking-wide">{label}</div>
      <div className="mt-2 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}

function CopyLinkButton({ label, getText }: { label: string; getText: () => string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(getText());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      // ignore
    }
  }

  return (
    <button
      onClick={copy}
      className="rounded-2xl border border-white/20 bg-white/10 px-4 py-2 text-sm hover:bg-white/15 transition"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
