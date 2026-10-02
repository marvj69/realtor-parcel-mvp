"use client";
import Icon from "@/components/Icon";
import ParcelOutline from "@/components/ParcelOutline";
import {
  displayMoney,
  displayRecordDate,
  displayValue,
  downloadParcelsCsv,
  parcelTitle,
  PARCEL_DISCLAIMER
} from "@/lib/parcel-presentation";
import type { ParcelFeature } from "@/types/parcel";

export default function ParcelCompare({
  parcels,
  onRemove,
  onSelect,
  onExplore
}: {
  parcels: ParcelFeature[];
  onRemove: (id: string) => void;
  onSelect: (parcel: ParcelFeature) => void;
  onExplore: () => void;
}) {
  return (
    <section className="panel-section comparison-panel">
      <div className="compare-intro">
        <p>Compare public records side by side. Selections stay here for this session.</p>
        <span className="chip" aria-label={`${parcels.length} of 3 parcels`}>
          {parcels.length} / 3
        </span>
      </div>
      {parcels.length === 0 ? (
        <div className="empty-state">
          <Icon name="compare" size={28} />
          <h3>Make a shortlist</h3>
          <p>Open a parcel and choose Compare. Add up to three properties.</p>
          <button className="primary-button" onClick={onExplore}>
            Explore parcels
            <Icon name="arrow" size={16} />
          </button>
        </div>
      ) : (
        <>
          <div className="comparison-cards">
            {parcels.map((parcel, index) => (
              <article className="comparison-card" key={parcel.properties.id}>
                <div className="comparison-card-top">
                  <span className="result-number">{index + 1}</span>
                  <button
                    className="icon-button"
                    aria-label={`Remove ${parcelTitle(parcel.properties)} from comparison`}
                    onClick={() => onRemove(parcel.properties.id)}
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <ParcelOutline parcel={parcel} />
                <button className="text-button" onClick={() => onSelect(parcel)}>
                  {parcelTitle(parcel.properties)}
                </button>
                <span>{parcel.properties.sourceCounty || "County unavailable"}</span>
              </article>
            ))}
          </div>
          <div className="comparison-scroll scroll-y">
            <table className="comparison-table">
              <thead>
                <tr>
                  <th>Public record</th>
                  {parcels.map((p, i) => (
                    <th key={p.properties.id}>
                      {i + 1}. {parcelTitle(p.properties)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  "Recorded acres",
                  "Assessed value",
                  "Land use / class",
                  "Owner",
                  "Mailing address",
                  "Source updated"
                ].map((label, row) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {parcels.map((p) => (
                      <td key={p.properties.id}>
                        {
                          [
                            displayValue(p.properties.acreage),
                            displayMoney(p.properties.assessedValue),
                            displayValue(p.properties.landUse),
                            displayValue(p.properties.ownerName),
                            displayValue(p.properties.mailingAddress),
                            displayRecordDate(p.properties.sourceUpdatedAt)
                          ][row]
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel-note">Assessed values are not market values and may use different assessment dates.</p>
          <button
            className="secondary-button"
            onClick={() =>
              downloadParcelsCsv(
                parcels.map((p) => p.properties),
                "parcel-comparison"
              )
            }
          >
            <Icon name="download" size={17} />
            Export comparison CSV
          </button>
          <p className="detail-disclaimer">{PARCEL_DISCLAIMER}</p>
        </>
      )}
    </section>
  );
}
