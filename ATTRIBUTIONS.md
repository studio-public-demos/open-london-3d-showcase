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
| MapLibre GL JS | 4.7 | BSD-3-Clause | https://maplibre.org |
| Three.js | 0.170 | MIT | https://threejs.org |
| Vite | 6.0 | MIT | https://vitejs.dev |
| TypeScript | 5.6 | Apache 2.0 | https://www.typescriptlang.org |
| Turf.js | 7.0 | MIT | https://turfjs.org |

## Map Tiles

- **Provider**: OpenStreetMap
- **Tile URL**: https://tile.openstreetmap.org/{z}/{x}/{y}.png
- **Licence**: ODbL 1.0
- **Attribution**: © OpenStreetMap contributors

## Landmark References

Landmark models are procedurally constructed from known dimensions and geographic positions sourced from OpenStreetMap.

| Landmark | Height Reference | Data Source |
|----------|-----------------|-------------|
| Elizabeth Tower (Big Ben) | 96 meters | Published architectural reference |
| London Eye | 135 meters | Published architectural reference |
| Nelson's Column | 52 meters | Published architectural reference |
| Houses of Parliament | ~30 meters | OSM building footprint + type inference |

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
