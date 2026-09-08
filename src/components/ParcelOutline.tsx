import type { ParcelFeature } from "@/types/parcel";

export default function ParcelOutline({ parcel }: { parcel: ParcelFeature }) {
  const polygons = parcel.geometry.type === "Polygon" ? [parcel.geometry.coordinates] : parcel.geometry.coordinates;
  const points = polygons.flat(2);
  let west = Infinity,
    east = -Infinity,
    south = Infinity,
    north = -Infinity;
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const xScale = Math.cos((((north + south) / 2) * Math.PI) / 180);
  const width = (east - west) * xScale,
    height = north - south;
  const scale = 110 / Math.max(width, height, 0.000001);
  const paths = polygons.map((rings) =>
    rings
      .map(
        (ring) =>
          ring
            .map(
              ([lng, lat], i) =>
                `${i ? "L" : "M"}${(80 + ((lng - west) * xScale - width / 2) * scale).toFixed(2)},${(
                  70 -
                  (lat - south - height / 2) * scale
                ).toFixed(2)}`
            )
            .join(" ") + "Z"
      )
      .join(" ")
  );
  return (
    <svg className="parcel-outline" viewBox="0 0 160 140" role="img" aria-label="Approximate parcel boundary shape">
      <path className="outline-grid" d="M0 35h160M0 70h160M0 105h160M40 0v140M80 0v140M120 0v140" />
      {paths.map((d, i) => (
        <path key={i} d={d} fillRule="evenodd" />
      ))}
      <text x="146" y="17">
        N ↑
      </text>
    </svg>
  );
}
