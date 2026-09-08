"use client";
import { useState } from "react";
import Icon, { type IconName } from "@/components/Icon";
import { PARCEL_DISCLAIMER } from "@/lib/parcel-presentation";
import type { AppPanel } from "@/types/measurement";

const NAV: [AppPanel, string, IconName][] = [
  ["search", "Explore", "search"],
  ["details", "Property", "pin"],
  ["saved", "Projects", "folder"],
  ["compare", "Compare", "compare"],
  ["measure", "Measure", "ruler"],
  ["offline", "Offline", "download"]
];
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

export default function WorkspaceChrome(p: Props) {
  const [layersOpen, setLayersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  function search() {
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
        <button className="header-search" aria-label="Find a property" onClick={search}>
          <Icon name="search" size={16} />
          <span>Find a property</span>
          <kbd>/</kbd>
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
          onClick={() => setHelpOpen(!helpOpen)}
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
            className={layersOpen ? "map-tool active" : "map-tool"}
            aria-label="Map layers"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen(!layersOpen)}
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
            <button className="icon-button" onClick={() => setLayersOpen(false)} aria-label="Close map layers">
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
          </div>
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
            <button className="icon-button" aria-label="Close guide" onClick={() => setHelpOpen(false)}>
              <Icon name="close" size={17} />
            </button>
          </div>
          <p>
            Zoom in to see parcel outlines. Select a property for its record, then save it to a project or add it to a
            comparison.
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
              <dt>Map only</dt>
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
        <span>{PARCEL_DISCLAIMER}</span>
      </footer>
    </>
  );
}
