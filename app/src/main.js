import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import * as THREE from "three";
import "./styles.css";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const DATA_ROOT = new URL("data/processed/", document.baseURI);
const files = Object.fromEntries(
  ["buildings", "roads", "water", "trees", "landmarks"].map((name) => [name, new URL(`${name}.${name === "landmarks" ? "json" : "geojson"}`, DATA_ROOT)]),
);
files.route = new URL("navigation-route.json", DATA_ROOT);

const ORIGIN = [-0.1257, 51.5042];
const LIGHTING = {
  day: { raster: [0.08, 1, 0, 0], building: "#aeb8b6", water: "#3b86a4", road: "#a9a28e", route: "#48d9c5", sky: 0xffffff, ground: 0x41504e, hemi: 2.4, sun: 2.8, exposure: 1 },
  dawn: { raster: [0.02, 0.82, -0.15, 18], building: "#b5a79e", water: "#587f91", road: "#a18d7c", route: "#5ce0c5", sky: 0xffc8a6, ground: 0x52636b, hemi: 1.9, sun: 2.2, exposure: 0.88 },
  dusk: { raster: [0, 0.65, -0.28, -12], building: "#8f929a", water: "#3f6477", road: "#827c7d", route: "#65e6cf", sky: 0xd6b1a4, ground: 0x28323f, hemi: 1.35, sun: 1.45, exposure: 0.72 },
  night: { raster: [0, 0.34, -0.48, -22], building: "#45505a", water: "#173b4b", road: "#4f5357", route: "#61ffe0", sky: 0x667799, ground: 0x101820, hemi: 0.72, sun: 0.5, exposure: 0.46 },
};

const $ = (selector) => document.querySelector(selector);
const ui = {
  loading: $("#loading"), loadingLabel: $("#loading-label"), error: $("#error"), play: $("#play"), restart: $("#restart"),
  camera: $("#camera-mode"), lighting: $("#lighting-mode"), playback: $("#playback-speed"), provenance: $("#provenance-toggle"),
  performance: $("#performance-toggle"), performancePanel: $("#performance-panel"), legend: $("#provenance-legend"),
  routeName: $("#route-name"), routeDistance: $("#route-distance"), routeDuration: $("#route-duration"), speed: $("#speed"),
  travelled: $("#travelled"), eta: $("#eta"), progress: $(".progress-track"), progressBar: $("#progress-bar"),
  maneuverIcon: $("#maneuver-icon"), maneuverDistance: $("#maneuver-distance"), maneuverRoad: $("#maneuver-road"),
  fps: $("#metric-fps"), frame: $("#metric-frame"), draws: $("#metric-draws"), triangles: $("#metric-triangles"),
  zoom: $("#metric-zoom"), features: $("#metric-features"),
};

const state = {
  route: null, coordinates: [], cumulative: [], geometryLength: 0, elapsed: 0, running: false, playback: 1,
  cameraMode: "overview", lighting: "day", lastFrame: performance.now(), sceneLayer: null, currentPosition: null,
  currentHeading: 0, orbitBearing: 20, frameSamples: [], featureCount: 0,
};

const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "© OpenStreetMap contributors" } }, layers: [{ id: "osm", type: "raster", source: "osm" }] },
  center: ORIGIN, zoom: 15.4, pitch: 58, bearing: 8, maxPitch: 80, antialias: true, attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

