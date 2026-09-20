import * as maplibregl from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import * as THREE from "three";
import "./styles.css";

maplibregl.setWorkerUrl(maplibreWorkerUrl);

const DATA_ROOT = new URL("data/processed/", document.baseURI);
const files = {
  buildings: new URL("buildings.geojson", DATA_ROOT),
  roads: new URL("roads.geojson", DATA_ROOT),
  water: new URL("water.geojson", DATA_ROOT),
  trees: new URL("trees.geojson", DATA_ROOT),
  route: new URL("navigation-route.json", DATA_ROOT),
};

const $ = (selector) => document.querySelector(selector);
const ui = {
  loading: $("#loading"),
  loadingLabel: $("#loading-label"),
  error: $("#error"),
  play: $("#play"),
  restart: $("#restart"),
  camera: $("#camera-mode"),
  playback: $("#playback-speed"),
  provenance: $("#provenance-toggle"),
  legend: $("#provenance-legend"),
  routeName: $("#route-name"),
  routeDistance: $("#route-distance"),
  routeDuration: $("#route-duration"),
  speed: $("#speed"),
  travelled: $("#travelled"),
  eta: $("#eta"),
  progress: $(".progress-track"),
  progressBar: $("#progress-bar"),
  maneuverIcon: $("#maneuver-icon"),
  maneuverDistance: $("#maneuver-distance"),
  maneuverRoad: $("#maneuver-road"),
};

const state = {
  route: null,
  coordinates: [],
  cumulative: [],
  geometryLength: 0,
  elapsed: 0,
  running: false,
  playback: 1,
  cameraMode: "overview",
  lastFrame: performance.now(),
  vehicleLayer: null,
};

