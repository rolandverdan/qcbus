import { getTripsRepo } from "../../shared/js/repositories/trips.repo.js";

const esc = (value) => window.escapeHtml(value ?? "");
let etaTrips = [];

function asMillis(value) {
  if (typeof value === "number") return value;
  if (value?.toMillis) return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTime(value) {
  const timestamp = asMillis(value);
  return timestamp !== null
    ? new Date(timestamp).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

function formatMinutes(value) {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded} min`;
}

function getEtaRecords(trips) {
  return trips.flatMap((trip) =>
    (Array.isArray(trip.stopEtaAnalytics) ? trip.stopEtaAnalytics : [])
      .map((entry) => ({ ...entry, trip }))
      .filter((record) => {
        const capturedAt = asMillis(record.predictionCapturedAt);
        const predictedAt = asMillis(record.predictedArrivalAt);
        const actualAt = asMillis(record.actualArrivalAt);
        return capturedAt !== null && predictedAt !== null && actualAt !== null &&
          predictedAt >= capturedAt && actualAt >= capturedAt;
      })
  ).sort((a, b) => asMillis(b.actualArrivalAt) - asMillis(a.actualArrivalAt));
}

function getFilteredRecords() {
  const queryText = document.getElementById("etaSearch")?.value.trim().toLocaleLowerCase() || "";
  const routeFilter = document.getElementById("etaRouteFilter")?.value || "";
  const dateFilter = document.getElementById("etaDateFilter")?.value || "all";
  const timingFilter = document.getElementById("etaTimingFilter")?.value || "all";
  const accuracyFilter = document.getElementById("etaAccuracyFilter")?.value || "all";
  const now = Date.now();
  const cutoff = dateFilter === "all" ? null : now - Number(dateFilter) * 24 * 60 * 60 * 1000;

  return getEtaRecords(etaTrips).filter((record) => {
    const route = record.trip.routeName || record.trip.routeId || "";
    const bus = record.trip.busCode || record.trip.busId || "";
    const haystack = `${record.stopName || ""} ${route} ${bus}`.toLocaleLowerCase();
    const errorMs = asMillis(record.actualArrivalAt) - asMillis(record.predictedArrivalAt);
    const accuracy = Number(record.gpsAccuracyMeters);
    const isReliable = Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 100;
    return (!queryText || haystack.includes(queryText)) &&
      (!routeFilter || String(record.trip.routeId || record.trip.routeName || "") === routeFilter) &&
      (cutoff === null || asMillis(record.actualArrivalAt) >= cutoff) &&
      (accuracyFilter === "all" ||
        (accuracyFilter === "reliable" && isReliable) ||
        (accuracyFilter === "unverified" && !isReliable)) &&
      (timingFilter === "all" || (timingFilter === "on-time" && Math.abs(errorMs) <= 5 * 60_000) ||
        (timingFilter === "late" && errorMs > 5 * 60_000) ||
        (timingFilter === "early" && errorMs < -5 * 60_000));
  });
}

function renderResults(records) {
  const differencesMs = records.map((record) =>
    asMillis(record.actualArrivalAt) - asMillis(record.predictedArrivalAt)
  );
  const avgAbsError = differencesMs.length
    ? differencesMs.reduce((sum, value) => sum + Math.abs(value), 0) / differencesMs.length / 60_000
    : null;
  const avgOffset = differencesMs.length
    ? differencesMs.reduce((sum, value) => sum + value, 0) / differencesMs.length / 60_000
    : null;
  const onTimeRate = differencesMs.length
    ? Math.round(differencesMs.filter((value) => Math.abs(value) <= 5 * 60_000).length / differencesMs.length * 100)
    : null;
  const metric = (label, value, note) => `
    <article class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">${label}</p>
      <p class="mt-2 text-2xl font-bold text-gray-900">${value}</p>
      <p class="mt-1 text-xs text-gray-500">${note}</p>
    </article>`;

  return `
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      ${metric("Stops measured", records.length, "Completed predictions in this view")}
      ${metric("Average ETA error", avgAbsError === null ? "—" : `${avgAbsError.toFixed(1)} min`, "Average absolute difference")}
      ${metric("Average timing", avgOffset === null ? "—" : formatMinutes(avgOffset), "Late (+) or early (−) versus estimate")}
      ${metric("Within 5 minutes", onTimeRate === null ? "—" : `${onTimeRate}%`, "Share of measured stop arrivals")}
    </div>
    <div class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div class="border-b border-gray-100 px-4 py-4 sm:px-5">
        <h3 class="font-bold text-gray-900">Stop arrival comparison</h3>
        <p class="mt-1 text-xs text-gray-500">${records.length ? `Showing ${Math.min(records.length, 100)} of ${records.length} matching completed measurements` : "No measurements match these filters."}</p>
      </div>
      ${records.length ? `
        <div class="overflow-x-auto">
          <table class="w-full min-w-[900px] text-left text-sm">
            <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr><th class="px-4 py-3">Stop</th><th class="px-4 py-3">Route / bus</th><th class="px-4 py-3">Expected</th><th class="px-4 py-3">Actual</th><th class="px-4 py-3">Error</th><th class="px-4 py-3">GPS at arrival</th></tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              ${records.slice(0, 100).map((record) => {
                const deltaMs = asMillis(record.actualArrivalAt) - asMillis(record.predictedArrivalAt);
                const delta = deltaMs / 60_000;
                const deltaClass = Math.abs(deltaMs) <= 5 * 60_000 ? "text-green-700 bg-green-50" : deltaMs > 0 ? "text-amber-700 bg-amber-50" : "text-blue-700 bg-blue-50";
                const accuracy = Number(record.arrivalGpsAccuracyMeters);
                const accuracyText = Number.isFinite(accuracy) && accuracy > 0 ? `±${Math.round(accuracy)} m` : "Not recorded";
                return `<tr>
                  <td class="px-4 py-3 font-semibold text-gray-900">${esc(record.stopName || "Bus stop")}</td>
                  <td class="px-4 py-3 text-gray-600">${esc(record.trip.routeName || record.trip.routeId || "Route unavailable")}<span class="block text-xs text-gray-400">${esc(record.trip.busCode || record.trip.busId || "Bus unavailable")}</span></td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-600">${formatTime(record.predictedArrivalAt)}</td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-600">${formatTime(record.actualArrivalAt)}</td>
                  <td class="px-4 py-3"><span class="rounded-full px-2.5 py-1 text-xs font-bold ${deltaClass}">${formatMinutes(delta)}</span></td>
                  <td class="px-4 py-3 whitespace-nowrap text-gray-600">${accuracyText}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>` : `
        <div class="px-5 py-12 text-center">
          <p class="font-semibold text-gray-800">No matching arrival measurements</p>
          <p class="mx-auto mt-1 max-w-md text-sm text-gray-500">Completed ETA measurements will appear here after trips record predictions and GPS arrivals.</p>
        </div>`}
    </div>`;
}

function renderAnalytics(trips) {
  const records = getEtaRecords(trips);
  const routes = [...new Map(records.map((record) => {
    const id = String(record.trip.routeId || record.trip.routeName || "");
    return [id, { id, label: record.trip.routeName || record.trip.routeId || "Route unavailable" }];
  })).values()].sort((a, b) => a.label.localeCompare(b.label));

  return `
    <section class="space-y-5">
      <div>
        <h2 class="text-xl font-bold text-gray-900">ETA accuracy</h2>
        <p class="mt-1 text-sm text-gray-500">Compare the first recorded arrival estimate with the bus’s GPS arrival at each stop. Summary metrics update with the filters.</p>
      </div>
      <div class="grid grid-cols-1 gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-5">
        <label class="text-xs font-semibold text-gray-600">Search stops, routes, or buses
          <input id="etaSearch" type="search" placeholder="Type to search" class="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900 outline-none focus:border-blue-500">
        </label>
        <label class="text-xs font-semibold text-gray-600">Route
          <select id="etaRouteFilter" class="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"><option value="">All routes</option>${routes.map((route) => `<option value="${esc(route.id)}">${esc(route.label)}</option>`).join("")}</select>
        </label>
        <label class="text-xs font-semibold text-gray-600">Arrival date
          <select id="etaDateFilter" class="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"><option value="all">All dates</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>
        </label>
        <label class="text-xs font-semibold text-gray-600">Timing
          <select id="etaTimingFilter" class="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"><option value="all">Any timing</option><option value="on-time">Within 5 minutes</option><option value="late">More than 5 min late</option><option value="early">More than 5 min early</option></select>
        </label>
        <label class="text-xs font-semibold text-gray-600">Prediction GPS quality
          <select id="etaAccuracyFilter" class="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-normal text-gray-900"><option value="all">All measurements</option><option value="reliable">Prediction fix ≤ 100 m</option><option value="unverified">Prediction fix unverified</option></select>
        </label>
      </div>
      <div id="etaAnalyticsResults" class="space-y-5"></div>
    </section>`;
}

function updateAnalyticsResults(root) {
  const results = root.querySelector("#etaAnalyticsResults");
  if (results) results.innerHTML = renderResults(getFilteredRecords());
}

window.Pages.etaAnalytics = () => `
  <div id="etaAnalyticsContent" class="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">Loading ETA analytics…</div>`;

window.initEtaAnalyticsPage = async () => {
  const root = document.getElementById("etaAnalyticsContent");
  if (!root) return;
  try {
    etaTrips = await getTripsRepo();
    root.innerHTML = renderAnalytics(etaTrips);
    root.querySelectorAll("#etaSearch, #etaRouteFilter, #etaDateFilter, #etaTimingFilter, #etaAccuracyFilter").forEach((control) => {
      control.addEventListener(control.id === "etaSearch" ? "input" : "change", () => updateAnalyticsResults(root));
    });
    updateAnalyticsResults(root);
  } catch (error) {
    console.error("Failed to load ETA analytics:", error);
    root.innerHTML = `<div class="py-10 text-center"><p class="font-semibold text-gray-800">Couldn’t load ETA analytics</p><p class="mt-1 text-sm text-gray-500">Check the connection and try opening this page again.</p></div>`;
  }
};
