const DEFAULT_SPEED_KMH = 18;
const ROAD_DISTANCE_FACTOR = 1.25;
export const BUS_LOCATION_LIVE_MAX_AGE_MS = 30000;
export const BUS_LOCATION_STALE_MAX_AGE_MS = 120000;
export const DROPOFF_BUS_RADIUS_METERS = 100;
export const COMMUTER_NEARBY_RADIUS_METERS = 400;

function coordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
//yes yes//
function getLocationTimestamp(value) {
  if (value?.toMillis) return value.toMillis();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }
  return null;
}

export function getDistanceKm(from, to) {
  const fromLat = coordinate(from?.lat ?? from?.latitude);
  const fromLng = coordinate(from?.lng ?? from?.longitude);
  const toLat = coordinate(to?.lat ?? to?.latitude);
  const toLng = coordinate(to?.lng ?? to?.longitude);

  if ([fromLat, fromLng, toLat, toLng].some(value => value === null)) {
    return null;
  }
  if ((fromLat === 0 && fromLng === 0) || (toLat === 0 && toLng === 0)) return null;

  const radians = value => value * Math.PI / 180;
  const latDelta = radians(toLat - fromLat);
  const lngDelta = radians(toLng - fromLng);
  const a =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(radians(fromLat)) *
    Math.cos(radians(toLat)) *
    Math.sin(lngDelta / 2) ** 2;

  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getBusLocationStatus(bus, now = Date.now()) {
  const lat = coordinate(bus?.lat ?? bus?.latitude);
  const lng = coordinate(bus?.lng ?? bus?.longitude);
  const timestamp = getLocationTimestamp(bus?.locationUpdatedAt);
  if (lat === null || lng === null || (lat === 0 && lng === 0) || timestamp === null ||
      (bus?.tripId && bus.locationTripId !== bus.tripId)) {
    return { state: "none", ageMs: null };
  }
  const ageMs = Math.max(0, now - timestamp);
  if (ageMs <= BUS_LOCATION_LIVE_MAX_AGE_MS) return { state: "live", ageMs };
  if (ageMs <= BUS_LOCATION_STALE_MAX_AGE_MS) return { state: "stale", ageMs };
  return { state: "lost", ageMs };
}

export function getNearestStop(location, stops = []) {
  let nearestStop = null;
  let nearestDistance = Infinity;

  stops.forEach((stop) => {
    const distance = getDistanceKm(location, stop);
    if (distance !== null && distance < nearestDistance) {
      nearestStop = stop;
      nearestDistance = distance;
    }
  });

  return nearestStop;
}

export function getEta(bus, stop, now = Date.now()) {
  const locationStatus = getBusLocationStatus(bus, now);
  if (locationStatus.state === "none" || locationStatus.state === "lost") {
    return { label: "Waiting for live location", detail: "Bus location unavailable", minutes: null };
  }
  const distanceKm = getDistanceKm(bus, stop);

  if (distanceKm === null) {
    return { label: "Waiting for live location", detail: "Bus location unavailable", minutes: null };
  }

  if (locationStatus.state === "stale") {
    return { label: "Waiting for live location", detail: "Last bus location is outdated", minutes: null };
  }

  if (distanceKm <= 0.1) {
    return { label: "Arriving now", detail: "Bus is near this stop", minutes: 0 };
  }

  const reportedSpeed = coordinate(bus?.speedKmh);
  const speedKmh = reportedSpeed >= 5 && reportedSpeed <= 80
    ? reportedSpeed
    : DEFAULT_SPEED_KMH;
  const roadDistanceKm = distanceKm * ROAD_DISTANCE_FACTOR;
  const minutes = Math.max(1, Math.ceil(roadDistanceKm / speedKmh * 60));

  return {
    label: `~${minutes} min`,
    detail: `${distanceKm.toFixed(1)} km away · approximate live estimate`,
    minutes,
  };
}