function updateLoading(label) { ui.loadingLabel.textContent = label; }
function showError(message) { ui.error.textContent = message; ui.error.hidden = false; }
async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname}: ${response.status}`);
  return response.json();
}

function addGeoData(buildings, roads, water, trees, route) {
  map.addSource("water-data", { type: "geojson", data: water });
  map.addLayer({ id: "water-fill", type: "fill", source: "water-data", paint: { "fill-color": "#3b86a4", "fill-opacity": 0.72 } });
  map.addSource("roads-data", { type: "geojson", data: roads });
  map.addLayer({
    id: "road-overlay", type: "line", source: "roads-data",
    filter: ["in", ["get", "highway"], ["literal", ["primary", "secondary", "tertiary", "residential", "service"]]],
    paint: { "line-color": ["match", ["get", "highway"], "primary", "#d8c99b", "secondary", "#c7bd9f", "#9f9b8c"], "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, ["match", ["get", "highway"], "primary", 8, "secondary", 6, 3]], "line-opacity": 0.72 },
  });
  map.addSource("buildings-data", { type: "geojson", data: buildings });
  map.addLayer({ id: "buildings-3d", type: "fill-extrusion", source: "buildings-data", minzoom: 13, paint: { "fill-extrusion-color": "#aeb8b6", "fill-extrusion-height": ["coalesce", ["to-number", ["get", "height"]], 10], "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.82, "fill-extrusion-vertical-gradient": true } });
  map.addSource("trees-data", { type: "geojson", data: trees });
  map.addLayer({ id: "trees", type: "circle", source: "trees-data", minzoom: 15, paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 1.5, 19, 5], "circle-color": "#3d7c57", "circle-stroke-color": "#1d4b35", "circle-stroke-width": 1 } });
  map.addSource("navigation-route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: route.geometry } });
  map.addLayer({ id: "route-casing", type: "line", source: "navigation-route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#102b29", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 5, 18, 12], "line-opacity": 0.88 } });
  map.addLayer({ id: "route-line", type: "line", source: "navigation-route", layout: { "line-join": "round", "line-cap": "round" }, paint: { "line-color": "#48d9c5", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2, 18, 7] } });
  state.featureCount = [buildings, roads, water, trees].reduce((sum, data) => sum + data.features.length, 0);
  ui.features.textContent = `${state.featureCount.toLocaleString()} features`;
}

function mercatorOffset(coordinate, originMercator, scale, altitude = 0) {
  const point = maplibregl.MercatorCoordinate.fromLngLat(coordinate, altitude);
  return new THREE.Vector3((point.x - originMercator.x) / scale, (point.z - originMercator.z) / scale, (point.y - originMercator.y) / scale);
}

function createVehicle() {
  const car = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color: 0xe84855, metalness: 0.55, roughness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x171d20, metalness: 0.2, roughness: 0.65 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x65a9bc, metalness: 0.35, roughness: 0.12 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.56, 4.25), paint); body.position.y = 0.69; car.add(body);
  const bonnet = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.25, 1.15), paint); bonnet.position.set(0, 0.96, -1.48); car.add(bonnet);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.66, 2.02), glass); cabin.position.set(0, 1.26, 0.18); car.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.1, 1.58), paint); roof.position.set(0, 1.63, 0.2); car.add(roof);
  const wheelGeometry = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 20); car.userData.wheels = [];
  for (const [x, z] of [[-0.98, -1.3], [0.98, -1.3], [-0.98, 1.3], [0.98, 1.3]]) {
    const wheel = new THREE.Mesh(wheelGeometry, trim); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.4, z); car.add(wheel); car.userData.wheels.push(wheel);
  }
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2b2, emissive: 0xffdc75, emissiveIntensity: 1.8 });
  const tailMaterial = new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0xd80016, emissiveIntensity: 1.25 });
  for (const x of [-0.62, 0.62]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.07), headMaterial); head.position.set(x, 0.72, -2.16); car.add(head);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.15, 0.07), tailMaterial); tail.position.set(x, 0.72, 2.16); car.add(tail);
  }
  car.scale.setScalar(1.2);
  return car;
}

function landmarkMaterial(color, emissive = 0) { return new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 0.35, metalness: 0.18, roughness: 0.72 }); }

function createLandmark(definition) {
  const group = new THREE.Group();
  if (definition.type === "elizabeth_tower") {
    const stone = landmarkMaterial(0xb9a36d, 0x2b2108);
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(11, 70, 11), stone); shaft.position.y = 35; group.add(shaft);
    const clock = new THREE.Mesh(new THREE.BoxGeometry(13.5, 13, 13.5), landmarkMaterial(0xd1b96d, 0x49370b)); clock.position.y = 75; group.add(clock);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(8.8, 15, 4), landmarkMaterial(0x5e6d63)); spire.position.y = 89; spire.rotation.y = Math.PI / 4; group.add(spire);
  } else if (definition.type === "london_eye") {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(67.5, 1.15, 10, 80), landmarkMaterial(0xdde8e7, 0x394949)); rim.rotation.y = Math.PI / 2; rim.position.y = 70; group.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 8, 16), landmarkMaterial(0x8b9da0)); hub.rotation.z = Math.PI / 2; hub.position.y = 70; group.add(hub);
    for (const x of [-10, 10]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.8, 72, 12), landmarkMaterial(0xb8c5c6)); leg.position.set(x, 33, 0); leg.rotation.z = x < 0 ? -0.2 : 0.2; group.add(leg); }
  } else if (definition.type === "nelsons_column") {
    const stone = landmarkMaterial(0xb8b3a3, 0x26241e);
    const base = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 10), stone); base.position.y = 2.5; group.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.8, 42, 20), stone); column.position.y = 26; group.add(column);
    const capital = new THREE.Mesh(new THREE.BoxGeometry(5.5, 2.4, 5.5), stone); capital.position.y = 48; group.add(capital);
    const statue = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 3, 6, 10), landmarkMaterial(0x59645b)); statue.position.y = 52; group.add(statue);
  } else {
    const stone = landmarkMaterial(0xaa966f, 0x241b0b);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(92, 27, 25), stone); hall.position.y = 13.5; group.add(hall);
    for (const x of [-39, -13, 13, 39]) { const turret = new THREE.Mesh(new THREE.BoxGeometry(7, 36, 7), stone); turret.position.set(x, 18, 0); group.add(turret); const cap = new THREE.Mesh(new THREE.ConeGeometry(5, 9, 4), landmarkMaterial(0x5d695f)); cap.position.set(x, 40.5, 0); cap.rotation.y = Math.PI / 4; group.add(cap); }
  }
  group.userData.type = definition.type;
  return group;
}

function createSceneLayer(initialCoordinate, landmarks) {
  return {
    id: "london-scene-3d", type: "custom", renderingMode: "3d", coordinate: initialCoordinate, heading: 0, wheelTravel: 0,
    onAdd(mapInstance, gl) {
      this.map = mapInstance; this.camera = new THREE.Camera(); this.scene = new THREE.Scene();
      this.originMercator = maplibregl.MercatorCoordinate.fromLngLat(ORIGIN, 0); this.scale = this.originMercator.meterInMercatorCoordinateUnits();
      this.hemi = new THREE.HemisphereLight(); this.sun = new THREE.DirectionalLight(); this.sun.position.set(-80, 180, 110); this.scene.add(this.hemi, this.sun);
      this.vehicle = createVehicle(); this.scene.add(this.vehicle);
      for (const definition of landmarks) { const landmark = createLandmark(definition); landmark.position.copy(mercatorOffset(definition.center, this.originMercator, this.scale)); this.scene.add(landmark); }
      this.renderer = new THREE.WebGLRenderer({ canvas: mapInstance.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false; this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.setLighting(state.lighting); this.setVehicle(initialCoordinate, 0, 0);
    },
    setVehicle(coordinate, heading, travelledDelta = 0) {
      this.coordinate = coordinate; this.heading = heading; this.wheelTravel += travelledDelta;
      if (!this.vehicle || !this.originMercator) return;
      this.vehicle.position.copy(mercatorOffset(coordinate, this.originMercator, this.scale, 0.45)); this.vehicle.rotation.y = (-heading * Math.PI) / 180;
      for (const wheel of this.vehicle.userData.wheels) wheel.rotation.x = this.wheelTravel / 0.38;
    },
    setLighting(mode) {
      const preset = LIGHTING[mode]; if (!preset || !this.hemi) return;
      this.hemi.color.setHex(preset.sky); this.hemi.groundColor.setHex(preset.ground); this.hemi.intensity = preset.hemi;
      this.sun.color.setHex(mode === "dawn" ? 0xffc09a : mode === "dusk" ? 0xffa77d : 0xffffff); this.sun.intensity = preset.sun; this.renderer.toneMappingExposure = preset.exposure;
    },
    render(gl, args) {
      const translation = new THREE.Matrix4().makeTranslation(this.originMercator.x, this.originMercator.y, this.originMercator.z);
      const scaling = new THREE.Matrix4().makeScale(this.scale, -this.scale, this.scale); const rotateToMap = new THREE.Matrix4().makeRotationX(Math.PI / 2);
      const model = translation.multiply(scaling).multiply(rotateToMap);
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(model);
      this.renderer.resetState(); this.renderer.render(this.scene, this.camera); this.map.triggerRepaint();
    },
    onRemove() { this.renderer?.dispose(); },
  };
}

function haversine(a, b) {
  const toRad = Math.PI / 180; const dLat = (b[1] - a[1]) * toRad; const dLon = (b[0] - a[0]) * toRad; const lat1 = a[1] * toRad; const lat2 = b[1] * toRad;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function prepareRoute(route) {
  state.route = route; state.coordinates = route.geometry.coordinates; state.cumulative = [0];
  for (let i = 1; i < state.coordinates.length; i += 1) state.cumulative.push(state.cumulative.at(-1) + haversine(state.coordinates[i - 1], state.coordinates[i]));
  state.geometryLength = state.cumulative.at(-1); ui.routeName.textContent = route.name; ui.routeDistance.textContent = (route.distance / 1000).toFixed(1); ui.routeDuration.textContent = Math.ceil(route.duration / 60);
}

function bearing(a, b) {
  const toRad = Math.PI / 180; const lat1 = a[1] * toRad; const lat2 = b[1] * toRad; const dLon = (b[0] - a[0]) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2); const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function positionAtDistance(distance) {
  const geometryDistance = Math.min(state.geometryLength, (distance / state.route.distance) * state.geometryLength); let low = 0; let high = state.cumulative.length - 1;
  while (low < high - 1) { const middle = Math.floor((low + high) / 2); if (state.cumulative[middle] < geometryDistance) low = middle; else high = middle; }
  const a = state.coordinates[low]; const b = state.coordinates[high]; const segment = state.cumulative[high] - state.cumulative[low]; const t = segment ? (geometryDistance - state.cumulative[low]) / segment : 0;
  return { coordinate: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], heading: bearing(a, b) };
}

function formatTime(seconds) { const rounded = Math.max(0, Math.ceil(seconds)); return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`; }
function maneuverIcon(step) { const modifier = step?.maneuver.modifier || ""; if (modifier.includes("left")) return "↰"; if (modifier.includes("right")) return "↱"; return step?.maneuver.type === "arrive" ? "●" : "↑"; }

