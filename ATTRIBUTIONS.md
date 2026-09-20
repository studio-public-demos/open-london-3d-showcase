# Attributions

## Geographic Data

### OpenStreetMap
- **Data**: Building footprints, road centerlines, water features, tree locations
- **Source**: OpenStreetMap via Overpass API (overpass-api.de, overpass.kumi.systems, maps.mail.ru)
- **Licence**: Open Database Licence (ODbL) 1.0
- **Attribution**: © OpenStreetMap contributors
- **Website**: https://www.openstreetmap.org/copyright

### Building Height Data
- **Primary Source**: OpenStreetMap tags (`height`, `building:levels`)
- **Fallback Estimation**: Building-type and tag-based inference (documented per building)
- **Unavailable Source**: Environment Agency LiDAR (deferred due to processing infrastructure requirements)
- **Licence**: ODbL 1.0 (OSM data)

## Software Libraries

| Library | Version | Licence | Website |
|---------|---------|---------|---------|
| MapLibre GL JS | 6.10 | BSD-3-Clause | https://maplibre.org |
| Three.js | 0.186 | MIT | https://threejs.org |
| Vite | 8.3 | MIT | https://vite.dev |

## Routing

- **Engine**: Open Source Routing Machine (OSRM)
- **Profile**: Driving
- **Input data**: OpenStreetMap
- **Generated output**: `data/processed/navigation-route.json`
- **Website**: https://project-osrm.org

## Map Tiles

- **Provider**: OpenStreetMap
- **Tile URL**: https://tile.openstreetmap.org/{z}/{x}/{y}.png
- **Licence**: ODbL 1.0
- **Attribution**: © OpenStreetMap contributors

## Dataset Evaluation

Seven candidate open datasets were evaluated for this project:

1. **Environment Agency National LiDAR Programme** — Preferred height source; deferred pending local infrastructure
2. **OpenStreetMap** — Primary footprint and height source; integrated
3. **Overture Maps Foundation** — Potential supplementary height source; not yet integrated
4. **GlobalBuildingAtlas LoD1** — Evaluated; UK coverage gaps
5. **HoliCity London** — Evaluated; non-commercial licence
6. **Greater London Authority Tree Data** — Evaluated; deferred
7. **Ordnance Survey OpenMap Local** — Evaluated; no height data

Full evaluation available in the project documentation.

## Platform

Built with **NebulaCloud Studio** — https://nebulacloud.studio
