import type { ParcelProperties, ParcelSearchResult } from "@/types/parcel";

export const PARCEL_DISCLAIMER =
  "Parcel boundaries and property data are approximate and provided for general reference only. They are not a legal survey, title opinion, zoning determination, or substitute for county/municipal verification.";
export const PARCEL_TAGS = ["lead", "showing", "listing-prospect", "cma", "follow-up"] as const;
export const parcelTitle = (parcel: ParcelProperties) =>
  parcel.siteAddress || parcel.parcelId || parcel.apn || "Parcel details";
export const displayValue = (value: string | number | null | undefined) =>
  value === null || value === undefined || value === ""
    ? "Not available"
    : typeof value === "number"
    ? value.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : value;
export const displayMoney = (value: number | null) =>
  value === null
    ? "Not available"
    : value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function displayRecordDate(value?: string | null) {
  if (!value) return "Not available";
  const normalized = value
    .trim()
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/\.(\d{3})\d+/, ".$1");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? "Not available"
    : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

export function safeSourceUrl(value?: string | null) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export type ResultFilters = { county: string; minAcres: string; maxAcres: string; landUse: string; sort: string };
export const EMPTY_RESULT_FILTERS: ResultFilters = {
  county: "",
  minAcres: "",
  maxAcres: "",
  landUse: "",
  sort: "relevance"
};

export function filterParcelResults(results: ParcelSearchResult[], filters: ResultFilters) {
  const filtered = results.filter(
    (p) =>
      (!filters.county || p.sourceCounty === filters.county) &&
      (!filters.landUse || p.landUse === filters.landUse) &&
      (!filters.minAcres || (p.acreage !== null && p.acreage >= Number(filters.minAcres))) &&
      (!filters.maxAcres || (p.acreage !== null && p.acreage <= Number(filters.maxAcres)))
  );
  if (filters.sort === "address") filtered.sort((a, b) => parcelTitle(a).localeCompare(parcelTitle(b)));
  if (filters.sort === "acreage") filtered.sort((a, b) => (b.acreage ?? -Infinity) - (a.acreage ?? -Infinity));
  if (filters.sort === "value")
    filtered.sort((a, b) => (b.assessedValue ?? -Infinity) - (a.assessedValue ?? -Infinity));
  return filtered;
}

// Quoting alone does not prevent spreadsheet programs from evaluating source text.
function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function parcelsCsv(parcels: ParcelProperties[]) {
  const headers = [
    "Address",
    "Parcel ID",
    "APN",
    "Owner",
    "Mailing address",
    "Acres",
    "Land use",
    "Assessed value (not market value)",
    "County",
    "State",
    "Provider",
    "Source URL",
    "Source updated",
    "Imported",
    "Disclaimer"
  ];
  const rows = parcels.map((p) => [
    p.siteAddress,
    p.parcelId,
    p.apn,
    p.ownerName,
    p.mailingAddress,
    p.acreage,
    p.landUse,
    p.assessedValue,
    p.sourceCounty,
    p.state,
    p.provider,
    p.sourceUrl,
    p.sourceUpdatedAt,
    p.importedAt,
    PARCEL_DISCLAIMER
  ]);
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

export function downloadParcelsCsv(parcels: ParcelProperties[], name = "parcel-selection") {
  const url = URL.createObjectURL(new Blob(["\uFEFF", parcelsCsv(parcels)], { type: "text/csv;charset=utf-8;" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