function updateHud(distance) {
  const progress = Math.min(1, distance / state.route.distance); const roadSpeedMps = state.route.distance / state.route.duration;
  ui.speed.textContent = state.running && progress < 1 ? String(Math.round(roadSpeedMps * 2.23694)) : "0"; ui.travelled.textContent = `${(distance / 1000).toFixed(1)} km`;
  ui.eta.textContent = formatTime(state.route.duration * (1 - progress)); ui.progressBar.style.width = `${progress * 100}%`; ui.progress.setAttribute("aria-valuenow", String(Math.round(progress * 100)));
  const next = state.route.steps.find((step) => step.startDistance + step.distance > distance + 4) || state.route.steps.at(-1); const remaining = Math.max(0, next.startDistance - distance);
  ui.maneuverIcon.textContent = maneuverIcon(next); ui.maneuverDistance.textContent = remaining < 10 ? "NOW" : `${Math.round(remaining / 10) * 10} m`; ui.maneuverRoad.textContent = next.name || (next.maneuver.type === "arrive" ? "Trafalgar Square" : "Continue");
}

function updateCamera(coordinate, heading, delta = 0) {
  if (state.cameraMode === "overview") return;
  if (state.cameraMode === "orbit") state.orbitBearing = (state.orbitBearing + delta * 7) % 360;
  const modes = {
    chase: { bearing: heading, pitch: 66, zoom: 18.5, offset: [0, 110] }, driver: { bearing: heading, pitch: 78, zoom: 19.3, offset: [0, 220] },
    orbit: { bearing: state.orbitBearing, pitch: 65, zoom: 17.6, offset: [0, 25] }, pedestrian: { bearing: heading + 88, pitch: 74, zoom: 19.2, offset: [-150, 85] },
  };
  map.easeTo({ center: coordinate, ...modes[state.cameraMode], duration: 0 });
}

