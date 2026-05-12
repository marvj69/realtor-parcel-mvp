# Data Source Playbook

This app avoids paid parcel APIs by importing public GIS parcel data county by county.

## Preferred data sources

Use sources in this order:

1. County GIS ArcGIS FeatureServer parcel layer.
2. County downloadable parcel GeoJSON/shapefile.
3. State GIS open-data parcel layer, if available and current.
4. County Equalization/Assessor exports, if legally usable.

## How to identify an ArcGIS FeatureServer parcel layer

1. Search for the county GIS map.
2. Open browser dev tools while the map loads.
3. Search network requests for `FeatureServer`, `MapServer`, `query`, or `parcel`.
4. Find the parcel layer endpoint.
5. Open the layer URL in the browser.
6. Confirm fields and geometry type.
7. Test a query like:

```txt
<layer-url>/query?where=1%3D1&outFields=*&returnGeometry=true&f=geojson&resultRecordCount=10
```

If `f=geojson` does not work, try `f=json` and add conversion support.

## Validation checklist

For each source, document:

```txt
County
State
Provider / office
Source URL
Layer URL
Geometry type
Field names
Date last updated, if available
Terms/disclaimer
Import date
Known limitations
```

## Refresh schedule

Each production source should follow the cadence in
[DATA_REFRESH_SCHEDULE.md](DATA_REFRESH_SCHEDULE.md). Keep refresh metadata in
`config/county-sources.local.json`, including the intended cadence, the last
review date, and any source terms or schema notes. Refreshes are manual until
import-job logging exists.

## Field normalization

Every county may use different attribute names.

Examples:

```txt
Parcel ID: PARCEL_ID, PARCELID, PIN, PARCELNO, PROP_ID
Owner: OWNER, OWNER_NAME, OWNERNAME, TAXPAYER
Site address: SITUS, SITUS_ADDR, PROPERTY_ADDRESS, ADDRESS
Acreage: ACRES, ACREAGE, SHAPE_AREA_ACRES
Land use: LAND_USE, CLASS, PROP_CLASS
```

Keep field mappings in `config/county-sources.local.json`.

The committed Upper Peninsula source starter lives at
`config/upper-peninsula-county-sources.example.json`. Use it with `--config=...`
when fetching or importing those public county layers.

For sources that split a value across several fields, put a nested array in the
candidate list. The importer will concatenate the first nested group with data,
which keeps county-specific address weirdness in config instead of code:

```json
{
  "mailingAddress": [["OWNER_STREET", "OWNER_CITY", "OWNER_STATE", "OWNER_ZIP"], "OWNER_ADDRESS"]
}
```

## Import workflow

```bash
cp config/county-sources.example.json config/county-sources.local.json
# edit source URL, inputFile, and field mappings
npm run parcels:fetch -- --config=config/county-sources.local.json --source=houghton-mi-example
npm run parcels:import -- --config=config/county-sources.local.json --source=houghton-mi-example
```

## Important caution

Some public GIS services permit public viewing but not bulk automated extraction or commercial reuse. Validate terms before importing, especially if expanding beyond a private/internal MVP.
