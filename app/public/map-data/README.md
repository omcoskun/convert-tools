# Local reference map data

These files are compact derivatives of the public-domain
[Natural Earth Vector](https://github.com/nvkelso/natural-earth-vector)
datasets, retrieved on 2026-07-29:

- `ne_10m_admin_0_boundary_lines_land.geojson`
- `ne_10m_admin_0_label_points.geojson`
- `ne_10m_populated_places_simple.geojson`

Only country labels, populated places with `scalerank <= 3`, boundary lines
with `SCALERANK <= 3`, and the properties needed by the renderer are retained.
The map loads these files locally and does not send the viewed extent to a
tile provider.
