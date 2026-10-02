"use client";
import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import BrandMark from "@/components/Brand";
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

export type WorkspacePopover = "layers" | "help" | "account" | null;

const NAV: [AppPanel, string, IconName][] = [
  ["search", "Explore", "search"],
  ["details", "Property", "pin"],
  ["saved", "Projects", "folder"],
  ["compare", "Compare", "compare"],
  ["measure", "Measure", "ruler"],
  ["offline", "Offline", "offline"]
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
  error: string | null;
  loading: boolean;
  toast: string;
  /** Receives the element where the map mounts its zoom/compass control, so it shares the toolbar's look and layout. */
  onNavHost: (element: HTMLDivElement | null) => void;
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
      <Icon name="search" size={18} />
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
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={120}
        placeholder="Search address, owner, or parcel ID"
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
          <Icon name="close" size={16} />
        </button>
      ) : (
        <kbd aria-hidden="true">/</kbd>
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
              <Icon name="arrow" size={16} />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function WorkspaceChrome(p: Props) {
  const { onNavHost } = p;
  const layersOpen = p.openPopover === "layers";
  const helpOpen = p.openPopover === "help";
  const accountOpen = p.openPopover === "account";
  const togglePopover = (popover: Exclude<WorkspacePopover, null>) =>
    p.onPopoverChange(p.openPopover === popover ? null : popover);
  const measuring = p.panel === "measure";
  const initial = (p.userName.trim().slice(0, 1) || "P").toUpperCase();

  function openSearchPanel() {
    // Render the panel synchronously so the input can be focused inside this tap. iOS only
    // raises the keyboard for focus() calls made during the user's gesture.
    flushSync(() => p.onPanel("search"));
    document.getElementById("parcel-search")?.focus();
  }

  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest(".header-account")) p.onPopoverChange(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the open state matters
  }, [accountOpen]);

  return (
    <>
      <header className="app-header">
        <h1 className="sr-only">Parcel realtor workspace</h1>
        <button className="brand" onClick={p.onHome} aria-label="Parcel home map">
          <BrandMark />
          <span className="brand-name">Parcel</span>
        </button>
        <span className="workspace-region">
          <Icon name="pin" size={14} />
          Upper Peninsula, MI
        </span>
        <HeaderSearch {...p} />
        <button className="header-search-pill" aria-label="Find a property" onClick={openSearchPanel}>
          <Icon name="search" size={18} />
          <span>Search address, owner, APN</span>
        </button>
        <div className="header-account">
          {!p.online ? (
            <span className="connection-status" role="status">
              <span className="status-dot" />
              <span>Offline</span>
            </span>
          ) : null}
          {p.onSignOut ? (
            <>
              <button
                className="avatar-button"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={accountOpen}
                onClick={() => togglePopover("account")}
              >
                {initial}
              </button>
              {accountOpen ? (
                <div className="account-menu popover" role="menu" aria-label="Account">
                  <div className="account-menu-who">
                    <strong>{p.userName}</strong>
                    <span>Signed in</span>
                  </div>
                  <button className="menu-item" role="menuitem" onClick={p.onSignOut}>
                    <Icon name="logout" size={17} />
                    Sign out
                  </button>
                </div>
              ) : null}
            </>
          ) : (
            <span className="avatar-button" title={p.userName}>
              {initial}
            </span>
          )}
        </div>
      </header>

      <nav className="app-nav" aria-label="Workspace navigation">
        {NAV.map(([panel, label, icon]) => (
          <button
            key={panel}
            className={p.panel === panel ? "nav-item active" : "nav-item"}
            aria-pressed={p.panel === panel}
            onClick={() => p.onPanel(p.panel === panel ? "map" : panel)}
            title={label}
          >
            <Icon name={icon} size={22} />
            <span>{label}</span>
            {panel === "compare" && p.compareCount > 0 ? (
              <span className="nav-badge" aria-label={`${p.compareCount} in comparison`}>
                {p.compareCount}
              </span>
            ) : null}
          </button>
        ))}
        <span className="nav-spacer" />
        <button
          className="nav-item nav-guide"
          onClick={() => togglePopover("help")}
          aria-expanded={helpOpen}
          aria-label="Map help and keyboard shortcuts"
          title="Guide"
        >
          <Icon name="book" size={22} />
          <span>Guide</span>
        </button>
      </nav>

      <div className="map-ui map-ui--tl" role="region" aria-label="Basemap controls">
        <div className="segmented basemap-switch" role="group" aria-label="Basemap">
          <button
            className={p.basemap === "streets" ? "active" : ""}
            onClick={() => p.onBasemap("streets")}
            aria-pressed={p.basemap === "streets"}
          >
            Map
          </button>
          <button
            className={p.basemap === "satellite" ? "active" : ""}
            onClick={() => p.onBasemap("satellite")}
            aria-pressed={p.basemap === "satellite"}
          >
            Satellite
          </button>
        </div>
      </div>

      <div className="map-ui map-ui--tr" role="region" aria-label="Map controls">
        <div className="map-btn-group" role="group" aria-label="Map tools">
          <button
            className="map-btn"
            aria-label="Map layers"
            title="Layers"
            aria-expanded={layersOpen}
            onClick={() => togglePopover("layers")}
          >
            <Icon name="layers" size={20} />
          </button>
          <button
            className={p.locating ? "map-btn busy" : "map-btn"}
            aria-label="Find the parcel at my location"
            title="What parcel am I on?"
            disabled={p.locating}
            onClick={p.onLocate}
          >
            <Icon name="locate" size={20} />
          </button>
          <button className="map-btn" aria-label="Copy link to this map view" title="Copy map link" onClick={p.onShare}>
            <Icon name="link" size={19} />
          </button>
          <button
            className="map-btn map-tool-desktop"
            onClick={p.onHome}
            aria-label="Reset map to Houghton"
            title="Home market"
          >
            <Icon name="home" size={19} />
          </button>
          <button
            className="map-btn map-tool-desktop"
            aria-label="Toggle fullscreen"
            title="Fullscreen"
            onClick={p.onFullscreen}
          >
            <Icon name="expand" size={19} />
          </button>
        </div>
        <div ref={onNavHost} className="map-nav-host" />
      </div>

      {layersOpen ? (
        <section className="layers-popover" aria-label="Map layers">
          <div className="popover-head">
            <h2>Map layers</h2>
            <button className="icon-button" onClick={() => p.onPopoverChange(null)} aria-label="Close map layers">
              <Icon name="close" size={18} />
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
            <span>
              Parcel fill <span>{p.opacity}%</span>
            </span>
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
              <i className={p.basemap === "satellite" ? "swatch-satellite" : "swatch-streets"} />
              Parcel outline
            </span>
            <span>
              <i className="selected-legend" />
              Selected property
            </span>
            <div className="legend-tags" role="group" aria-label="Saved parcel colors by tag">
              {PARCEL_TAGS.map((tag) => (
                <span key={tag}>
                  <i className="tag-legend" style={{ background: TAG_COLORS[tag] }} />
                  Saved · {tagLabel(tag)}
                </span>
              ))}
            </div>
          </div>
          <p className="panel-note">Map settings are remembered in this browser.</p>
        </section>
      ) : null}

      {p.loading ? <div className="map-progress" role="progressbar" aria-label="Loading parcels" /> : null}
      {p.error ? (
        <div className="map-banner error" role="alert">
          <Icon name="alert" size={16} />
          {p.error}
        </div>
      ) : measuring ? (
        <div className="map-banner mode" role="status">
          <Icon name="ruler" size={16} />
          Measuring · tap the map to add points
        </div>
      ) : null}
      <span className="coordinate-readout" aria-hidden="true">
        {p.coordinate}
      </span>

      {p.toast ? (
        <div className="workspace-toast" role="status">
          <Icon name="info" size={18} />
          {p.toast}
        </div>
      ) : null}

      {helpOpen ? (
        <section className="help-popover" aria-label="Workspace guide">
          <div className="popover-head">
            <h2>Shortcuts &amp; tips</h2>
            <button className="icon-button" aria-label="Close guide" onClick={() => p.onPopoverChange(null)}>
              <Icon name="close" size={18} />
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

      <footer className="app-footer">
        <Icon name="info" size={15} />
        <p>
          <span className="disclaimer-full">{PARCEL_DISCLAIMER}</span>
          <span className="disclaimer-short">{PARCEL_DISCLAIMER_SHORT}</span>
        </p>
      </footer>
    </>
  );
}