const map = new maplibregl.Map({
  container: "map",
  style: {
    version: 8,
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "© OpenStreetMap contributors",
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  },
  center: [-0.1257, 51.5042],
  zoom: 15.4,
  pitch: 58,
  bearing: 8,
  maxPitch: 80,
  antialias: true,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

function updateLoading(label) {
  ui.loadingLabel.textContent = label;
}

function showError(message) {
  ui.error.textContent = message;
  ui.error.hidden = false;
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname}: ${response.status}`);
  return response.json();
}

function addGeoData(buildings, roads, water, trees, route) {
  map.addSource("water-data", { type: "geojson", data: water });
  map.addLayer({
    id: "water-fill",
    type: "fill",
    source: "water-data",
    paint: { "fill-color": "#3b86a4", "fill-opacity": 0.72 },
  });

  map.addSource("roads-data", { type: "geojson", data: roads });
  map.addLayer({
    id: "road-overlay",
    type: "line",
    source: "roads-data",
    filter: ["in", ["get", "highway"], ["literal", ["primary", "secondary", "tertiary", "residential", "service"]]],
    paint: {
      "line-color": ["match", ["get", "highway"], "primary", "#d8c99b", "secondary", "#c7bd9f", "#9f9b8c"],
      "line-width": ["interpolate", ["linear"], ["zoom"], 14, 1, 18, ["match", ["get", "highway"], "primary", 8, "secondary", 6, 3]],
      "line-opacity": 0.72,
    },
  });

  map.addSource("buildings-data", { type: "geojson", data: buildings });
  map.addLayer({
    id: "buildings-3d",
    type: "fill-extrusion",
    source: "buildings-data",
    minzoom: 13,
    paint: {
      "fill-extrusion-color": "#aeb8b6",
      "fill-extrusion-height": ["coalesce", ["to-number", ["get", "height"]], 10],
      "fill-extrusion-base": 0,
      "fill-extrusion-opacity": 0.82,
      "fill-extrusion-vertical-gradient": true,
    },
  });

  map.addSource("trees-data", { type: "geojson", data: trees });
  map.addLayer({
    id: "trees",
    type: "circle",
    source: "trees-data",
    minzoom: 15,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 15, 1.5, 19, 5],
      "circle-color": "#3d7c57",
      "circle-stroke-color": "#1d4b35",
      "circle-stroke-width": 1,
    },
  });

  map.addSource("navigation-route", {
    type: "geojson",
    data: { type: "Feature", properties: {}, geometry: route.geometry },
  });
  map.addLayer({
    id: "route-casing",
    type: "line",
    source: "navigation-route",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#102b29", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 5, 18, 12], "line-opacity": 0.88 },
  });
  map.addLayer({
    id: "route-line",
    type: "line",
    source: "navigation-route",
    layout: { "line-join": "round", "line-cap": "round" },
    paint: { "line-color": "#48d9c5", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 2, 18, 7] },
  });
}

function haversine(a, b) {
  const toRad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const lat1 = a[1] * toRad;
  const lat2 = b[1] * toRad;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function prepareRoute(route) {
  state.route = route;
  state.coordinates = route.geometry.coordinates;
  state.cumulative = [0];
  for (let i = 1; i < state.coordinates.length; i += 1) {
    state.cumulative.push(state.cumulative.at(-1) + haversine(state.coordinates[i - 1], state.coordinates[i]));
  }
  state.geometryLength = state.cumulative.at(-1);
  ui.routeName.textContent = route.name;
  ui.routeDistance.textContent = (route.distance / 1000).toFixed(1);
  ui.routeDuration.textContent = Math.ceil(route.duration / 60);
}

function positionAtDistance(distance) {
  const geometryDistance = Math.min(state.geometryLength, (distance / state.route.distance) * state.geometryLength);
  let low = 0;
  let high = state.cumulative.length - 1;
  while (low < high - 1) {
    const middle = Math.floor((low + high) / 2);
    if (state.cumulative[middle] < geometryDistance) low = middle;
    else high = middle;
  }
  const a = state.coordinates[low];
  const b = state.coordinates[high];
  const segment = state.cumulative[high] - state.cumulative[low];
  const t = segment ? (geometryDistance - state.cumulative[low]) / segment : 0;
  const coordinate = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const heading = bearing(a, b);
  return { coordinate, heading };
}

function bearing(a, b) {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const lat1 = a[1] * toRad;
  const lat2 = b[1] * toRad;
  const dLon = (b[0] - a[0]) * toRad;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (Math.atan2(y, x) * toDeg + 360) % 360;
}

function createVehicleLayer(initialCoordinate) {
  const layer = {
    id: "vehicle-3d",
    type: "custom",
    renderingMode: "3d",
    coordinate: initialCoordinate,
    heading: 0,
    onAdd(mapInstance, gl) {
      this.map = mapInstance;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x41504e, 2.4));
      const sun = new THREE.DirectionalLight(0xffffff, 2.8);
      sun.position.set(-3, 6, 4);
      this.scene.add(sun);

      const car = new THREE.Group();
      const paint = new THREE.MeshStandardMaterial({ color: 0xe84855, metalness: 0.45, roughness: 0.34 });
      const dark = new THREE.MeshStandardMaterial({ color: 0x182022, metalness: 0.1, roughness: 0.8 });
      const glass = new THREE.MeshStandardMaterial({ color: 0x6fb3c7, metalness: 0.2, roughness: 0.15 });
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.55, 4.2), paint);
      body.position.y = 0.65;
      car.add(body);
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.58, 2.05), glass);
      cabin.position.set(0, 1.17, 0.15);
      car.add(cabin);
      const wheelGeometry = new THREE.CylinderGeometry(0.37, 0.37, 0.26, 18);
      for (const [x, z] of [[-0.96, -1.3], [0.96, -1.3], [-0.96, 1.3], [0.96, 1.3]]) {
        const wheel = new THREE.Mesh(wheelGeometry, dark);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.4, z);
        car.add(wheel);
      }
      const front = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff2b2 }));
      front.position.set(0, 0.67, -2.13);
      car.add(front);
      this.scene.add(car);
      this.renderer = new THREE.WebGLRenderer({ canvas: mapInstance.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
    },
    render(gl, args) {
      const mercator = maplibregl.MercatorCoordinate.fromLngLat(this.coordinate, 0.4);
      const scale = mercator.meterInMercatorCoordinateUnits();
      const translation = new THREE.Matrix4().makeTranslation(mercator.x, mercator.y, mercator.z);
      const scaling = new THREE.Matrix4().makeScale(scale, -scale, scale);
      const rotateToMap = new THREE.Matrix4().makeRotationX(Math.PI / 2);
      const rotateHeading = new THREE.Matrix4().makeRotationY((-this.heading * Math.PI) / 180);
      const model = translation.multiply(scaling).multiply(rotateToMap).multiply(rotateHeading);
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(args.defaultProjectionData.mainMatrix).multiply(model);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
    onRemove() {
      this.renderer?.dispose();
    },
  };
  return layer;
}

function formatTime(seconds) {
  const rounded = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function maneuverIcon(step) {
  const modifier = step?.maneuver.modifier || "";
  if (modifier.includes("left")) return "↰";
  if (modifier.includes("right")) return "↱";
  if (step?.maneuver.type === "arrive") return "●";
  return "↑";
}

function updateHud(distance) {
  const route = state.route;
  const progress = Math.min(1, distance / route.distance);
  const roadSpeedMps = route.distance / route.duration;
  ui.speed.textContent = state.running && progress < 1 ? String(Math.round(roadSpeedMps * 2.23694)) : "0";
  ui.travelled.textContent = `${(distance / 1000).toFixed(1)} km`;
  ui.eta.textContent = formatTime(route.duration * (1 - progress));
  ui.progressBar.style.width = `${progress * 100}%`;
  ui.progress.setAttribute("aria-valuenow", String(Math.round(progress * 100)));

  const next = route.steps.find((step) => step.startDistance + step.distance > distance + 4) || route.steps.at(-1);
  const remaining = Math.max(0, next.startDistance - distance);
  ui.maneuverIcon.textContent = maneuverIcon(next);
  ui.maneuverDistance.textContent = remaining < 10 ? "NOW" : `${Math.round(remaining / 10) * 10} m`;
  ui.maneuverRoad.textContent = next.name || (next.maneuver.type === "arrive" ? "Trafalgar Square" : "Continue");
}

function updateCamera(coordinate, heading) {
  if (state.cameraMode === "overview") return;
  map.easeTo({
    center: coordinate,
    bearing: heading,
    pitch: state.cameraMode === "driver" ? 78 : 66,
    zoom: state.cameraMode === "driver" ? 19.3 : 18.5,
    offset: [0, state.cameraMode === "driver" ? 220 : 110],
    duration: 0,
  });
}

function resetView() {
  state.elapsed = 0;
  state.running = false;
  ui.play.textContent = "Start drive";
  const position = positionAtDistance(0);
  state.vehicleLayer.coordinate = position.coordinate;
  state.vehicleLayer.heading = position.heading;
  updateHud(0);
  const bounds = state.coordinates.reduce(
    (box, coordinate) => box.extend(coordinate),
    new maplibregl.LngLatBounds(state.coordinates[0], state.coordinates[0]),
  );
  map.fitBounds(bounds, { padding: { top: 100, right: 90, bottom: 110, left: 90 }, pitch: 56, bearing: 5, duration: 700 });
}

function frame(now) {
  const delta = Math.min(0.1, (now - state.lastFrame) / 1000);
  state.lastFrame = now;
  if (state.running && state.route) {
    state.elapsed = Math.min(state.route.duration, state.elapsed + delta * state.playback);
    const distance = (state.elapsed / state.route.duration) * state.route.distance;
    const position = positionAtDistance(distance);
    state.vehicleLayer.coordinate = position.coordinate;
    state.vehicleLayer.heading = position.heading;
    updateHud(distance);
    updateCamera(position.coordinate, position.heading);
    if (state.elapsed >= state.route.duration) {
      state.running = false;
      ui.play.textContent = "Start drive";
    }
  }
  requestAnimationFrame(frame);
}

function setProvenance(enabled) {
  ui.provenance.setAttribute("aria-pressed", String(enabled));
  ui.legend.hidden = !enabled;
  map.setPaintProperty(
    "buildings-3d",
    "fill-extrusion-color",
    enabled
      ? ["match", ["get", "height_source"], "osm_height", "#41b883", "osm_levels", "#4d9de0", "tag_inference", "#f4b942", "type_estimate", "#ef8354", "#8d99ae"]
      : "#aeb8b6",
  );
}

ui.play.addEventListener("click", () => {
  if (state.elapsed >= state.route.duration) state.elapsed = 0;
  state.running = !state.running;
  ui.play.textContent = state.running ? "Pause" : "Resume";
});
ui.restart.addEventListener("click", resetView);
ui.camera.addEventListener("change", () => {
  state.cameraMode = ui.camera.value;
  if (state.cameraMode === "overview") resetView();
});
ui.playback.addEventListener("change", () => { state.playback = Number(ui.playback.value); });
ui.provenance.addEventListener("click", () => setProvenance(ui.provenance.getAttribute("aria-pressed") !== "true"));

map.once("load", async () => {
  try {
    updateLoading("Loading Westminster corridor...");
    const [buildings, roads, water, trees, route] = await Promise.all([
      loadJson(files.buildings),
      loadJson(files.roads),
      loadJson(files.water),
      loadJson(files.trees),
      loadJson(files.route),
    ]);
    addGeoData(buildings, roads, water, trees, route);
    prepareRoute(route);
    state.vehicleLayer = createVehicleLayer(route.geometry.coordinates[0]);
    map.addLayer(state.vehicleLayer);
    resetView();
    ui.loading.classList.add("hidden");
    requestAnimationFrame(frame);
  } catch (error) {
    console.error(error);
    ui.loading.classList.add("hidden");
    showError(`Unable to load the corridor: ${error.message}`);
  }
});
