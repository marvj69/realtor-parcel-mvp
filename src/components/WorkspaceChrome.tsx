"use client";
import { useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import {
  matchKindLabel,
  PARCEL_DISCLAIMER,
  PARCEL_DISCLAIMER_SHORT,
  PARCEL_TAGS,
  parcelTitle,
  TAG_COLORS,
  tagLabel
} from "@/lib/parcel-presentation";
import type { AppPanel } from "@/types/measurement";
import type { ParcelSearchResult } from "@/types/parcel";

export type WorkspacePopover = "layers" | "help" | null;

const NAV: [AppPanel, string, IconName][] = [
  ["search", "Explore", "search"],
  ["details", "Property", "pin"],
  ["saved", "Projects", "folder"],
  ["compare", "Compare", "compare"],
  ["measure", "Measure", "ruler"],
  ["offline", "Offline", "download"]
];
const TYPEAHEAD_LIMIT = 6;

type Props = {
  panel: AppPanel;
  onPanel: (panel: AppPanel) => void;
  basemap: "streets" | "satellite";
  onBasemap: (mode: "streets" | "satellite") => void;
  boundaries: boolean;
  onBoundaries: (show: boolean) => void;
  labels: boolean;
  onLabels: (show: boolean) => void;
  opacity: number;
  onOpacity: (value: number) => void;
  savedLayer: boolean;
  onSavedLayer: (show: boolean) => void;
  savedCount: number;
  openPopover: WorkspacePopover;
  onPopoverChange: (popover: WorkspacePopover) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSearchSubmit: () => void;
  searchResults: ParcelSearchResult[];
  searchLoading: boolean;
  searchError: string | null;
  onSearchResultSelect: (result: ParcelSearchResult) => void;
  onSearchSeeAll: () => void;
  onLocate: () => void;
  locating: boolean;
  compareCount: number;
  online: boolean;
  onHome: () => void;
  onShare: () => void;
  onFullscreen: () => void;
  onSignOut?: () => void;
  userName: string;
  coordinate: string;
  status: string;
  error: string | null;
  loading: boolean;
  toast: string;
};

function HeaderSearch(p: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const query = p.searchQuery;
  const top = p.searchResults.filter((result) => result.center).slice(0, TYPEAHEAD_LIMIT);
  const showList = open && query.trim().length >= 2;
  const status = p.searchLoading
    ? "Searching records…"
    : top.length
    ? null
    : query.trim().length < 3
    ? "Keep typing, or press Enter to search."
    : p.searchError || "No parcel matches yet.";

  function choose(result: ParcelSearchResult) {
    p.onSearchResultSelect(result);
    setOpen(false);
    setActive(-1);
    (document.activeElement as HTMLElement | null)?.blur();
  }

  function seeAll() {
    if (!p.searchResults.length) p.onSearchSubmit();
    p.onSearchSeeAll();
    setOpen(false);
  }

  return (
    <div
      className="header-typeahead"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <Icon name="search" size={16} />
      <label className="sr-only" htmlFor="header-search-input">
        Find a property by address, owner, or parcel ID
      </label>
      <input
        id="header-search-input"
        role="combobox"
        aria-expanded={showList}
        aria-controls="header-search-results"
        aria-autocomplete="list"
        aria-activedescendant={showList && active >= 0 ? `header-result-${active}` : undefined}
        autoComplete="off"
        maxLength={120}
        placeholder="Find a property"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          p.onSearchQueryChange(event.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, top.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, -1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            if (active >= 0 && top[active]) choose(top[active]);
            else if (query.trim().length >= 2) seeAll();
          } else if (event.key === "Escape") {
            event.stopPropagation();
            if (showList) setOpen(false);
            else event.currentTarget.blur();
          }
        }}
      />
      {query ? (
        <button
          type="button"
          className="icon-button"
          aria-label="Clear search"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            p.onSearchQueryChange("");
            setActive(-1);
          }}
        >
          <Icon name="close" size={14} />
        </button>
      ) : (
        <kbd>/</kbd>
      )}
      {showList ? (
        <div className="typeahead-panel">
          {top.length ? (
            <ul id="header-search-results" role="listbox" aria-label="Matching parcels">
              {top.map((result, index) => {
                const match = matchKindLabel(result.matchKind);
                return (
                  <li
                    key={result.id}
                    id={`header-result-${index}`}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(result)}
                  >
                    <strong>{parcelTitle(result)}</strong>
                    <span>{[result.ownerName, result.sourceCounty].filter(Boolean).join(" · ") || "Owner unavailable"}</span>
                    {match ? <em>{match}</em> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p id="header-search-results" className="typeahead-status" role="status">
              {status}
            </p>
          )}
          {p.searchResults.length > 0 || query.trim().length >= 2 ? (
            <button
              type="button"
              className="typeahead-all"
              onMouseDown={(event) => event.preventDefault()}
              onClick={seeAll}
            >
              {p.searchResults.length === 1
                ? "Open in Explore with filters"
                : p.searchResults.length
                ? `See all ${p.searchResults.length} results with filters`
                : "Open search with filters"}
              <Icon name="arrow" size={15} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function WorkspaceChrome(p: Props) {
  const layersOpen = p.openPopover === "layers";
  const helpOpen = p.openPopover === "help";
  const togglePopover = (popover: Exclude<WorkspacePopover, null>) =>
    p.onPopoverChange(p.openPopover === popover ? null : popover);
  function openSearchPanel() {
    p.onPanel("search");
    setTimeout(() => document.getElementById("parcel-search")?.focus(), 50);
  }
  return (
    <>
      <header className="workspace-header">
        <button className="brand" onClick={p.onHome} aria-label="Parcel home map">
          <span className="brand-mark">
            <Icon name="layers" size={25} />
          </span>
          <span>
            parcel<span className="brand-period">.</span>
            <small>REALTOR WORKSPACE</small>
          </span>
        </button>
        <div className="header-divider" />
        <span className="workspace-region">
          <Icon name="pin" size={16} />
          Upper Peninsula, MI
        </span>
        <HeaderSearch {...p} />
        <button className="header-search" aria-label="Find a property" onClick={openSearchPanel}>
          <Icon name="search" size={16} />
        </button>
        <div className="header-account">
          <span className={`connection-status ${p.online ? "" : "offline"}`}>
            <span className="status-dot" />
            {p.online ? "Online" : "Offline"}
          </span>
          <span className="user-avatar" title={p.userName}>
            {p.userName.slice(0, 1).toUpperCase()}
          </span>
          {p.onSignOut ? (
            <button className="icon-button" onClick={p.onSignOut} title="Sign out" aria-label="Sign out">
              <Icon name="logout" size={17} />
            </button>
          ) : null}
        </div>
      </header>
      <nav className="workspace-rail" aria-label="Workspace navigation">
        {NAV.map(([panel, label, icon]) => (
          <button
            key={panel}
            className={p.panel === panel ? "rail-button active" : "rail-button"}
            aria-pressed={p.panel === panel}
            onClick={() => p.onPanel(p.panel === panel ? "map" : panel)}
            title={label}
          >
            <Icon name={icon} size={21} />
            <span>{label}</span>
            {panel === "compare" && p.compareCount > 0 ? <b>{p.compareCount}</b> : null}
          </button>
        ))}
        <button
          className="rail-help"
          onClick={() => togglePopover("help")}
          aria-expanded={helpOpen}
          aria-label="Map help and keyboard shortcuts"
        >
          <Icon name="book" size={20} />
          <span>Guide</span>
        </button>
      </nav>
      <div className="map-toolbar">
        <div className="map-mode-switch" role="group" aria-label="Basemap">
          <button
            className={p.basemap === "streets" ? "active" : ""}
            onClick={() => p.onBasemap("streets")}
            aria-pressed={p.basemap === "streets"}
          >
            <Icon name="map" size={17} />
            Topo map
          </button>
          <button
            className={p.basemap === "satellite" ? "active" : ""}
            onClick={() => p.onBasemap("satellite")}
            aria-pressed={p.basemap === "satellite"}
          >
            <Icon name="terrain" size={17} />
            Satellite
          </button>
        </div>
        <div className="map-toolbar-actions">
          <button
            className={p.locating ? "map-tool active" : "map-tool"}
            aria-label="Find the parcel at my location"
            title="What parcel am I on?"
            disabled={p.locating}
            onClick={p.onLocate}
          >
            <Icon name="locate" size={17} />
            <span>{p.locating ? "Locating…" : "Locate"}</span>
          </button>
          <button
            className={layersOpen ? "map-tool active" : "map-tool"}
            aria-label="Map layers"
            aria-expanded={layersOpen}
            onClick={() => togglePopover("layers")}
          >
            <Icon name="layers" size={17} />
            <span>Layers</span>
          </button>
          <button
            className="map-tool icon-button"
            aria-label="Copy link to this map view"
            title="Copy map link"
            onClick={p.onShare}
          >
            <Icon name="link" size={18} />
          </button>
          <button
            className="map-tool icon-button fullscreen-tool"
            aria-label="Toggle fullscreen"
            title="Fullscreen"
            onClick={p.onFullscreen}
          >
            <Icon name="expand" size={18} />
          </button>
        </div>
      </div>
      {layersOpen ? (
        <section className="layers-popover" aria-label="Map layers">
          <div className="section-heading-row">
            <h3>Map layers</h3>
            <button className="icon-button" onClick={() => p.onPopoverChange(null)} aria-label="Close map layers">
              <Icon name="close" size={17} />
            </button>
          </div>
          <label className="toggle-row">
            <span>
              <strong>Parcel boundaries</strong>
              <small>Approximate public GIS outlines</small>
            </span>
            <input type="checkbox" checked={p.boundaries} onChange={(e) => p.onBoundaries(e.target.checked)} />
          </label>
          <label className="toggle-row">
            <span>
              <strong>My saved parcels</strong>
              <small>
                {p.savedCount
                  ? `${p.savedCount.toLocaleString()} saved ${p.savedCount === 1 ? "parcel" : "parcels"}, colored by tag`
                  : "Parcels you save appear here, colored by tag"}
              </small>
            </span>
            <input type="checkbox" checked={p.savedLayer} onChange={(e) => p.onSavedLayer(e.target.checked)} />
          </label>
          <label className="toggle-row">
            <span>
              <strong>Road & place labels</strong>
              <small>
                {p.basemap === "satellite" ? "Reference overlay on imagery" : "Switch to satellite to customize"}
              </small>
            </span>
            <input
              type="checkbox"
              checked={p.labels}
              disabled={p.basemap !== "satellite"}
              onChange={(e) => p.onLabels(e.target.checked)}
            />
          </label>
          <label className="opacity-control">
            Parcel fill <span>{p.opacity}%</span>
            <input
              aria-label="Parcel fill opacity"
              type="range"
              min="0"
              max="50"
              value={p.opacity}
              onChange={(e) => p.onOpacity(Number(e.target.value))}
            />
          </label>
          <div className="layer-legend">
            <span>
              <i style={{ borderColor: p.basemap === "satellite" ? "#ff7a00" : "#1d4ed8" }} />
              Parcel outline
            </span>
            <span>
              <i className="selected-legend" />
              Selected property
            </span>
            {PARCEL_TAGS.map((tag) => (
              <span key={tag}>
                <i className="tag-legend" style={{ background: TAG_COLORS[tag] }} />
                Saved · {tagLabel(tag)}
              </span>
            ))}
          </div>
          <p className="panel-note">Map settings are remembered in this browser.</p>
        </section>
      ) : null}
      <button
        className="map-home map-tool icon-button"
        onClick={p.onHome}
        aria-label="Reset map to Houghton"
        title="Home market"
      >
        <Icon name="home" size={19} />
      </button>
      <div className="map-readout">
        <div className="map-status" role="status">
          <span className={p.loading ? "loading-dot" : "status-dot"} />
          {p.error || p.status}
        </div>
        <span className="coordinate-readout">{p.coordinate}</span>
      </div>
      {p.toast ? (
        <div className="workspace-toast" role="status">
          <Icon name="info" size={18} />
          {p.toast}
        </div>
      ) : null}
      {helpOpen ? (
        <section className="help-popover" aria-label="Workspace guide">
          <div className="section-heading-row">
            <h3>Your field guide</h3>
            <button className="icon-button" aria-label="Close guide" onClick={() => p.onPopoverChange(null)}>
              <Icon name="close" size={17} />
            </button>
          </div>
          <p>
            Zoom in to see parcel outlines and hover one for its address. Select a property for its record, then save it
            to a project or add it to a comparison. Copied links open the selected parcel.
          </p>
          <dl>
            <div>
              <dt>Search</dt>
              <dd>
                <kbd>/</kbd>
              </dd>
            </div>
            <div>
              <dt>Measure</dt>
              <dd>
                <kbd>M</kbd>
              </dd>
            </div>
            <div>
              <dt>Projects</dt>
              <dd>
                <kbd>S</kbd>
              </dd>
            </div>
            <div>
              <dt>Close panel, then clear selection</dt>
              <dd>
                <kbd>Esc</kbd>
              </dd>
            </div>
          </dl>
          <p>Offline areas save parcel records in this browser. Background maps may still require internet access.</p>
        </section>
      ) : null}
      <footer className="workspace-footer">
        <Icon name="shield" size={15} />
        <span className="disclaimer-full">{PARCEL_DISCLAIMER}</span>
        <span className="disclaimer-short">{PARCEL_DISCLAIMER_SHORT}</span>
      </footer>
    </>
  );
}
