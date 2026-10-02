import Icon from "@/components/Icon";
import { measurementAcres, measurementDimensions, measurementFeet, type ParcelMeasurements as Measurements } from "@/lib/parcel-measurements";

const MEASUREMENT_NOTE =
  "Clockwise from the northwest corner, returning to the start. Approximate GIS side lengths; nearly straight segments are combined within 1 ft. Curves may show several lengths. Each boundary is listed separately. Area excludes holes; perimeter includes them. Not a survey.";

export default function ParcelMeasurements({
  measurements,
  variant = "panel"
}: {
  measurements: Measurements | null;
  /** The printed brief shows the explanation in full; the panel tucks it behind a disclosure. */
  variant?: "panel" | "print";
}) {
  return (
    <section className="parcel-measurements" aria-label="Calculated parcel measurements">
      <h3 className="section-title">Approximate measurements</h3>
      {measurements ? (
        <>
          <dl className="stat-grid">
            {[
              ["Calculated acreage", measurementAcres(measurements.acres)],
              ["Boundary perimeter", measurementFeet(measurements.perimeterFeet)]
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
            {measurements.boundaries.map((boundary) => (
              <div className="stat-wide" key={`${boundary.part}-${boundary.ring}`}>
                <dt>
                  {measurements.boundaries.some((item) => item.part > 1) ? `Part ${boundary.part} · ` : ""}
                  {boundary.ring ? `Interior boundary ${boundary.ring}` : "Dimensions"}
                  {" · feet"}
                </dt>
                <dd className="mono">{measurementDimensions(boundary.sideLengthsFeet)}</dd>
              </div>
            ))}
          </dl>
          {variant === "print" ? (
            <p className="panel-note">{MEASUREMENT_NOTE}</p>
          ) : (
            <details className="disclosure measure-note">
              <summary>
                Approximate GIS values, not a survey
                <Icon name="chevron" size={16} />
              </summary>
              <p>{MEASUREMENT_NOTE}</p>
            </details>
          )}
        </>
      ) : (
        <p className="panel-note">Measurements unavailable: the parcel boundary is missing or cannot be measured.</p>
      )}
    </section>
  );
}
