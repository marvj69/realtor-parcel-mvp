import type { DatabaseSync, StatementSync } from "node:sqlite";
import { ownerMatchScore, ownerWords } from "./owner-search";
import { BoundedCache } from "./bounded-cache";
import { decodeParcel } from "./static-parcel-format";
import { parcelPropertiesFromRow, parsePoint } from "./parcels";
import type { ParcelSearchResult } from "../types/parcel";

export const SEARCH_FIELDS = ["apn", "parcel_id", "site_address", "owner_name", "mailing_address", "land_use"] as const;
export const SEARCH_PROPERTY_FIELDS = ["sourceKey", "sourceFeatureId", "provider", "sourceCounty", "state",
  "sourceUrl", "sourceUpdatedAt", "importedAt", "acreage", "assessedValue", "legalDescription", "center"] as const;
const weights = [[1000,920,650],[980,910,640],[780,700,500],[760,690,480],[740,660,440],[520,430,260]];
const scores = SEARCH_FIELDS.map((field, i) => `${i === 3 ? "max(owner_score(owner_name,$q)," : ""}CASE WHEN lower(${field})=$q THEN ${weights[i][0]}
  ${i < 2 ? `WHEN $norm<>'' AND ${i === 0 ? "apn_norm" : "parcel_norm"}=$norm THEN ${i === 0 ? 990 : 970}` : ""}
  WHEN instr(lower(${field}),$q)=1 THEN ${weights[i][1]}
  ${i < 2 ? `WHEN $norm<>'' AND instr(${i === 0 ? "apn_norm" : "parcel_norm"},$norm)=1 THEN ${i === 0 ? 900 : 890}` : ""}
  WHEN instr(lower(${field}),$q)>0 THEN ${weights[i][2]} ELSE 0 END${i === 3 ? ")" : ""}`);

// Trigrams narrow candidates only. The original literal checks and ranking still
// decide results, including punctuation and normalized APNs. Short/Unicode input
// uses the complete scan so tokenizer differences cannot lose a match.
export function searchTrigrams(q: string, norm: string): string | null {
  if (!/^[\x20-\x7e]{3,}$/.test(q) || (norm.length > 0 && norm.length < 3)) return null;
  const terms = (text: string) => [...new Set(Array.from({ length: text.length - 2 }, (_, i) => text.slice(i, i + 3)))]
    .map(term => `"${term.replaceAll('"', '""')}"`).join(" AND ");
  return norm && norm !== q ? `(${terms(q)}) OR (${terms(norm)})` : terms(q);
}

export class ParcelSearch {
  private readonly fullScan: StatementSync;
  private readonly indexed: StatementSync | null;
  private readonly cache = new BoundedCache<ParcelSearchResult[]>(128, 4 * 1024 ** 2);

  constructor(db: DatabaseSync, private readonly compact = false) {
    db.function("owner_score", { deterministic: true }, (owner, q) => ownerMatchScore(owner as string | null, q as string));
    const sql = (filter: string) => `SELECT payload,${compact ? `id,${SEARCH_FIELDS.join(",")},` : ""}${scores.map((score,i) => `${score} AS s${i}`).join(",")}
      FROM parcels WHERE ${filter} (${SEARCH_FIELDS.map(field => `instr(lower(${field}),$q)>0`).join(" OR ")}
      OR owner_score(owner_name,$q)>0 OR ($norm<>'' AND (instr(apn_norm,$norm)=1 OR instr(parcel_norm,$norm)=1)))
      ORDER BY max(${scores.join(",")}) DESC, id LIMIT $limit`;
    this.fullScan = db.prepare(sql(""));
    this.indexed = compact ? db.prepare(sql("n IN (SELECT rowid FROM parcel_search WHERE parcel_search MATCH $match) AND")) : null;
  }

  search(text: string, limit: number): ParcelSearchResult[] {
    const q = text.trim().toLowerCase(), norm = q.replace(/[^a-z0-9]/g, "");
    const key = JSON.stringify([q, limit]);
    const cached = this.cache.get(key);
    if (cached) return structuredClone(cached);
    const literalMatch = this.indexed && searchTrigrams(q, norm);
    // The longest name token is required by every owner match. Use only its
    // ASCII trigrams; short/Unicode input must scan to avoid dropping matches.
    const token = ownerWords(q).sort((a, b) => b.length - a.length)[0];
    const ownerMatch = token && searchTrigrams(token, token);
    const match = literalMatch && ownerMatch ? `(${literalMatch}) OR (${ownerMatch})` : null;
    const rows = match ? this.indexed!.all({q, norm, limit, match}) : this.fullScan.all({q, norm, limit});
    const results = rows.map(result => {
      const best = SEARCH_FIELDS.reduce((a, _, i) => Number(result[`s${i}`]) > Number(result[`s${a}`]) ? i : a, 0);
      const row = this.compact ? null : decodeParcel(result.payload as Uint8Array);
      const values = this.compact ? JSON.parse(result.payload as string) : [];
      const parcel: ParcelSearchResult = row
        ? { ...parcelPropertiesFromRow(row), center: parsePoint(row.center) }
        : { ...Object.fromEntries(SEARCH_PROPERTY_FIELDS.map((field, i) => [field, values[i]])),
          id: result.id, apn: result.apn, parcelId: result.parcel_id, siteAddress: result.site_address,
          ownerName: result.owner_name, mailingAddress: result.mailing_address, landUse: result.land_use } as ParcelSearchResult;
      const labels = [parcel.apn, parcel.parcelId, parcel.siteAddress, parcel.ownerName, parcel.mailingAddress, parcel.landUse];
      return { ...parcel, matchKind: SEARCH_FIELDS[best], matchLabel: labels[best], rank: Number(result[`s${best}`]) };
    });
    this.cache.set(key, structuredClone(results), Buffer.byteLength(JSON.stringify(results)));
    return results;
  }
}
