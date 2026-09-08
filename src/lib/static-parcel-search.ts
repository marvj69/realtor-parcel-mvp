import { DatabaseSync, getParcelManifest, openParcelAsset } from "./static-parcel-assets";
import { ParcelSearch } from "./parcel-search";

let pending: Promise<ParcelSearch> | undefined;

export function getStaticParcelSearch(): Promise<ParcelSearch> {
  pending ??= (async () => {
    const manifest = await getParcelManifest();
    if (!manifest.search) {
      // Older encrypted releases remain usable during refreshes and rollback.
      const { getStaticParcels } = await import("./static-parcels");
      return new ParcelSearch((await getStaticParcels()).db);
    }
    const path = await openParcelAsset(manifest, manifest.search, "search");
    const db = new DatabaseSync(path, { readOnly: true });
    db.exec("PRAGMA query_only=ON; PRAGMA cache_size=-8192;");
    if (Number(db.prepare("SELECT count(*) n FROM parcels").get()!.n) !== manifest.count) {
      db.close();
      throw new Error("Parcel search count mismatch");
    }
    return new ParcelSearch(db, true);
  })().catch(error => { pending = undefined; throw error; });
  return pending;
}
