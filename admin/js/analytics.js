import { getTripsRepo } from "../../shared/js/repositories/trips.repo.js";

const esc = (value) => window.escapeHtml(value ?? "");
const minutes = (value) => `${value > 0 ? "+" : ""}${value} min`;

function asMillis(value) {
  if (typeof value === "number") return value;
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTime(value) {
  const timestamp = asMillis(value);
  return timestamp
    ? new Date(timestamp).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })
    : "—";
}

function renderAnalytics(trips) {
  const records = trips.flatMap((trip) =>
    (Array.isArray(trip.stopEtaAnalytics) ? trip.stopEtaAnalytics : [])
      .filter((entry) => Number.isFinite(asMillis(entry.predictedArrivalAt)) && Number.isFinite(asMillis(entry.actualArrivalAt)))
      .map((entry) => ({ ...entry, trip }))
  ).sort((a, b) => asMillis(b.actualArrivalAt) - asMillis(a.actualArrivalAt));

  const differences = records.map((record) => Math.round(
    (asMillis(record.actualArrivalAt) - asMillis(record.predictedArrivalAt)) / 60_000
  ));
  const avgAbsError = differences.length
    ? Math.round(differences.reduce((sum, value) => sum + Math.abs(value), 0) / differences.length)
    : null;
  const avgOffset = differences.length
    ? Math.round(differences.reduce((sum, value) => sum + value, 0) / differences.length)
    : null;
  const onTimeRate = differences.length
    ? Math.round(differences.filter((value) => Math.abs(value) <= 5).length / differences.length * 100)
    : null;

  const metric = (label, value, note) => `
    <article class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
      <p class="text-xs font-semibold uppercase tracking-wide text-gray-500">${label}</p>
      <p class="mt-2 text-2xl font-bold text-gray-900">${value}</p>
      <p class="mt-1 text-xs text-gray-500">${note}</p>
    </article>`;

  return `
    <section class="space-y-5">
      <div>
        <h2 class="text-xl font-bold text-gray-900">ETA accuracy</h2>
        <p class="mt-1 text-sm text-gray-500">Compare the first recorded arrival estimate with the bus’s GPS arrival at each stop.</p>
      </div>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        ${metric("Stops measured", records.length, "Stops with both an ETA and GPS arrival")}
        ${metric("Average ETA error", avgAbsError === null ? "—" : `${avgAbsError} min`, "Average absolute difference")}
        ${metric("Average timing", avgOffset === null ? "—" : minutes(avgOffset), "Late (+) or early (−) versus estimate")}
        ${metric("Within 5 minutes", onTimeRate === null ? "—" : `${onTimeRate}%`, "Share of measured stop arrivals")}
      </div>
      <div class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div class="border-b border-gray-100 px-4 py-4 sm:px-5">
          <h3 class="font-bold text-gray-900">Stop arrival comparison</h3>
          <p class="mt-1 text-xs text-gray-500">${records.length ? `Showing ${Math.min(records.length, 100)} most recent completed stop measurements` : "New trips will appear here after buses record stop arrivals."}</p>
        </div>
        ${records.length ? `
          <div class="overflow-x-auto">
            <table class="w-full min-w-[760px] text-left text-sm">
              <thead class="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                <tr><th class="px-4 py-3">Stop</th><th class="px-4 py-3">Route / bus</th><th class="px-4 py-3">Expected</th><th class="px-4 py-3">Actual</th><th class="px-4 py-3">Difference</th></tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                ${records.slice(0, 100).map((record, index) => {
                  const delta = differences[index];
                  const deltaLabel = minutes(delta);
                  const deltaClass = Math.abs(delta) <= 5 ? "text-green-700 bg-green-50" : delta > 0 ? "text-amber-700 bg-amber-50" : "text-blue-700 bg-blue-50";
                  return `<tr>
                    <td class="px-4 py-3 font-semibold text-gray-900">${esc(record.stopName || "Bus stop")}</td>
                    <td class="px-4 py-3 text-gray-600">${esc(record.trip.routeName || record.trip.routeId || "Route unavailable")}<span class="block text-xs text-gray-400">${esc(record.trip.busCode || record.trip.busId || "Bus unavailable")}</span></td>
                    <td class="px-4 py-3 whitespace-nowrap text-gray-600">${formatTime(record.predictedArrivalAt)}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-gray-600">${formatTime(record.actualArrivalAt)}</td>
                    <td class="px-4 py-3"><span class="rounded-full px-2.5 py-1 text-xs font-bold ${deltaClass}">${deltaLabel}</span></td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>` : `
          <div class="px-5 py-12 text-center">
            <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
              <svg class="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4 19V5m0 14h17M7 15l4-4 3 2 6-7"/></svg>
            </div>
            <p class="mt-3 font-semibold text-gray-800">No arrival measurements yet</p>
            <p class="mx-auto mt-1 max-w-md text-sm text-gray-500">This page starts collecting ETA comparisons for active trips. Older trips don’t include saved ETA predictions, so they can’t be compared reliably.</p>
          </div>`}
      </div>
    </section>`;
}

window.Pages.etaAnalytics = () => `
  <div id="etaAnalyticsContent" class="rounded-2xl border border-gray-100 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">Loading ETA analytics…</div>`;

window.initEtaAnalyticsPage = async () => {
  const root = document.getElementById("etaAnalyticsContent");
  if (!root) return;
  try {
    root.innerHTML = renderAnalytics(await getTripsRepo());
  } catch (error) {
    console.error("Failed to load ETA analytics:", error);
    root.innerHTML = `<div class="py-10 text-center"><p class="font-semibold text-gray-800">Couldn’t load ETA analytics</p><p class="mt-1 text-sm text-gray-500">Check the connection and try opening this page again.</p></div>`;
  }
};
