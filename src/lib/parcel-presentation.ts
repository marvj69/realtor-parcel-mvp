import type { ParcelProperties, ParcelSearchResult } from "@/types/parcel";

export const PARCEL_DISCLAIMER =
  "Parcel boundaries and property data are approximate and provided for general reference only. They are not a legal survey, title opinion, zoning determination, or substitute for county/municipal verification.";
// Phone-width footer copy. It keeps every element of the full disclaimer in fewer words.
export const PARCEL_DISCLAIMER_SHORT =
  "Boundaries and data are approximate, for general reference only — not a legal survey, title opinion, or zoning determination. Verify with the county or municipality.";
export const PARCEL_TAGS = ["lead", "showing", "listing-prospect", "cma", "follow-up"] as const;
export type ParcelTag = (typeof PARCEL_TAGS)[number];
export const TAG_COLORS: Record<ParcelTag, string> = {
  lead: "#2563eb",
  showing: "#7c3aed",
  "listing-prospect": "#db2777",
  cma: "#d97706",
  "follow-up": "#0d9488"
};
export const UNTAGGED_COLOR = "#475569";
export const tagLabel = (tag: string | null | undefined) => (tag ? tag.replaceAll("-", " ") : "No tag");
export const tagColor = (tag: string | null | undefined) =>
  tag && tag in TAG_COLORS ? TAG_COLORS[tag as ParcelTag] : UNTAGGED_COLOR;

const US_STATES = new Set(
  (
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH " +
    "OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR"
  ).split(" ")
);
const UPPERCASE_WORDS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "PO", "US", "USA", "CR", "RR", "FS"]);
const ZIP = /^\d{5}(-\d{4})?$/;

function titlePart(part: string) {
  if (!/[A-Z]/.test(part) || UPPERCASE_WORDS.has(part) || part.length === 1) return part;
  if (/\d/.test(part)) {
    if (/^\d+(ST|ND|RD|TH)$/.test(part)) return part.toLowerCase();
    // "BOX11", "LOT#8", "APT.10": title-case a leading word; keep route/grid codes such as M28 or N6600.
    const word = /^([A-Z]{3,})([^A-Z].*)$/.exec(part);
    return word ? `${word[1][0]}${word[1].slice(1).toLowerCase()}${word[2]}` : part;
  }
  if (/^MC[A-Z]{2,}$/.test(part)) return `Mc${part[2]}${part.slice(3).toLowerCase()}`;
  return part
    .toLowerCase()
    .replace(/(^|[.'])([a-z])/g, (match, separator: string, letter: string, offset: number, text: string) =>
      separator === "'" && letter === "s" && offset + match.length === text.length ? match : separator + letter.toUpperCase()
    );
}

function titleWord(word: string) {
  // Leave source text that already has lowercase letters as the county wrote it.
  if (word !== word.toUpperCase()) return word;
  return word.split(/([-/&])/).map(titlePart).join("");
}

function titleSegment(segment: string, isLocality: boolean) {
  const words = segment.split(" ");
  return words
    .map((word, index) => {
      const next = words[index + 1];
      // A two-letter state code only counts after the street line, before a ZIP or at the end.
      if (isLocality && US_STATES.has(word) && (next === undefined || ZIP.test(next))) return word;
      return titleWord(word);
    })
    .join(" ");
}

function addressSegments(raw: string | null | undefined) {
  if (!raw) return [];
  const segments = raw
    .replace(/\s+/g, " ")
    .split(",")
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "0");
  const merged: string[] = [];
  for (const segment of segments) {
    const previous = merged.at(-1);
    if (previous && ZIP.test(segment) && US_STATES.has(previous.split(" ").at(-1) ?? "") && merged.length > 1) {
      merged[merged.length - 1] = `${previous} ${segment}`;
    } else {
      merged.push(segment);
    }
  }
  return merged;
}

/**
 * Display-only cleanup of county address text: drops empty or "0" segments, joins "MI, 49829" into
 * "MI 49829", and title-cases all-caps words. It never adds information; raw values stay in the record.
 */
export function formatAddress(raw: string | null | undefined): string | null {
  const segments = addressSegments(raw);
  if (!segments.length || (segments.length === 1 && US_STATES.has(segments[0]))) return null;
  return segments.map((segment, index) => titleSegment(segment, index > 0)).join(", ");
}

export const parcelTitle = (parcel: ParcelProperties) =>
  formatAddress(parcel.siteAddress) || parcel.parcelId || parcel.apn || "Parcel details";

const MATCH_LABELS: Record<NonNullable<ParcelSearchResult["matchKind"]>, string> = {
  parcel_id: "Parcel ID match",
  apn: "APN match",
  owner_name: "Owner match",
  site_address: "Address match",
  mailing_address: "Mailing address match",
  land_use: "Land use match"
};
export const matchKindLabel = (kind: ParcelSearchResult["matchKind"]) => (kind ? MATCH_LABELS[kind] : null);

const STREET_WORDS: Record<string, string> = {
  STREET: "ST",
  ROAD: "RD",
  AVENUE: "AVE",
  AV: "AVE",
  DRIVE: "DR",
  LANE: "LN",
  COURT: "CT",
  BOULEVARD: "BLVD",
  HIGHWAY: "HWY",
  PLACE: "PL",
  CIRCLE: "CIR",
  TRAIL: "TRL",
  PARKWAY: "PKWY",
  TERRACE: "TER",
  NORTH: "N",
  SOUTH: "S",
  EAST: "E",
  WEST: "W",
  FIRST: "1ST",
  SECOND: "2ND",
  THIRD: "3RD",
  FOURTH: "4TH",
  FIFTH: "5TH",
  SIXTH: "6TH",
  SEVENTH: "7TH",
  EIGHTH: "8TH",
  NINTH: "9TH",
  TENTH: "10TH",
  ELEVENTH: "11TH",
  TWELFTH: "12TH",
  THIRTEENTH: "13TH",
  FOURTEENTH: "14TH",
  FIFTEENTH: "15TH"
};
const DIRECTIONALS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
const HOUSE_NUMBER = /^[NSEW]?\d+[A-Z]?$/; // 128, 40A, N6600 — not an ordinal street like 10TH

// Street-line words for comparison: house number first, then the street without
// directionals, highway words, or punctuation that counties record inconsistently.
function comparableStreet(segment: string) {
  return segment
    .toUpperCase()
    .replace(/\s+-\s+[A-Z ]+$/, "") // trailing locality such as "867 LAKE ST - GAY"
    .replace(/[.,#]/g, " ")
    .replace(/\bCOUNTY ROAD\b|\bCO RD\b/g, "CR")
    .replace(/\bST HWY\b|\b(STATE )?(HWY|HIGHWAY)\b/g, " ")
    .replace(/^([NSEW])[\s-]+(?=\d)/, "$1")
    .replace(/\b(US|M|CR)[\s-]+(?=\d)/g, "$1")
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => STREET_WORDS[word] ?? word)
    .filter((word, index) => index === 0 || !DIRECTIONALS.has(word));
}

function editDistance(a: string, b: string) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1)
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return previous[b.length];
}

