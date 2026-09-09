import { measurementAcres, measurementDimensions, measurementFeet, type ParcelMeasurements as Measurements } from "@/lib/parcel-measurements";

export default function ParcelMeasurements({ measurements }: { measurements: Measurements | null }) {
  return (
    <section className="parcel-measurements" aria-label="Calculated parcel measurements">
      <h3 className="section-title">Approximate measurements</h3>
      {measurements ? (
        <>
          <dl className="record-list measurement-facts">
            {[
              ["Calculated acreage", measurementAcres(measurements.acres)],
              ["Boundary perimeter", measurementFeet(measurements.perimeterFeet)]
            ].map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
            {measurements.boundaries.map(boundary => (
              <div className="measurement-dimensions" key={`${boundary.part}-${boundary.ring}`}>
                <dt>
                  {measurements.boundaries.some(item => item.part > 1) ? `Part ${boundary.part} · ` : ""}
                  {boundary.ring ? `Interior boundary ${boundary.ring}` : "Dimensions"}
                  {" · feet"}
                </dt>
                <dd>{measurementDimensions(boundary.sideLengthsFeet)}</dd>
              </div>
            ))}
          </dl>
          <p className="panel-note">
            Clockwise from the northwest corner, returning to the start. Approximate GIS side lengths;
            nearly straight segments are combined within 1 ft. Curves may show several lengths.
            Each boundary is listed separately. Area excludes holes; perimeter includes them. Not a survey.
          </p>
        </>
      ) : (
        <p className="panel-note">Measurements unavailable: the parcel boundary is missing or cannot be measured.</p>
      )}
    </section>
  );
}
