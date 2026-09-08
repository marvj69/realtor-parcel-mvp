"use client";
import { useState, type FormEvent } from "react";
import Icon from "@/components/Icon";
import {
  displayValue,
  downloadParcelsCsv,
  EMPTY_RESULT_FILTERS,
  filterParcelResults,
  parcelTitle
} from "@/lib/parcel-presentation";
import type { ParcelFeature, ParcelSearchResult } from "@/types/parcel";

export const MARKETS = [
  { name: "Houghton", description: "Portage Lake & the Keweenaw", center: [-88.569, 47.1211] as [number, number] },
  { name: "Marquette", description: "Lake Superior shoreline", center: [-87.3954, 46.5436] as [number, number] },
  { name: "Escanaba", description: "Little Bay de Noc", center: [-87.0646, 45.7452] as [number, number] },
  { name: "Iron Mountain", description: "Southern Upper Peninsula", center: [-88.067, 45.8202] as [number, number] }
];

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  onSubmit: (event?: FormEvent<HTMLFormElement>) => void;
  results: ParcelSearchResult[];
  loading: boolean;
  error: string | null;
  onSelect: (result: ParcelSearchResult) => void;
  recent: ParcelFeature[];
  onRecentSelect: (parcel: ParcelFeature) => void;
  onMarketSelect: (center: [number, number]) => void;
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
  onMarketSelect
}: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState(EMPTY_RESULT_FILTERS);
  const filtered = filterParcelResults(results, filters);
  const filterCount = [filters.county, filters.minAcres, filters.maxAcres, filters.landUse].filter(Boolean).length;
  const invalidRange = Boolean(
    filters.minAcres && filters.maxAcres && Number(filters.minAcres) > Number(filters.maxAcres)
  );
  return (
    <>
      <section className="panel-section explore-heading">
        <div className="eyebrow">Upper Peninsula, Michigan</div>
        <h2>
          Explore properties<span className="heading-dot">.</span>
        </h2>
        <p>Local knowledge starts with the map.</p>
        <form className="search-form" onSubmit={onSubmit} role="search">
          <label className="sr-only" htmlFor="parcel-search">
            Search address, owner, or parcel ID
          </label>
          <div className="search-box">
            <Icon name="search" size={19} />
            <input
              id="parcel-search"
              autoComplete="off"
              maxLength={120}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Address, owner, or parcel ID"
            />
            {query ? (
              <button
                className="icon-button"
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  onQueryChange("");
                  setFilters(EMPTY_RESULT_FILTERS);
                }}
              >
                <Icon name="close" size={15} />
              </button>
            ) : (
              <kbd>/</kbd>
            )}
          </div>
          <button className="primary-button search-submit" disabled={loading || query.trim().length < 2}>
            {loading ? "Searching records…" : "Search parcels"}
            <Icon name="arrow" size={17} />
          </button>
        </form>
        <div className="search-tools">
          <button
            className={showFilters ? "text-button active" : "text-button"}
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Icon name="filter" size={16} />
            Filters {filterCount ? <span className="count-badge">{filterCount}</span> : null}
          </button>
          <span>Address · APN · Owner</span>
        </div>
        {showFilters ? (
          <div className="filter-panel">
            <p>Filter the returned results (up to 50 matches).</p>
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
              <label>
                Min. acres
                <input
                  type="number"
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
            <button className="text-button" onClick={() => setFilters(EMPTY_RESULT_FILTERS)}>
              Reset filters
            </button>
          </div>
        ) : null}
      </section>
      {error ? (
        <p role="status" className="message search-message">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="loading-results" aria-label="Searching parcels">
          <div />
          <div />
          <div />
        </div>
      ) : null}
      {query.trim().length >= 2 && results.length > 0 ? (
        <section className="panel-section results-section">
          <div className="results-heading">
            <h3>
              {filtered.length} <span>{filtered.length === 1 ? "result" : "results"}</span>
            </h3>
            <label className="sr-only" htmlFor="result-sort">
              Sort results
            </label>
            <select
              id="result-sort"
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
              disabled={!filtered.length}
              title="Export displayed results"
              aria-label="Export displayed results"
              onClick={() => downloadParcelsCsv(filtered, "parcel-search")}
            >
              <Icon name="download" size={17} />
            </button>
          </div>
          {results.length === 50 ? (
            <p className="panel-note">Top 50 matches. Refine your search for more specific results.</p>
          ) : null}
          <div className="search-results">
            {filtered.map((result, index) => (
              <button
                key={result.id}
                className="search-result"
                onClick={() => onSelect(result)}
                disabled={!result.center}
              >
                <div className="result-leading">
                  <span className="result-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="county-chip">{result.sourceCounty || "County unavailable"}</span>
                  <Icon name="chevron" size={15} />
                </div>
                <strong className="result-title">{parcelTitle(result)}</strong>
                <span className="result-owner">{result.ownerName || "Owner unavailable"}</span>
                <div className="result-facts">
                  <span>{result.acreage === null ? "Acres unavailable" : `${displayValue(result.acreage)} acres`}</span>
                  <span>{result.landUse || "Class unavailable"}</span>
                </div>
                <span className="result-apn">{result.apn || result.parcelId || "Parcel ID unavailable"}</span>
              </button>
            ))}
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
      {!query.trim() ? (
        <>
          {recent.length > 0 ? (
            <section className="panel-section">
              <div className="section-heading-row">
                <h3 className="section-title">
                  <Icon name="clock" size={17} />
                  Recently viewed
                </h3>
                <span className="subtle">This session</span>
              </div>
              <div className="recent-list">
                {recent.slice(0, 5).map((p) => (
                  <button key={p.properties.id} onClick={() => onRecentSelect(p)}>
                    <Icon name="pin" size={17} />
                    <span>
                      <strong>{parcelTitle(p.properties)}</strong>
                      <small>
                        {p.properties.sourceCounty} · {p.properties.parcelId}
                      </small>
                    </span>
                    <Icon name="chevron" size={15} />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
          <section className="panel-section market-section">
            <div className="section-heading-row">
              <h3>Jump to a local market</h3>
              <Icon name="map" size={17} />
            </div>
            <div className="market-list">
              {MARKETS.map((market, i) => (
                <button key={market.name} onClick={() => onMarketSelect(market.center)}>
                  <span className={`market-icon market-${i}`}>
                    <Icon name={i === 3 ? "terrain" : "map"} size={21} />
                  </span>
                  <span>
                    <strong>{market.name}</strong>
                    <small>{market.description}</small>
                  </span>
                  <Icon name="arrow" size={17} />
                </button>
              ))}
            </div>
          </section>
          <section className="explore-tip">
            <span className="tip-icon">
              <Icon name="pin" size={21} />
            </span>
            <h3>Every parcel has a story.</h3>
            <p>
              Zoom in and select an outlined property to explore its public record, save notes, and build your
              shortlist.
            </p>
            <div>
              <span className="legend-line" />
              Approximate parcel boundary
            </div>
          </section>
        </>
      ) : null}
    </>
  );
}
