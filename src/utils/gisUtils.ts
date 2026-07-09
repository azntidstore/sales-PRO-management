import { Vertex, Segment } from "../types";
import { SupportedCRS, activeLambertToLatLng, latLngToActiveLambert } from "./projectionManager";

// Backup Moroccan Lambert Grid local projection configuration
export const originX = 360000;
export const originY = 410000;
export const originLat = 33.5731; // Casablanca
export const originLng = -7.5898;

/**
 * Projects local Lambert plane coordinates (in meters) to standard Lat/Lng for Leaflet.
 */
export function planeToLatLng(x: number, y: number, activeCRS: SupportedCRS = "EPSG:26191"): [number, number] {
  return activeLambertToLatLng(x, y, activeCRS);
}

/**
 * Projects standard Lat/Lng back to raw Lambert plane coordinates (in meters).
 */
export function latLngToPlane(lat: number, lng: number, activeCRS: SupportedCRS = "EPSG:26191"): { x: number; y: number } {
  return latLngToActiveLambert(lat, lng, activeCRS);
}

/**
 * Calculates the geodesic or local area of a polygon using the shoelace algorithm (in m²)
 */
export function calculatePolygonArea(vertices: { x: number; y: number }[]): number {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area / 2);
}

/**
 * Calculates the perimeter of a polygon (in meters)
 */
export function calculatePolygonPerimeter(vertices: { x: number; y: number }[]): number {
  let perimeter = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const dx = vertices[j].x - vertices[i].x;
    const dy = vertices[j].y - vertices[i].y;
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  return perimeter;
}

/**
 * Formats the area in official French & Arabic Hectares-Ares-Centiares (H - A - Ca) system
 */
export function formatAreaHac(areaM2: number): { fr: string; ar: string; combined: string } {
  const hectares = Math.floor(areaM2 / 10000);
  const remaining = areaM2 - hectares * 10000;
  const ares = Math.floor(remaining / 100);
  const centiares = (remaining % 100).toFixed(2);

  const fr = `${hectares} H ${ares} A ${centiares} Ca`;
  const ar = `${hectares} هـ ${ares} آ ${centiares} ج`;
  return {
    fr,
    ar,
    combined: `${fr} ( ${ar} )`
  };
}

/**
 * Re-indexes vertices P1, P2... and rebuilds segments with updated spatial calculations
 */
export function buildSegmentsAndStats(
  vertices: Vertex[],
  existingNeighbors: Record<number, string> = {}
): Segment[] {
  const segments: Segment[] = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const startVertex = vertices[i];
    const endVertex = vertices[(i + 1) % n];
    const dx = endVertex.x - startVertex.x;
    const dy = endVertex.y - startVertex.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    const id = i + 1;
    segments.push({
      id,
      startLabel: startVertex.label,
      endLabel: endVertex.label,
      startVertex,
      endVertex,
      length,
      neighbor: existingNeighbors[id] || ""
    });
  }
  return segments;
}

/**
 * Calculates the segment center point for placing map annotations
 */
export function getSegmentMidpoint(v1: Vertex, v2: Vertex): { x: number; y: number } {
  return {
    x: (v1.x + v2.x) / 2,
    y: (v1.y + v2.y) / 2
  };
}

/**
 * Calculates the angle of a segment in degrees, bounded for clean map labels.
 */
export function getSegmentAngle(v1: Vertex, v2: Vertex): number {
  let angle = Math.atan2(v2.y - v1.y, v2.x - v1.x) * (180 / Math.PI);
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  return angle;
}

/**
 * Offset annotation point to place it on the outside of the polygon boundary.
 */
export function getOutsidePoint(
  centroid: { x: number; y: number },
  v1: Vertex,
  v2: Vertex,
  offsetMeters: number = 8
): { x: number; y: number } {
  const mx = (v1.x + v2.x) / 2;
  const my = (v1.y + v2.y) / 2;
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return { x: mx, y: my };

  // Calculate outside normals
  const nx1 = -dy / length;
  const ny1 = dx / length;
  
  const nx2 = dy / length;
  const ny2 = -dx / length;

  const px1 = mx + nx1 * offsetMeters;
  const py1 = my + ny1 * offsetMeters;

  const px2 = mx + nx2 * offsetMeters;
  const py2 = my + ny2 * offsetMeters;

  // Test distance from center - we want the point furthest from the polygon centroid
  const d1 = Math.sqrt((px1 - centroid.x) ** 2 + (py1 - centroid.y) ** 2);
  const d2 = Math.sqrt((px2 - centroid.x) ** 2 + (py2 - centroid.y) ** 2);

  return d1 > d2 ? { x: px1, y: py1 } : { x: px2, y: py2 };
}

/**
 * Calculates the geometric centroid of a polygon.
 */
export function calculateCentroid(vertices: Vertex[]): { x: number; y: number } {
  let xs = 0;
  let ys = 0;
  for (const v of vertices) {
    xs += v.x;
    ys += v.y;
  }
  return {
    x: xs / vertices.length,
    y: ys / vertices.length
  };
}
