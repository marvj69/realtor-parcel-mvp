"use client";
import { useEffect, useState, type FormEvent } from "react";
import Icon from "@/components/Icon";
import {
  displayValue,
  downloadParcelsCsv,
  EMPTY_RESULT_FILTERS,
  filterParcelResults,
  matchKindLabel,
  ownerMailingHint,
  parcelTitle,
  type ResultFilters
} from "@/lib/parcel-presentation";
import type { ParcelProperties, ParcelSearchResult } from "@/types/parcel";

export const MARKETS = [
  { name: "Houghton", description: "Portage Lake & the Keweenaw", center: [-88.569, 47.1211] as [number, number] },
  { name: "Marquette", description: "Lake Superior shoreline", center: [-87.3954, 46.5436] as [number, number] },
  { name: "Escanaba", description: "Little Bay de Noc", center: [-87.0646, 45.7452] as [number, number] },
  { name: "Iron Mountain", description: "Southern Upper Peninsula", center: [-88.067, 45.8202] as [number, number] }
];

const NO_MATCHES = "No parcel matches found.";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  results: ParcelSearchResult[];
  loading: boolean;
  error: string | null;
  onSelect: (result: ParcelSearchResult) => void;
  recent: ParcelProperties[];
  onRecentSelect: (parcel: ParcelProperties) => void;
  onRecentClear: () => void;
  onMarketSelect: (center: [number, number]) => void;
  onVisibleResultsChange: (results: ParcelSearchResult[]) => void;
  onFitResults: () => void;
};

