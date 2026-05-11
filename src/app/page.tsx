import ParcelMap from "@/components/ParcelMap";

export default function HomePage() {
  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Local-first parcel intelligence</p>
          <h1>Realtor Parcel MVP</h1>
        </div>
        <div className="topbar-note">MapLibre + Neon/PostGIS</div>
      </header>
      <ParcelMap />
    </main>
  );
}
