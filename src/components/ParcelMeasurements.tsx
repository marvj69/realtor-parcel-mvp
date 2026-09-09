import { measurementAcres, measurementFeet, type ParcelMeasurements as Measurements } from "@/lib/parcel-measurements";

export default function ParcelMeasurements({ measurements }: { measurements: Measurements | null }) {
  return (
    <section className="parcel-measurements" aria-label="Calculated parcel measurements">
      <h3 className="section-title">Approximate measurements</h3>
      {measurements ? (
        <>
          <dl className="record-list measurement-facts">
            {[
              ["Calculated acreage", measurementAcres(measurements.acres)],
              ["Boundary perimeter", measurementFeet(measurements.perimeterFeet)],
              ["East–west span", measurementFeet(measurements.eastWestFeet)],
              ["North–south span", measurementFeet(measurements.northSouthFeet)]
            ].map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          <p className="panel-note">
            Calculated automatically from the available GIS boundary. Dimensions are overall compass spans,
            not frontage or individual side lengths. Area excludes holes; perimeter includes their boundaries.
            Separate parcel parts are combined, and spans may include gaps. Not a survey.
          </p>
        </>
      ) : (
        <p className="panel-note">Measurements unavailable: the parcel boundary is missing or cannot be measured.</p>
      )}
    </section>
  );
}