export default function ParcelExplorer({
  query,
  onQueryChange,
  onSubmit,
  results,
  loading,
  error,
  onSelect,
  recent,
  onRecentSelect,
  onRecentClear,
  onMarketSelect,
  onVisibleResultsChange,
  onFitResults
}: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_RESULT_FILTERS);
  const filtered = filterParcelResults(results, filters);
  const trimmed = query.trim();
  const showingResults = trimmed.length >= 2 && results.length > 0;
  const noMatches = trimmed.length >= 2 && !loading && results.length === 0 && error === NO_MATCHES;
  const filterCount = [filters.county, filters.minAcres, filters.maxAcres, filters.landUse, filters.mailing].filter(
    Boolean
  ).length;
  // The map pins exactly the results listed here, so report the displayed set when it changes.
  const visibleKey = showingResults ? filtered.map((result) => result.id).join(",") : "";
  useEffect(() => {
    onVisibleResultsChange(showingResults ? filtered : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- visibleKey captures the displayed result set
  }, [visibleKey]);
  useEffect(() => () => onVisibleResultsChange([]), [onVisibleResultsChange]);
  const invalidRange = Boolean(
    filters.minAcres && filters.maxAcres && Number(filters.minAcres) > Number(filters.maxAcres)
  );
  return (
    <>
      <section className="panel-section explore-search">
        <form className="search-form" onSubmit={onSubmit} role="search">
          <label className="sr-only" htmlFor="parcel-search">
            Search address, owner, or parcel ID
          </label>
          <div className="search-row">
            <div className="search-field">
              <Icon name="search" size={18} />
              <input
                id="parcel-search"
                type="text"
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                aria-describedby="owner-search-help"
                maxLength={120}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Address, owner, or parcel ID"
              />
              {loading ? (
                <span className="spinner" role="status" aria-label="Searching parcel records" />
              ) : query ? (
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    onQueryChange("");
                    setFilters(EMPTY_RESULT_FILTERS);
                  }}
                >
                  <Icon name="close" size={16} />
                </button>
              ) : (
                <kbd aria-hidden="true">/</kbd>
              )}
            </div>
            <button
              type="button"
              className={showFilters || filterCount ? "icon-button bordered filter-toggle active" : "icon-button bordered filter-toggle"}
              aria-expanded={showFilters}
              aria-label={filterCount ? `Filters, ${filterCount} active` : "Filters"}
              title="Filter results"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Icon name="filter" size={18} />
              {filterCount ? <span className="count-badge">{filterCount}</span> : null}
            </button>
          </div>
          <button className="sr-only" type="submit" disabled={loading || trimmed.length < 2}>
            Search parcels
          </button>
        </form>
        <p id="owner-search-help" className="field-hint">
          Owner names work in either order. Try a last name, first and last name, or a business name.
        </p>
        {showFilters ? (
          <div className="filter-panel">
            <p>Filters apply to the returned results (up to 50 matches). Mailing filters are hints from the recorded address.</p>
            <div className="filter-grid">
              <label>
                County
                <select value={filters.county} onChange={(e) => setFilters({ ...filters, county: e.target.value })}>
                  <option value="">All returned counties</option>
                  {[...new Set(results.map((p) => p.sourceCounty).filter(Boolean))].sort().map((county) => (
                    <option key={county} value={county!}>
                      {county}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Land use / class
                <select value={filters.landUse} onChange={(e) => setFilters({ ...filters, landUse: e.target.value })}>
                  <option value="">All returned classes</option>
                  {[...new Set(results.map((p) => p.landUse).filter(Boolean))].sort().map((use) => (
                    <option key={use} value={use!}>
                      {use}
                    </option>
                  ))}
                </select>
              </label>
              <label className="filter-wide">
                Owner mailing address
                <select
                  value={filters.mailing}
                  onChange={(e) => setFilters({ ...filters, mailing: e.target.value as ResultFilters["mailing"] })}
                >
                  <option value="">Any mailing address</option>
                  <option value="differs">Differs from site or out of state</option>
                  <option value="out-of-state">Out-of-state mailing address</option>
                </select>
              </label>
              <label>
                Min. acres
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="No minimum"
                  value={filters.minAcres}
                  onChange={(e) => setFilters({ ...filters, minAcres: e.target.value })}
                />
              </label>
              <label>
                Max. acres
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="any"
                  placeholder="No maximum"
                  value={filters.maxAcres}
                  onChange={(e) => setFilters({ ...filters, maxAcres: e.target.value })}
                />
              </label>
            </div>
            {invalidRange ? (
              <p role="alert" className="message error">
                Maximum acreage must be at least the minimum.
              </p>
            ) : null}
            <button className="text-button" type="button" onClick={() => setFilters(EMPTY_RESULT_FILTERS)}>
              Reset filters
            </button>
          </div>
        ) : null}
      </section>
      {error && !noMatches ? (
        <p role="status" className="message search-message">
          {error}
        </p>
      ) : null}
      {loading && !showingResults ? (
        <div className="loading-results" aria-label="Searching parcels">
          <div />
          <div />
          <div />
        </div>
      ) : null}
      {noMatches ? (
        <div className="empty-state">
          <Icon name="searchX" size={28} />
          <h3>No matches for “{trimmed}”</h3>
          <p>Try fewer words, a street name without the number, or an owner’s last name.</p>
        </div>
      ) : null}
      {showingResults ? (
        <section className="results-section">
          <div className="results-heading">
            <h3>
              {filtered.length} <span>{filtered.length === 1 ? "result" : "results"}</span>
            </h3>
            <label className="sr-only" htmlFor="result-sort">
              Sort results
            </label>
            <select
              id="result-sort"
              className="compact-select"
              value={filters.sort}
              onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
            >
              <option value="relevance">Best match</option>
              <option value="address">Address A–Z</option>
              <option value="acreage">Largest acreage</option>
              <option value="value">Highest assessment</option>
            </select>
            <button
              className="icon-button"
              disabled={!filtered.some((result) => result.center)}
              title="Show these results on the map"
              aria-label="Show these results on the map"
              onClick={onFitResults}
            >
              <Icon name="map" size={18} />
            </button>
            <button
              className="icon-button"
              disabled={!filtered.length}
              title="Export displayed results"
              aria-label="Export displayed results"
              onClick={() => downloadParcelsCsv(filtered, "parcel-search")}
            >
              <Icon name="download" size={18} />
            </button>
          </div>
          <p className="results-note">
            {results.length === 50 ? "Top 50 matches. Refine your search for more specific results. " : ""}
            Numbered pins on the map match this list.
          </p>
          <div className="search-results">
            {filtered.map((result, index) => {
              const matchLabel = matchKindLabel(result.matchKind);
              const hint = ownerMailingHint(result);
              return (
                <button
                  key={result.id}
                  className="search-result"
                  onClick={() => onSelect(result)}
                  disabled={!result.center}
                >
                  <span className="result-number">{index + 1}</span>
                  <span className="result-main">
                    <strong className="result-title">{parcelTitle(result)}</strong>
                    <span className="result-owner">{result.ownerName || "Owner unavailable"}</span>
                    <span className="result-meta">
                      <span>{result.sourceCounty || "County unavailable"}</span>
                      <span>{result.acreage === null ? "Acres unavailable" : `${displayValue(result.acreage)} acres`}</span>
                      <span>{result.landUse || "Class unavailable"}</span>
                    </span>
                    {matchLabel || hint ? (
                      <span className="result-chips">
                        {matchLabel ? <span className="match-chip">{matchLabel}</span> : null}
                        {hint ? (
                          <span className="hint-chip">{hint.kind === "out-of-state" ? hint.label : "Mailing differs"}</span>
                        ) : null}
                      </span>
                    ) : null}
                    <span className="result-apn mono">{result.apn || result.parcelId || "Parcel ID unavailable"}</span>
                  </span>
                  <Icon name="chevron" size={16} />
                </button>
              );
            })}
          </div>
          {!filtered.length ? (
            <div className="empty-state">
              <Icon name="filter" size={28} />
              <h3>No results within these filters</h3>
              <button className="text-button" onClick={() => setFilters(EMPTY_RESULT_FILTERS)}>
                Clear filters
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {!trimmed ? (
        <>
          {recent.length > 0 ? (
            <section className="panel-section">
              <div className="section-heading-row">
                <h3 className="section-title">Recently viewed</h3>
                <button className="text-button" type="button" onClick={onRecentClear}>
                  Clear
                </button>
              </div>
              <div className="recent-list">
                {recent.slice(0, 5).map((p) => (
                  <button key={p.id} onClick={() => onRecentSelect(p)}>
                    <span className="recent-icon">
                      <Icon name="clock" size={16} />
                    </span>
                    <span className="recent-text">
                      <strong>{parcelTitle(p)}</strong>
                      <small>{[p.sourceCounty, p.parcelId || p.apn].filter(Boolean).join(" · ")}</small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </button>
                ))}
              </div>
              <p className="panel-note">Saved in this browser only.</p>
            </section>
          ) : null}
          <section className="panel-section">
            <h3 className="section-title">Jump to a market</h3>
            <div className="market-grid">
              {MARKETS.map((market) => (
                <button key={market.name} className="market-tile" onClick={() => onMarketSelect(market.center)}>
                  <strong>{market.name}</strong>
                  <small>{market.description}</small>
                </button>
              ))}
            </div>
          </section>
          <section className="panel-section explore-legend">
            <p>
              Zoom in and select an outlined property to see its public record, then save it to a project or add it to a
              comparison.
            </p>
            <div className="legend-item">
              <span className="legend-line" />
              Approximate parcel boundary
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
