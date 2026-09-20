import fs from "node:fs/promises";

const [route, roads] = await Promise.all([
  fs.readFile(new URL("../data/processed/navigation-route.json", import.meta.url), "utf8").then(JSON.parse),
  fs.readFile(new URL("../data/processed/roads.geojson", import.meta.url), "utf8").then(JSON.parse),
]);

const stepDistance = route.steps.reduce((sum, step) => sum + step.distance, 0);
const stepDuration = route.steps.reduce((sum, step) => sum + step.duration, 0);
if (Math.abs(stepDistance - route.distance) > 1) {
  throw new Error(`Route and step distance differ by ${Math.abs(stepDistance - route.distance).toFixed(1)} m`);
}
if (Math.abs(stepDuration - route.duration) > 1) {
  throw new Error(`Route and step duration differ by ${Math.abs(stepDuration - route.duration).toFixed(1)} s`);
}

const requiredRoads = ["Westminster Bridge", "Bridge Street", "Parliament Square", "Whitehall"];
const routeRoads = new Set(route.steps.map((step) => step.name));
for (const road of requiredRoads) {
  if (!routeRoads.has(road)) throw new Error(`Generated route does not use ${road}`);
}

const driveable = new Set([
  "motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential",
  "living_street", "service", "motorway_link", "trunk_link", "primary_link", "secondary_link",
  "tertiary_link",
]);
const radius = 6371000;
const latitude = 51.504 * (Math.PI / 180);
const project = ([lon, lat]) => [
  radius * lon * (Math.PI / 180) * Math.cos(latitude),
  radius * lat * (Math.PI / 180),
];
const segmentDistance = (point, a, b) => {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const denominator = vx * vx + vy * vy;
  const t = denominator
    ? Math.max(0, Math.min(1, ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / denominator))
    : 0;
  return Math.hypot(point[0] - (a[0] + t * vx), point[1] - (a[1] + t * vy));
};
const segments = roads.features.flatMap((feature) => {
  if (!driveable.has(feature.properties?.highway) || feature.geometry.type !== "LineString") return [];
  const coordinates = feature.geometry.coordinates.map(project);
  return coordinates.slice(1).map((point, index) => [coordinates[index], point]);
});
const offsets = route.geometry.coordinates.map((coordinate) => {
  const point = project(coordinate);
  return Math.min(...segments.map(([a, b]) => segmentDistance(point, a, b)));
});
const meanOffset = offsets.reduce((sum, offset) => sum + offset, 0) / offsets.length;
const maxOffset = Math.max(...offsets);
if (meanOffset > 5 || maxOffset > 35) {
  throw new Error(`Route fit failed: mean ${meanOffset.toFixed(1)} m, max ${maxOffset.toFixed(1)} m`);
}

console.log(
  `Validated ${route.distance.toFixed(1)} m route: steps ${stepDistance.toFixed(1)} m, ` +
  `mean road offset ${meanOffset.toFixed(1)} m, max ${maxOffset.toFixed(1)} m`,
);