function mailingState(segments: string[]) {
  for (const segment of segments.slice(1).reverse()) {
    const words = segment.split(" ");
    for (let i = words.length - 1; i >= 0; i -= 1) {
      const word = words[i].toUpperCase();
      if (US_STATES.has(word) && (i === words.length - 1 || ZIP.test(words[i + 1]))) return word;
    }
  }
  return null;
}

export type OwnerMailingHint = { kind: "out-of-state" | "differs"; label: string };

/**
 * A prospecting hint from the recorded mailing address only. Owners use other mailing
 * addresses for many reasons, so the UI presents this as a hint to verify, not a fact.
 */
export function ownerMailingHint(parcel: Pick<ParcelProperties, "siteAddress" | "mailingAddress" | "state">) {
  const mailing = addressSegments(parcel.mailingAddress);
  if (!mailing.length) return null;
  const state = mailingState(mailing);
  const parcelState = parcel.state?.trim().toUpperCase();
  if (state && parcelState && US_STATES.has(parcelState) && state !== parcelState) {
    return { kind: "out-of-state", label: `Out-of-state mailing address (${state})` } satisfies OwnerMailingHint;
  }
  const site = addressSegments(parcel.siteAddress)[0];
  if (!site) return null;
  const a = comparableStreet(site);
  const b = comparableStreet(mailing[0]);
  // Both lines need a house number; PO boxes and unnumbered vacant land are not evidence either way.
  if (!HOUSE_NUMBER.test(a[0] ?? "") || !HOUSE_NUMBER.test(b[0] ?? "")) return null;
  const streetA = a.slice(1).join(" ");
  const streetB = b.slice(1).join(" ");
  // Tolerate one or two typos in longer street names ("LAKE LILLY" vs "LAKE LILY"), not in short ones.
  const typoAllowance = Math.min(2, Math.floor(Math.max(streetA.length, streetB.length) / 8));
  const sameStreet =
    streetA.startsWith(streetB) || streetB.startsWith(streetA) || editDistance(streetA, streetB) <= typoAllowance;
  if (a[0] === b[0] && sameStreet) return null;
  return { kind: "differs", label: "Mailing address differs from site address" } satisfies OwnerMailingHint;
}
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

export type ResultFilters = {
  county: string;
  minAcres: string;
  maxAcres: string;
  landUse: string;
  mailing: "" | "differs" | "out-of-state";
  sort: string;
};
export const EMPTY_RESULT_FILTERS: ResultFilters = {
  county: "",
  minAcres: "",
  maxAcres: "",
  landUse: "",
  mailing: "",
  sort: "relevance"
};

function matchesMailingFilter(parcel: ParcelProperties, filter: ResultFilters["mailing"]) {
  if (!filter) return true;
  const hint = ownerMailingHint(parcel);
  return filter === "out-of-state" ? hint?.kind === "out-of-state" : Boolean(hint);
}

export function filterParcelResults(results: ParcelSearchResult[], filters: ResultFilters) {
  const filtered = results.filter(
    (p) =>
      (!filters.county || p.sourceCounty === filters.county) &&
      (!filters.landUse || p.landUse === filters.landUse) &&
      (!filters.minAcres || (p.acreage !== null && p.acreage >= Number(filters.minAcres))) &&
      (!filters.maxAcres || (p.acreage !== null && p.acreage <= Number(filters.maxAcres))) &&
      matchesMailingFilter(p, filters.mailing)
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
