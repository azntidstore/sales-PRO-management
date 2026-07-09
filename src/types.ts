export interface Vertex {
  id: number;
  label: string;
  x: number; // Raw plane coordinate X in meters
  y: number; // Raw plane coordinate Y in meters
}

export interface Segment {
  id: number;
  startLabel: string;
  endLabel: string;
  startVertex: Vertex;
  endVertex: Vertex;
  length: number; // Calculated length in meters
  neighbor: string; // The neighbor's name/title
}

export interface Parcel {
  id: string;
  name: string;
  vertices: Vertex[];
  segments: Segment[];
  area: number; // m²
  perimeter: number; // meters
  attributes?: Record<string, string>; // Described attributes table from GIS shapefiles/KML
}

export interface DocumentSettings {
  ministryFr: string;
  ministryAr: string;
  planTitle: string;
  author: string;
  service: string;
  date: string;
  logoUrl: string;
  gridInterval: number; // in meters
  northArrowSize: number; // in mm
  pageFormat: "A4" | "A3" | "A2" | "A1" | "A0";
  mapLabels: "Aucun" | "Longueurs" | "Voisins" | "Longueurs + Voisins";
  projectionSystem: string; // Coordinate Reference System Name (CRS)
  scaleMode?: "auto" | "100" | "250" | "500" | "1000" | "2500" | "5000" | "custom";
  customScale?: number;
  dossierNumber: string;
  vertexPrefixType?: "P" | "B" | "Custom" | "None";
  customPrefix?: string;
  vertexFontSize?: number;
  labelFontSize?: number;
  labelOffset?: number;
}
