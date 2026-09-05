export type Point = { x: number; y: number };
export type ScanEdit = {
  corners: Point[];
  mode: "color" | "gray" | "bw";
  rotate: boolean | number;
};
export function validCorners(points: Point[]): boolean {
  if (
    points.length !== 4 ||
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        p.x < 0 ||
        p.x > 1 ||
        p.y < 0 ||
        p.y > 1,
    )
  )
    return false;
  const cross = points.map((a, i) => {
    const b = points[(i + 1) % 4]!,
      c = points[(i + 2) % 4]!;
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  });
  const area =
    Math.abs(
      points.reduce((sum, p, i) => {
        const q = points[(i + 1) % 4]!;
        return sum + p.x * q.y - q.x * p.y;
      }, 0),
    ) / 2;
  return cross.every((n) => n > 0.0001) && area > 0.02;
}
export function projectiveMap(
  points: Point[],
): (u: number, v: number) => Point {
  const [p0, p1, p2, p3] = points as [Point, Point, Point, Point];
  const dx1 = p1.x - p2.x,
    dx2 = p3.x - p2.x,
    dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y,
    dy2 = p3.y - p2.y,
    dy3 = p0.y - p1.y + p2.y - p3.y;
  const denominator = dx1 * dy2 - dx2 * dy1;
  const g =
    Math.abs(denominator) < 1e-10 ? 0 : (dx3 * dy2 - dx2 * dy3) / denominator;
  const h =
    Math.abs(denominator) < 1e-10 ? 0 : (dx1 * dy3 - dx3 * dy1) / denominator;
  const a = p1.x - p0.x + g * p1.x,
    b = p3.x - p0.x + h * p3.x;
  const d = p1.y - p0.y + g * p1.y,
    e = p3.y - p0.y + h * p3.y;
  return (u, v) => {
    const z = g * u + h * v + 1;
    return { x: (a * u + b * v + p0.x) / z, y: (d * u + e * v + p0.y) / z };
  };
}
