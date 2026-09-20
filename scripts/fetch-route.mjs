import fs from "node:fs/promises";

const waypoints = [
  [-0.1221, 51.5008],
  [-0.12713, 51.50075],
  [-0.1264, 51.5037],
  [-0.1278, 51.5077],
];
const coordinates = waypoints.map((point) => point.join(",")).join(";");
const endpoint = `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=true`;
const response = await fetch(endpoint);
if (!response.ok) throw new Error(`OSRM route request failed: ${response.status}`);

const result = await response.json();
if (result.code !== "Ok" || !result.routes?.[0]) {
  throw new Error(`OSRM did not return a route: ${result.code}`);
}

const route = result.routes[0];
let cumulativeDistance = 0;
const steps = route.legs.flatMap((leg) =>
  leg.steps.map((step) => {
    const normalized = {
      distance: step.distance,
      duration: step.duration,
      startDistance: cumulativeDistance,
      name: step.name || "",
      maneuver: {
        type: step.maneuver.type,
        modifier: step.maneuver.modifier || "",
        location: step.maneuver.location,
        bearingBefore: step.maneuver.bearing_before,
        bearingAfter: step.maneuver.bearing_after,
      },
    };
    cumulativeDistance += step.distance;
    return normalized;
  }),
);

const output = {
  name: "Westminster Bridge to Trafalgar Square via Whitehall",
  profile: "OSRM driving",
  generatedAt: new Date().toISOString(),
  waypoints,
  distance: route.distance,
  duration: route.duration,
  geometry: route.geometry,
  steps,
};

await fs.writeFile(
  new URL("../data/processed/navigation-route.json", import.meta.url),
  `${JSON.stringify(output, null, 2)}\n`,
);
console.log(`Route: ${Math.round(route.distance)} m, ${Math.round(route.duration)} s, ${steps.length} steps`);