function fitOverview(duration = 700) {
  const bounds = state.coordinates.reduce((box, coordinate) => box.extend(coordinate), new maplibregl.LngLatBounds(state.coordinates[0], state.coordinates[0]));
  map.fitBounds(bounds, { padding: { top: 100, right: 90, bottom: 110, left: 90 }, pitch: 56, bearing: 5, duration });
}

function resetView() {
  state.elapsed = 0; state.running = false; ui.play.textContent = "Start drive"; const position = positionAtDistance(0);
  state.currentPosition = position.coordinate; state.currentHeading = position.heading; state.sceneLayer.setVehicle(position.coordinate, position.heading); updateHud(0);
  if (state.cameraMode === "overview") fitOverview(); else updateCamera(position.coordinate, position.heading);
}

function setLighting(mode) {
  state.lighting = mode; const preset = LIGHTING[mode];
  map.setPaintProperty("osm", "raster-brightness-min", preset.raster[0]); map.setPaintProperty("osm", "raster-brightness-max", preset.raster[1]);
  map.setPaintProperty("osm", "raster-saturation", preset.raster[2]); map.setPaintProperty("osm", "raster-hue-rotate", preset.raster[3]);
  map.setPaintProperty("water-fill", "fill-color", preset.water); map.setPaintProperty("road-overlay", "line-color", preset.road); map.setPaintProperty("route-line", "line-color", preset.route);
  if (ui.provenance.getAttribute("aria-pressed") !== "true") map.setPaintProperty("buildings-3d", "fill-extrusion-color", preset.building);
  state.sceneLayer?.setLighting(mode); document.documentElement.dataset.lighting = mode;
}

