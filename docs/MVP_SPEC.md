# MVP Specification

## Product name

Working name: **Realtor Parcel MVP**

## User

A local realtor who needs a low-cost map-based tool for parcel context, showing prep, listing research, off-market prospecting, and client discussions.

## Primary problem

National parcel products are useful but expensive. A small local realtor team does not need nationwide coverage at first. They need local parcel lookup, notes, and project organization.

## Core MVP workflow

```txt
Open map
  → pan/search to area
  → click parcel
  → see boundary/details
  → save parcel to project
  → add note/tag
  → later export or review
```

## Initial feature requirements

### Map

- Interactive pan/zoom map.
- Uses MapLibre GL JS.
- Uses a configurable public map style.
- Loads visible parcel boundaries from local PostGIS data.
- Only loads parcel outlines when zoomed in enough.

### Parcel lookup

- Click/tap map point.
- Backend performs point-in-polygon lookup in PostGIS.
- Return a GeoJSON Feature for the selected parcel.
- Highlight selected parcel.

### Parcel details

Show fields when available:

- Parcel ID
- APN
- Owner name
- Site address
- Mailing address
- Acreage
- Land use/class
- Assessed value
- Source county/state
- Provider/source

### Saving

- Save selected parcel to a named project.
- Allow a label/tag.
- Allow a note.

### Data import

- Import GeoJSON FeatureCollections into PostGIS.
- Support ArcGIS FeatureServer fetch when available.
- Normalize county-specific field names.
- Store raw source properties.

## Non-goals for v1

- Nationwide parcel coverage.
- MLS integration.
- Legal survey accuracy.
- Title/zoning opinions.
- Offline mobile support.
- Full CRM.
- Paid parcel provider integration.

## Success criteria

A realtor can use the app to evaluate parcels in a known local market without paying for a national data subscription.
