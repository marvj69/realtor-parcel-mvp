/**
 * Decorative topographic contour lines for the sign-in screen. Generated from smooth, deterministic
 * noise so they read as terrain; every fifth line is heavier, like the index contours on a topo map.
 */
const RING_COUNT = 20;

function ringPath(cx: number, cy: number, radius: number, seed: number) {
  const count = 72;
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    const wobble =
      1 +
      0.1 * Math.sin(2 * t + seed * 0.9) +
      0.07 * Math.sin(3 * t + seed * 1.7 + 1) +
      0.04 * Math.sin(5 * t - seed * 0.6 + 2);
    const r = radius * wobble;
    points.push([cx + r * Math.cos(t) * 1.18, cy + r * Math.sin(t) * 0.86]);
  }
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < count; i++) {
    const p0 = points[(i - 1 + count) % count];
    const p1 = points[i];
    const p2 = points[(i + 1) % count];
    const p3 = points[(i + 2) % count];
    d +=
      `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return `${d}Z`;
}

export default function Contours({ className = "contours" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <g fill="none" stroke="#fff" strokeLinejoin="round">
        {Array.from({ length: RING_COUNT }, (_, i) => {
          const index = i % 5 === 0;
          return (
            <path
              key={i}
              d={ringPath(430, 520, 36 + i * 34, i)}
              strokeWidth={index ? 1.6 : 1}
              strokeOpacity={index ? 0.26 : 0.13}
            />
          );
        })}
      </g>
    </svg>
  );
}