function setProvenance(enabled) {
  ui.provenance.setAttribute("aria-pressed", String(enabled)); ui.legend.hidden = !enabled;
  map.setPaintProperty("buildings-3d", "fill-extrusion-color", enabled ? ["match", ["get", "height_source"], "osm_height", "#41b883", "osm_levels", "#4d9de0", "tag_inference", "#f4b942", "type_estimate", "#ef8354", "#8d99ae"] : LIGHTING[state.lighting].building);
}

function updateMetrics(delta) {
  state.frameSamples.push(delta * 1000); if (state.frameSamples.length > 30) state.frameSamples.shift();
  const average = state.frameSamples.reduce((sum, value) => sum + value, 0) / state.frameSamples.length;
  ui.frame.textContent = average.toFixed(1); ui.fps.textContent = String(Math.round(1000 / average)); ui.zoom.textContent = map.getZoom().toFixed(1);
  const info = state.sceneLayer?.renderer?.info.render; ui.draws.textContent = info ? info.calls.toLocaleString() : "--"; ui.triangles.textContent = info ? info.triangles.toLocaleString() : "--";
}

function frame(now) {
  const delta = Math.min(0.1, (now - state.lastFrame) / 1000); state.lastFrame = now;
  if (state.running && state.route) {
    const previousDistance = (state.elapsed / state.route.duration) * state.route.distance; state.elapsed = Math.min(state.route.duration, state.elapsed + delta * state.playback);
    const distance = (state.elapsed / state.route.duration) * state.route.distance; const position = positionAtDistance(distance);
    state.currentPosition = position.coordinate; state.currentHeading = position.heading; state.sceneLayer.setVehicle(position.coordinate, position.heading, distance - previousDistance);
    updateHud(distance); if (state.elapsed >= state.route.duration) { state.running = false; ui.play.textContent = "Start drive"; }
  }
  if (state.currentPosition) updateCamera(state.currentPosition, state.currentHeading, delta); updateMetrics(delta); requestAnimationFrame(frame);
}

ui.play.addEventListener("click", () => { if (state.elapsed >= state.route.duration) state.elapsed = 0; state.running = !state.running; ui.play.textContent = state.running ? "Pause" : "Resume"; });
ui.restart.addEventListener("click", resetView);
ui.camera.addEventListener("change", () => { state.cameraMode = ui.camera.value; if (state.cameraMode === "overview") fitOverview(); else updateCamera(state.currentPosition, state.currentHeading); });
ui.lighting.addEventListener("change", () => setLighting(ui.lighting.value));
ui.playback.addEventListener("change", () => { state.playback = Number(ui.playback.value); });
ui.provenance.addEventListener("click", () => setProvenance(ui.provenance.getAttribute("aria-pressed") !== "true"));
ui.performance.addEventListener("click", () => { const enabled = ui.performance.getAttribute("aria-pressed") !== "true"; ui.performance.setAttribute("aria-pressed", String(enabled)); ui.performancePanel.hidden = !enabled; });

map.once("load", async () => {
  try {
    updateLoading("Loading Westminster corridor...");
    const [buildings, roads, water, trees, route, landmarks] = await Promise.all([files.buildings, files.roads, files.water, files.trees, files.route, files.landmarks].map(loadJson));
    addGeoData(buildings, roads, water, trees, route); prepareRoute(route); state.sceneLayer = createSceneLayer(route.geometry.coordinates[0], landmarks); map.addLayer(state.sceneLayer);
    setLighting("day"); resetView(); ui.loading.classList.add("hidden"); requestAnimationFrame(frame);
  } catch (error) { console.error(error); ui.loading.classList.add("hidden"); showError(`Unable to load the corridor: ${error.message}`); }
});
