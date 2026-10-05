const DEFAULT_SPEED_KMH = 18;
const ROAD_DISTANCE_FACTOR = 1.25;
const MAX_LOCATION_AGE_MS = 120000;

function coordinate(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

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
  const distanceKm = getDistanceKm(bus, stop);
  const locationTimestamp = getLocationTimestamp(bus?.locationUpdatedAt);

  if (distanceKm === null) {
    return { label: "Waiting for live location", detail: "Bus location unavailable", minutes: null };
  }

  if (
    locationTimestamp === null ||
    now - locationTimestamp > MAX_LOCATION_AGE_MS
  ) {
    return { label: "Waiting for live location", detail: "Last bus location is outdated", minutes: null };
  }

  if (distanceKm <= 0.12) {
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