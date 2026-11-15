/**
 * Cities people can say they live in (static/data/cities.json), and which ones count
 * as near each other. Only a city is ever stored, never a precise location, and only
 * if its owner chose one.
 */

const EARTH_RADIUS_KM = 6371;
let loading = null;

/** { radiusKm, cities: [{ id, name, lat, lon }] }, fetched once per page. */
export function loadCities(url = '/static/data/cities.json') {
  loading ??= fetch(url).then((response) => {
    if (!response.ok) throw new Error(`Could not load the city list (HTTP ${response.status}).`);
    return response.json();
  });
  return loading;
}

export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** The ids of every city within radiusKm of `cityId` (including itself), or an empty set. */
export function citiesNear(data, cityId) {
  const home = data.cities.find((city) => city.id === cityId);
  if (!home) return new Set();
  return new Set(data.cities.filter((city) => distanceKm(home, city) <= data.radiusKm).map((city) => city.id));
}

export function cityName(data, cityId) {
  return data?.cities.find((city) => city.id === cityId)?.name ?? '';
}
