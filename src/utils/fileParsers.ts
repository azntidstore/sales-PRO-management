import { Vertex, Parcel } from "../types";
// @ts-ignore
import shp from "shpjs";
import JSZip from "jszip";
// @ts-ignore
import * as XLSX from "xlsx";

export interface ParsedFeature {
  name: string;
  vertices: { x: number; y: number }[]; // loaded coordinates
  isGeographic: boolean; // true if coordinates are dec degrees [Lng, Lat]
  attributes: Record<string, string>;
}

/**
 * Parses raw GeoJSON coordinate arrays into vertices.
 */
function parseCoordinates(coords: any[][]): { vertices: { x: number; y: number }[]; isGeographic: boolean } {
  const vertices: { x: number; y: number }[] = [];
  const outerRing = coords[0];
  if (!outerRing) return { vertices: [], isGeographic: false };

  let looksGeographic = true;

  outerRing.forEach((c: any) => {
    const lng = c[0];
    const lat = c[1];
    if (typeof lng === "number" && typeof lat === "number") {
      vertices.push({ x: lng, y: lat });
      
      // If it's outside geographic bounds, it must be projected meters
      if (Math.abs(lng) > 180 || Math.abs(lat) > 90) {
        looksGeographic = false;
      }
    }
  });

  // Clean winding coordinates (remove closing duplicate if any)
  if (vertices.length > 3) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
      vertices.pop();
    }
  }

  return {
    vertices,
    isGeographic: looksGeographic && vertices.length > 0,
  };
}

/**
 * Converts a GeoJSON Feature or FeatureCollection (possibly from shpjs) into our list of ParsedFeatures.
 */
export function convertGeoJSONToParsedFeatures(geojson: any, fallbackName: string = "Parcelle"): ParsedFeature[] {
  const features: ParsedFeature[] = [];

  const handleFeature = (feat: any, index: number) => {
    const geom = feat.geometry;
    if (!geom) return;

    const properties = feat.properties || {};
    const attributes: Record<string, string> = {};
    Object.keys(properties).forEach((k) => {
      if (k === "__proto__" || k === "constructor" || k === "prototype") return;
      attributes[k] = properties[k] !== null && properties[k] !== undefined ? String(properties[k]).trim() : "";
    });

    // Try multiple candidate fields for default Name
    const nameCandidates = ["name", "Nom", "nom", "id", "ID", "TITRE", "titre", "TFX", "tfx", "Name", "NAME", "parcel_id", "parcelle", "ref"];
    let name = "";
    for (const cand of nameCandidates) {
      if (attributes[cand]) {
        name = attributes[cand];
        break;
      }
    }
    if (!name) {
      name = `${fallbackName} ${index + 1}`;
    }

    if (geom.type === "Polygon") {
      const parsed = parseCoordinates(geom.coordinates);
      if (parsed.vertices.length >= 3) {
        features.push({
          name,
          vertices: parsed.vertices,
          isGeographic: parsed.isGeographic,
          attributes,
        });
      }
    } else if (geom.type === "MultiPolygon") {
      geom.coordinates.forEach((polyCoords: any[][], polyIdx: number) => {
        const parsed = parseCoordinates(polyCoords);
        if (parsed.vertices.length >= 3) {
          features.push({
            name: `${name} (Partie ${polyIdx + 1})`,
            vertices: parsed.vertices,
            isGeographic: parsed.isGeographic,
            attributes,
          });
        }
      });
    }
  };

  if (!geojson) return features;

  if (Array.isArray(geojson)) {
    geojson.forEach((layerItem, layerIdx) => {
      const subFeatures = convertGeoJSONToParsedFeatures(layerItem, `${fallbackName}-L${layerIdx + 1}`);
      features.push(...subFeatures);
    });
  } else if (geojson.type === "FeatureCollection" && Array.isArray(geojson.features)) {
    geojson.features.forEach((feat: any, idx: number) => {
      handleFeature(feat, idx);
    });
  } else if (geojson.type === "Feature") {
    handleFeature(geojson, 0);
  } else if (geojson.type === "Polygon") {
    const parsed = parseCoordinates(geojson.coordinates);
    if (parsed.vertices.length >= 3) {
      features.push({
        name: fallbackName,
        vertices: parsed.vertices,
        isGeographic: parsed.isGeographic,
        attributes: {},
      });
    }
  }

  return features;
}

/**
 * Real client-side KML Polygon/LineString parser using standard DOMParser,
 * reinforced with ultimate regex fallbacks to parse even non-standard or malformed namespaces.
 */
export function parseKML(text: string): ParsedFeature[] {
  const features: ParsedFeature[] = [];

  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, "text/xml");
    
    // Check for parse errors
    const parserError = xmlDoc.getElementsByTagName("parsererror")[0] || xmlDoc.getElementsByTagNameNS("*", "parsererror")[0];
    if (!parserError) {
      // Find placemarks case-insensitively, namespace-insensitively, and with fallbacks
      let placemarks = Array.from(xmlDoc.getElementsByTagNameNS("*", "Placemark"));
      if (placemarks.length === 0) {
        placemarks = Array.from(xmlDoc.getElementsByTagNameNS("*", "placemark"));
      }
      if (placemarks.length === 0) {
        placemarks = Array.from(xmlDoc.getElementsByTagName("Placemark"));
      }
      if (placemarks.length === 0) {
        placemarks = Array.from(xmlDoc.getElementsByTagName("placemark"));
      }

      for (let i = 0; i < placemarks.length; i++) {
        const pm = placemarks[i];
        
        // Get name & attributes with namespace-insensitive tags
        let name = "";
        let nameNode = pm.getElementsByTagNameNS("*", "name")[0] || 
                       pm.getElementsByTagNameNS("*", "Name")[0] || 
                       pm.getElementsByTagName("name")[0] || 
                       pm.getElementsByTagName("Name")[0];
                       
        if (nameNode && nameNode.textContent) {
          name = nameNode.textContent.trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
        }

        const attributes: Record<string, string> = {
          ID: `KML-${i + 1}`,
          Nom: name,
          Source: "KML Import",
        };

        // Parse extended data schemas if any exist
        let dataNodes = Array.from(pm.getElementsByTagNameNS("*", "SimpleData"));
        if (dataNodes.length === 0) {
          dataNodes = Array.from(pm.getElementsByTagName("SimpleData"));
        }
        for (let d = 0; d < dataNodes.length; d++) {
          const dataNode = dataNodes[d];
          const attrName = dataNode.getAttribute("name");
          if (attrName && dataNode.textContent) {
            attributes[attrName] = dataNode.textContent.trim();
          }
        }

        // Now look for ALL <coordinates> nodes within this placemark (ignoring namespace)
        let coordsNodes = Array.from(pm.getElementsByTagNameNS("*", "coordinates"));
        if (coordsNodes.length === 0) {
          coordsNodes = Array.from(pm.getElementsByTagNameNS("*", "Coordinates"));
        }
        if (coordsNodes.length === 0) {
          coordsNodes = Array.from(pm.getElementsByTagName("coordinates"));
        }
        if (coordsNodes.length === 0) {
          coordsNodes = Array.from(pm.getElementsByTagName("Coordinates"));
        }

        let geomIdx = 0;
        for (let cIdx = 0; cIdx < coordsNodes.length; cIdx++) {
          const coordsNode = coordsNodes[cIdx];
          if (!coordsNode || !coordsNode.textContent) continue;

          let rawCoords = coordsNode.textContent.trim();
          if (!rawCoords) continue;

          // Replace spaces around commas first
          rawCoords = rawCoords.replace(/\s*,\s*/g, ",");
          
          // Coordinate sequences in KML are separated by whitespace
          const coordinatePairs = rawCoords.split(/\s+/);
          const vertices: { x: number; y: number }[] = [];

          coordinatePairs.forEach((pair) => {
            const parts = pair.split(",");
            if (parts.length >= 2) {
              const lng = parseFloat(parts[0]);
              const lat = parseFloat(parts[1]);
              if (!isNaN(lng) && !isNaN(lat)) {
                vertices.push({ x: lng, y: lat });
              }
            }
          });

          // Clean winding coordinates (remove closing duplicate if any)
          if (vertices.length > 3) {
            const first = vertices[0];
            const last = vertices[vertices.length - 1];
            if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
              vertices.pop();
            }
          }

          if (vertices.length >= 3) {
            const finalName = name 
              ? (coordsNodes.length > 1 ? `${name} (Géométrie ${geomIdx + 1})` : name) 
              : `Parcelle KML ${features.length + 1}`;
            
            // Dynamically detect if coordinates are geographic (degrees) rather than projected meters
            const isGeog = vertices.every(v => Math.abs(v.x) <= 180 && Math.abs(v.y) <= 90);
            
            features.push({
              name: finalName,
              vertices,
              isGeographic: isGeog,
              attributes: { ...attributes, Nom: finalName },
            });
            geomIdx++;
          }
        }
      }
    }
  } catch (err) {
    console.error("DOMParser fallback for KML:", err);
  }

  // ULTIMATE FALLBACK: If XML DOM parser fails to extract features or errors out, parse via robust custom REGEX
  if (features.length === 0) {
    // Extract everything between Placemark tags, with case-insensitivity and optional namespace prefix
    const pmRegex = /<([a-zA-Z0-9_]+:)?placemark[\s>][\s\S]*?<\/([a-zA-Z0-9_]+:)?placemark>/gi;
    let match;
    let index = 0;
    while ((match = pmRegex.exec(text)) !== null) {
      const pmContent = match[0];
      
      // Parse name supporting optional namespace prefix
      const nameMatch = pmContent.match(/<(?:[a-zA-Z0-9_]+:)?(?:name|Name)[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?(?:name|Name)>/i);
      let name = nameMatch ? nameMatch[1].trim() : "";
      // Strip CDATA tags
      name = name.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");

      const attributes: Record<string, string> = {
        ID: `KML-REG-${index + 1}`,
        Nom: name,
        Source: "KML Regex Fallback",
      };

      // Extract SimpleData / ExtendedData attributes if any
      const dataRegex = /<([a-zA-Z0-9_]+:)?SimpleData\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/([a-zA-Z0-9_]+:)?SimpleData>/gi;
      let dMatch;
      while ((dMatch = dataRegex.exec(pmContent)) !== null) {
        const attrName = dMatch[2];
        let attrValue = dMatch[3].trim();
        attrValue = attrValue.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
        attributes[attrName] = attrValue;
      }

      // Parse coordinates (inside Placemark) supporting namespace prefixes
      const coordsRegex = /<(?:[a-zA-Z0-9_]+:)?(?:coordinates|Coordinates)[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_]+:)?(?:coordinates|Coordinates)>/i;
      const coordsMatch = pmContent.match(coordsRegex);
      if (coordsMatch) {
        let rawCoords = coordsMatch[1].trim();
        rawCoords = rawCoords.replace(/\s*,\s*/g, ",");
        const coordinatePairs = rawCoords.split(/\s+/);
        const vertices: { x: number; y: number }[] = [];

        coordinatePairs.forEach((pair) => {
          const parts = pair.split(",");
          if (parts.length >= 2) {
            const lng = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            if (!isNaN(lng) && !isNaN(lat)) {
              vertices.push({ x: lng, y: lat });
            }
          }
        });

        if (vertices.length > 3) {
          const first = vertices[0];
          const last = vertices[vertices.length - 1];
          if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
            vertices.pop();
          }
        }

        if (vertices.length >= 3) {
          const finalName = name || `Parcelle KML Extrait ${features.length + 1}`;
          const isGeog = vertices.every(v => Math.abs(v.x) <= 180 && Math.abs(v.y) <= 90);
          features.push({
            name: finalName,
            vertices,
            isGeographic: isGeog,
            attributes: { ...attributes, Nom: finalName }
          });
        }
      }
      index++;
    }
  }

  // GLOBAL ULTIMATE COORD SCANNING (If still has NO features, scan any coordinates block)
  if (features.length === 0) {
    const coordsRegexGlobal = /<(?:coordinates|Coordinates)[^>]*>([\s\S]*?)<\/(?:coordinates|Coordinates)>/gi;
    let match;
    let idx = 0;
    while ((match = coordsRegexGlobal.exec(text)) !== null) {
      let rawCoords = match[1].trim();
      rawCoords = rawCoords.replace(/\s*,\s*/g, ",");
      const coordinatePairs = rawCoords.split(/\s+/);
      const vertices: { x: number; y: number }[] = [];

      coordinatePairs.forEach((pair) => {
        const parts = pair.split(",");
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lng) && !isNaN(lat)) {
            vertices.push({ x: lng, y: lat });
          }
        }
      });

      if (vertices.length > 3) {
        const first = vertices[0];
        const last = vertices[vertices.length - 1];
        if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
          vertices.pop();
        }
      }

      if (vertices.length >= 3) {
        const isGeog = vertices.every(v => Math.abs(v.x) <= 180 && Math.abs(v.y) <= 90);
        features.push({
          name: `Parcelle KML Brute #${idx + 1}`,
          vertices,
          isGeographic: isGeog,
          attributes: { Nom: `Parcelle KML Brute #${idx + 1}`, Source: "KML Direct Coord Regex Scan" },
        });
        idx++;
      }
    }
  }

  // POINT GROUPING FALLBACK: If NO complex geometries were loaded, check for individual <Point> placemarks!
  if (features.length === 0) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      let placemarks = Array.from(xmlDoc.getElementsByTagNameNS("*", "Placemark"));
      if (placemarks.length === 0) placemarks = Array.from(xmlDoc.getElementsByTagName("Placemark"));
      
      const collectedPoints: { x: number; y: number; name: string }[] = [];
      
      for (let i = 0; i < placemarks.length; i++) {
        const pm = placemarks[i];
        const pointNode = pm.getElementsByTagNameNS("*", "Point")[0] || pm.getElementsByTagName("Point")[0];
        if (pointNode) {
          let name = "";
          const nameNode = pm.getElementsByTagNameNS("*", "name")[0] || pm.getElementsByTagName("name")[0];
          if (nameNode && nameNode.textContent) {
            name = nameNode.textContent.trim().replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1");
          }
          
          const coordNode = pm.getElementsByTagNameNS("*", "coordinates")[0] || pm.getElementsByTagName("coordinates")[0];
          if (coordNode && coordNode.textContent) {
            let raw = coordNode.textContent.trim();
            raw = raw.replace(/\s*,\s*/g, ",");
            const firstCoord = raw.split(/\s+/)[0];
            if (firstCoord) {
              const parts = firstCoord.split(",");
              if (parts.length >= 2) {
                const x = parseFloat(parts[0]);
                const y = parseFloat(parts[1]);
                if (!isNaN(x) && !isNaN(y)) {
                  collectedPoints.push({ x, y, name });
                }
              }
            }
          }
        }
      }
      
      if (collectedPoints.length >= 3) {
        const vertices = collectedPoints.map(p => ({ x: p.x, y: p.y }));
        const isGeog = vertices.every(v => Math.abs(v.x) <= 180 && Math.abs(v.y) <= 90);
        
        features.push({
          name: "Collection de points KML",
          vertices,
          isGeographic: isGeog,
          attributes: {
            ID: "KML-POINTS",
            Nom: "Collection de points KML",
            Points: String(vertices.length),
            Source: "KML Point-Group Fallback"
          }
        });
      }
    } catch (err) {
      console.error("KML point-group fallback failed:", err);
    }
  }

  return features;
}

/**
 * Real client-side DXF LWPOLYLINE/POLYLINE/LINE coordinate extraction parser.
 * Auto-assembles disjoint LINE segments into continuous polygons.
 */
export function parseDXF(text: string): ParsedFeature[] {
  const lines = text.split(/\r?\n/);
  const pairs: { code: number; value: string }[] = [];
  
  let i = 0;
  while (i < lines.length) {
    const codeStr = lines[i].trim();
    if (codeStr === "") {
      i++;
      continue;
    }
    const code = parseInt(codeStr, 10);
    if (isNaN(code)) {
      i++;
      continue;
    }
    const value = lines[i + 1] ? lines[i + 1].trim() : "";
    pairs.push({ code, value });
    i += 2;
  }

  const simplePolylines: { vertices: { x: number; y: number }[]; layer: string; isClosed: boolean }[] = [];
  const rawLines: { p1: { x: number; y: number }; p2: { x: number; y: number }; layer: string }[] = [];

  let currentEntityName: string | null = null;
  let currentLayer = "0";

  // POLYLINE sub-entity parsing state
  const activePolylineVertices: { x: number; y: number }[] = [];
  let activePolylineLayer = "0";
  let activePolylineClosed = false;

  // Transient builders for active LWPOLYLINE and LINE entities
  let currentLWVertices: { x: number; y: number }[] = [];
  let currentLWClosed = false;

  let currentLineStart: { x: number; y: number } | null = null;
  let currentLineEnd: { x: number; y: number } | null = null;

  let vertexX: number = NaN;
  let vertexY: number = NaN;

  const commitPrevious = () => {
    if (currentEntityName === "LWPOLYLINE") {
      if (currentLWVertices.length >= 2) {
        simplePolylines.push({
          vertices: [...currentLWVertices],
          layer: currentLayer,
          isClosed: currentLWClosed,
        });
      }
      currentLWVertices = [];
      currentLWClosed = false;
    } else if (currentEntityName === "LINE") {
      if (currentLineStart && currentLineEnd) {
        rawLines.push({
          p1: { ...currentLineStart },
          p2: { ...currentLineEnd },
          layer: currentLayer,
        });
      }
      currentLineStart = null;
      currentLineEnd = null;
    }
  };

  for (const pair of pairs) {
    const { code, value } = pair;
    const valUpper = value.toUpperCase();

    if (code === 0) {
      commitPrevious();
      currentEntityName = valUpper;

      if (valUpper === "POLYLINE") {
        activePolylineVertices.length = 0;
        activePolylineLayer = currentLayer;
        activePolylineClosed = false;
      } else if (valUpper === "VERTEX") {
        vertexX = NaN;
        vertexY = NaN;
      } else if (valUpper === "SEQEND") {
        if (activePolylineVertices.length >= 2) {
          simplePolylines.push({
            vertices: [...activePolylineVertices],
            layer: activePolylineLayer,
            isClosed: activePolylineClosed,
          });
        }
        activePolylineVertices.length = 0;
      }
    } else {
      if (code === 8) {
        currentLayer = value;
        if (currentEntityName === "POLYLINE") {
          activePolylineLayer = value;
        }
      } else if (code === 70) {
        const flag = parseInt(value, 10);
        if (!isNaN(flag)) {
          if (currentEntityName === "LWPOLYLINE") {
            currentLWClosed = (flag & 1) !== 0;
          } else if (currentEntityName === "POLYLINE") {
            activePolylineClosed = (flag & 1) !== 0;
          }
        }
      }

      // LWPOLYLINE vertex parsing
      if (currentEntityName === "LWPOLYLINE") {
        if (code === 10) {
          currentLWVertices.push({ x: parseFloat(value), y: 0 });
        } else if (code === 20) {
          if (currentLWVertices.length > 0) {
            currentLWVertices[currentLWVertices.length - 1].y = parseFloat(value);
          }
        }
      } 
      // VERTEX processing for older POLYLINE
      else if (currentEntityName === "VERTEX") {
        if (code === 10) {
          vertexX = parseFloat(value);
        } else if (code === 20) {
          vertexY = parseFloat(value);
          if (!isNaN(vertexX) && !isNaN(vertexY)) {
            activePolylineVertices.push({ x: vertexX, y: vertexY });
          }
        }
      } 
      // LINE segment processing
      else if (currentEntityName === "LINE") {
        if (code === 10) {
          if (!currentLineStart) currentLineStart = { x: 0, y: 0 };
          currentLineStart.x = parseFloat(value);
        } else if (code === 20) {
          if (!currentLineStart) currentLineStart = { x: 0, y: 0 };
          currentLineStart.y = parseFloat(value);
        } else if (code === 11) {
          if (!currentLineEnd) currentLineEnd = { x: 0, y: 0 };
          currentLineEnd.x = parseFloat(value);
        } else if (code === 21) {
          if (!currentLineEnd) currentLineEnd = { x: 0, y: 0 };
          currentLineEnd.y = parseFloat(value);
        }
      }
    }
  }

  // Commit last parsed entity
  commitPrevious();

  // Jointure algorithm for loose LINE segments (highly common in surveyor CAD exports)
  // We use an O(N) Spatial Hashing / Hash Grid approach that groups segments by layer,
  // preventing browser tab freeze on large DXF files.
  interface Point { x: number; y: number; }
  const gridSize = 0.1; // 10 cm grid bucket 
  const tolerance = 0.02; // 2 cm matching tolerance
  const toleranceSq = tolerance * tolerance;

  const getGridKeys = (p: Point): string[] => {
    const gx = Math.round(p.x / gridSize);
    const gy = Math.round(p.y / gridSize);
    const keys: string[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        keys.push(`${gx + dx},${gy + dy}`);
      }
    }
    return keys;
  };

  const getPrimaryGridKey = (p: Point): string => {
    return `${Math.round(p.x / gridSize)},${Math.round(p.y / gridSize)}`;
  };

  // Group raw lines by layer
  const linesByLayer: Record<string, typeof rawLines> = {};
  for (const line of rawLines) {
    if (!linesByLayer[line.layer]) {
      linesByLayer[line.layer] = [];
    }
    linesByLayer[line.layer].push(line);
  }

  for (const [layer, layerLines] of Object.entries(linesByLayer)) {
    // Safety guard to avoid parsing astronomical drawings that are not land parcels
    if (layerLines.length > 15000) {
      console.warn(`Calque ${layer} contient trop de lignes libres (${layerLines.length}). Suspension du regroupement automatique.`);
      continue;
    }

    const wrapped = layerLines.map((l, idx) => ({
      id: idx,
      p1: l.p1,
      p2: l.p2,
      used: false,
    }));

    // Build the grid index for both endpoints
    const grid = new Map<string, typeof wrapped>();
    const addToGrid = (p: Point, item: typeof wrapped[0]) => {
      const key = getPrimaryGridKey(p);
      let list = grid.get(key);
      if (!list) {
        list = [];
        grid.set(key, list);
      }
      list.push(item);
    };

    for (const item of wrapped) {
      addToGrid(item.p1, item);
      addToGrid(item.p2, item);
    }

    // Helper to find an unused adjacent segment
    const findAdjacent = (p: Point): { item: typeof wrapped[0]; isP1: boolean } | null => {
      const keys = getGridKeys(p);
      for (const key of keys) {
        const candidates = grid.get(key);
        if (!candidates) continue;
        for (const cand of candidates) {
          if (cand.used) continue;
          
          // Check distance to p1
          const distSq1 = (cand.p1.x - p.x) ** 2 + (cand.p1.y - p.y) ** 2;
          if (distSq1 <= toleranceSq) {
            return { item: cand, isP1: true };
          }
          // Check distance to p2
          const distSq2 = (cand.p2.x - p.x) ** 2 + (cand.p2.y - p.y) ** 2;
          if (distSq2 <= toleranceSq) {
            return { item: cand, isP1: false };
          }
        }
      }
      return null;
    };

    for (const startItem of wrapped) {
      if (startItem.used) continue;

      startItem.used = true;
      const path: Point[] = [startItem.p1, startItem.p2];

      // Grow path from end
      let growing = true;
      while (growing) {
        const endPoint = path[path.length - 1];
        const next = findAdjacent(endPoint);
        if (next) {
          next.item.used = true;
          path.push(next.isP1 ? next.item.p2 : next.item.p1);
        } else {
          growing = false;
        }
      }

      // Grow path from start (prepend)
      growing = true;
      while (growing) {
        const startPoint = path[0];
        const next = findAdjacent(startPoint);
        if (next) {
          next.item.used = true;
          path.unshift(next.isP1 ? next.item.p2 : next.item.p1);
        } else {
          growing = false;
        }
      }

      if (path.length >= 3) {
        const startPoint = path[0];
        const endPoint = path[path.length - 1];
        const isClosed = (startPoint.x - endPoint.x) ** 2 + (startPoint.y - endPoint.y) ** 2 <= toleranceSq;
        simplePolylines.push({
          vertices: path,
          layer,
          isClosed,
        });
      }
    }
  }

  // Convert all gathered polylines to ParsedFeatures
  const features: ParsedFeature[] = [];

  simplePolylines.forEach((poly) => {
    const vertices = [...poly.vertices];

    if (vertices.length > 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.abs(first.x - last.x) < 0.005 && Math.abs(first.y - last.y) < 0.005) {
        vertices.pop();
      }
    }

    if (vertices.length >= 3) {
      const displayName = poly.layer !== "0" ? poly.layer : "Parcelle DXF";
      features.push({
        name: `${displayName} #${features.length + 1}`,
        vertices,
        isGeographic: false,
        attributes: {
          ID: `DXF-${features.length + 1}`,
          Calque: poly.layer,
          Type: poly.isClosed ? "Contour Fermé" : "Contour Ouvert",
          Métrique: "Projetée locale",
          Points: String(vertices.length),
        }
      });
    }
  });

  // Fallback: If no features were created, scan the DXF text directly for all sequential coordinate pairs
  if (features.length === 0) {
    const allX: number[] = [];
    const allY: number[] = [];
    
    for (let pIdx = 0; pIdx < pairs.length - 1; pIdx++) {
      const p = pairs[pIdx];
      const next = pairs[pIdx + 1];
      if (p.code === 10) {
        const val = parseFloat(next.value);
        if (!isNaN(val)) allX.push(val);
      } else if (p.code === 20) {
        const val = parseFloat(next.value);
        if (!isNaN(val)) allY.push(val);
      }
    }
    
    const fallbackVertices: { x: number; y: number }[] = [];
    const minLength = Math.min(allX.length, allY.length);
    for (let vIdx = 0; vIdx < minLength; vIdx++) {
      fallbackVertices.push({ x: allX[vIdx], y: allY[vIdx] });
    }
    
    const uniqueVerts: { x: number; y: number }[] = [];
    fallbackVertices.forEach((v) => {
      if (uniqueVerts.length === 0) {
        uniqueVerts.push(v);
      } else {
        const last = uniqueVerts[uniqueVerts.length - 1];
        if (Math.abs(last.x - v.x) > 0.001 || Math.abs(last.y - v.y) > 0.001) {
          uniqueVerts.push(v);
        }
      }
    });

    if (uniqueVerts.length > 3) {
      const first = uniqueVerts[0];
      const last = uniqueVerts[uniqueVerts.length - 1];
      if (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) {
        uniqueVerts.pop();
      }
    }
    
    if (uniqueVerts.length >= 3) {
      features.push({
        name: "Contour DXF Récupéré",
        vertices: uniqueVerts,
        isGeographic: false,
        attributes: {
          ID: `DXF-RECUP`,
          Type: "Contour Global de Remplacement",
          Points: String(uniqueVerts.length),
          Source: "DXF Scanner Fallback"
        }
      });
    }
  }

  return features;
}

/**
 * Flexible client-side GeoJSON Polygon parser supporting multiple features.
 */
export function parseGeoJSON(text: string): ParsedFeature[] {
  const geojson = JSON.parse(text);
  return convertGeoJSONToParsedFeatures(geojson, "Parcelle GeoJSON");
}

/**
 * Real client-side Shapefile parser for zipped shapefiles.
 * Extracts the raw, highly precise coordinate arrays bypassing the inaccurate .prj conversions in shpjs.
 */
export async function parseShapefileZip(buffer: ArrayBuffer): Promise<ParsedFeature[]> {
  try {
    const zip = await JSZip.loadAsync(buffer);


    // Find files ending with .shp and .dbf
    const shpFileEntry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".shp"));
    const dbfFileEntry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".dbf"));
    
    if (!shpFileEntry) {
      throw new Error("No .shp file found in ZIP archive.");
    }
    
    const shpBuffer = await shpFileEntry.async("arraybuffer");
    let geojson;
    
    if (dbfFileEntry) {
      const dbfBuffer = await dbfFileEntry.async("arraybuffer");
      // @ts-ignore
      const parsedShp = shp.parseShp(shpBuffer);
      // @ts-ignore
      const parsedDbf = shp.parseDbf(dbfBuffer);
      // @ts-ignore
      geojson = shp.combine([parsedShp, parsedDbf]);
    } else {
      // @ts-ignore
      const parsedShp = shp.parseShp(shpBuffer);
      // @ts-ignore
      geojson = shp.combine([parsedShp, []]);
    }
    
    return convertGeoJSONToParsedFeatures(geojson, "Parcelle SHP");
  } catch (err) {
    console.error("Error in parseShapefileZip:", err);
    // Fallback to default shpjs if manual unzip fails
    try {
      const geojson = await shp(buffer);
      return convertGeoJSONToParsedFeatures(geojson, "Parcelle SHP");
    } catch (fallbackErr) {
      throw err;
    }
  }
}

/**
 * Real client-side Shapefile parser for individual .shp and .dbf files selected together.
 */
export async function parseShapefilePair(shpBuffer: ArrayBuffer, dbfBuffer: ArrayBuffer): Promise<ParsedFeature[]> {
  try {
    // @ts-ignore
    const parsedShp = shp.parseShp(shpBuffer);
    // @ts-ignore
    const parsedDbf = shp.parseDbf(dbfBuffer);
    // @ts-ignore
    const geojson = shp.combine([parsedShp, parsedDbf]);
    return convertGeoJSONToParsedFeatures(geojson, "Parcelle SHP");
  } catch (err) {
    console.error("Error in parseShapefilePair:", err);
    throw err;
  }
}

/**
 * Client-side XML GPX Parser.
 * Auto-extracts `<trkpt>`, `<rtept>` and `<wpt>` coordinates and groups them into polygons.
 */
export function parseGPX(text: string): ParsedFeature[] {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  const features: ParsedFeature[] = [];

  // 1. Process Tracks (<trk>) supporting namespace prefixes and casing
  let tracks = Array.from(xmlDoc.getElementsByTagNameNS("*", "trk"));
  if (tracks.length === 0) tracks = Array.from(xmlDoc.getElementsByTagName("trk"));
  if (tracks.length === 0) tracks = Array.from(xmlDoc.getElementsByTagNameNS("*", "TRK"));
  if (tracks.length === 0) tracks = Array.from(xmlDoc.getElementsByTagName("TRK"));

  for (let i = 0; i < tracks.length; i++) {
    const trk = tracks[i];
    let name = "";
    const nameNode = trk.getElementsByTagNameNS("*", "name")[0] || trk.getElementsByTagName("name")[0] ||
                     trk.getElementsByTagNameNS("*", "NAME")[0] || trk.getElementsByTagName("NAME")[0];
    if (nameNode && nameNode.textContent) {
      name = nameNode.textContent.trim();
    }
    if (!name) {
      name = `Trace GPX N°${i + 1}`;
    }

    let segments = Array.from(trk.getElementsByTagNameNS("*", "trkseg"));
    if (segments.length === 0) segments = Array.from(trk.getElementsByTagName("trkseg"));
    if (segments.length === 0) segments = Array.from(trk.getElementsByTagNameNS("*", "TRKSEG"));
    if (segments.length === 0) segments = Array.from(trk.getElementsByTagName("TRKSEG"));

    for (let sIdx = 0; sIdx < segments.length; sIdx++) {
      const seg = segments[sIdx];
      let pts = Array.from(seg.getElementsByTagNameNS("*", "trkpt"));
      if (pts.length === 0) pts = Array.from(seg.getElementsByTagName("trkpt"));
      if (pts.length === 0) pts = Array.from(seg.getElementsByTagNameNS("*", "TRKPT"));
      if (pts.length === 0) pts = Array.from(seg.getElementsByTagName("TRKPT"));

      const vertices: { x: number; y: number }[] = [];
      
      for (let pIdx = 0; pIdx < pts.length; pIdx++) {
        const pt = pts[pIdx];
        const latAttr = pt.getAttribute("lat") || pt.getAttribute("LAT");
        const lonAttr = pt.getAttribute("lon") || pt.getAttribute("LON");
        if (latAttr && lonAttr) {
          const lat = parseFloat(latAttr);
          const lon = parseFloat(lonAttr);
          if (!isNaN(lat) && !isNaN(lon)) {
            // Geographic standard (x = Longitude, y = Latitude)
            vertices.push({ x: lon, y: lat });
          }
        }
      }

      // Drop closing coordinate if it duplicates the first (standard polygon closing)
      if (vertices.length > 3) {
        const first = vertices[0];
        const last = vertices[vertices.length - 1];
        if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
          vertices.pop();
        }
      }

      if (vertices.length >= 3) {
        const isGeog = vertices.every(v => Math.abs(v.x) <= 180 && Math.abs(v.y) <= 90);
        features.push({
          name: segments.length > 1 ? `${name} (Segment ${sIdx + 1})` : name,
          vertices,
          isGeographic: isGeog,
          attributes: {
            Type: "Trace GPX",
            Points: String(vertices.length),
            Source: "GPX Import",
          }
        });
      }
    }
  }

  // 2. Process Routes (<rte>) supporting namespaces and casing
  let routes = Array.from(xmlDoc.getElementsByTagNameNS("*", "rte"));
  if (routes.length === 0) routes = Array.from(xmlDoc.getElementsByTagName("rte"));
  if (routes.length === 0) routes = Array.from(xmlDoc.getElementsByTagNameNS("*", "RTE"));
  if (routes.length === 0) routes = Array.from(xmlDoc.getElementsByTagName("RTE"));

  for (let rIdx = 0; rIdx < routes.length; rIdx++) {
    const rte = routes[rIdx];
    let name = "";
    const nameNode = rte.getElementsByTagNameNS("*", "name")[0] || rte.getElementsByTagName("name")[0] ||
                     rte.getElementsByTagNameNS("*", "NAME")[0] || rte.getElementsByTagName("NAME")[0];
    if (nameNode && nameNode.textContent) {
      name = nameNode.textContent.trim();
    }
    if (!name) {
      name = `Route GPX N°${rIdx + 1}`;
    }

    let pts = Array.from(rte.getElementsByTagNameNS("*", "rtept"));
    if (pts.length === 0) pts = Array.from(rte.getElementsByTagName("rtept"));
    if (pts.length === 0) pts = Array.from(rte.getElementsByTagNameNS("*", "RTEPT"));
    if (pts.length === 0) pts = Array.from(rte.getElementsByTagName("RTEPT"));

    const vertices: { x: number; y: number }[] = [];
    for (let pIdx = 0; pIdx < pts.length; pIdx++) {
      const pt = pts[pIdx];
      const latAttr = pt.getAttribute("lat") || pt.getAttribute("LAT");
      const lonAttr = pt.getAttribute("lon") || pt.getAttribute("LON");
      if (latAttr && lonAttr) {
        const lat = parseFloat(latAttr);
        const lon = parseFloat(lonAttr);
        if (!isNaN(lat) && !isNaN(lon)) {
          vertices.push({ x: lon, y: lat });
        }
      }
    }

    if (vertices.length > 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
        vertices.pop();
      }
    }

    if (vertices.length >= 3) {
      const isGeog = vertices.every(v => Math.abs(v.x) <= 180 && Math.abs(v.y) <= 90);
      features.push({
        name,
        vertices,
        isGeographic: isGeog,
        attributes: {
          Type: "Route GPX",
          Points: String(vertices.length),
          Source: "GPX Import",
        }
      });
    }
  }

  // 3. Process Waypoints Fallback (<wpt>) if no track or route structures exist
  if (features.length === 0) {
    let wpts = Array.from(xmlDoc.getElementsByTagNameNS("*", "wpt"));
    if (wpts.length === 0) wpts = Array.from(xmlDoc.getElementsByTagName("wpt"));
    if (wpts.length === 0) wpts = Array.from(xmlDoc.getElementsByTagNameNS("*", "WPT"));
    if (wpts.length === 0) wpts = Array.from(xmlDoc.getElementsByTagName("WPT"));

    const vertices: { x: number; y: number }[] = [];
    for (let wIdx = 0; wIdx < wpts.length; wIdx++) {
      const wpt = wpts[wIdx];
      const latAttr = wpt.getAttribute("lat") || wpt.getAttribute("LAT");
      const lonAttr = wpt.getAttribute("lon") || wpt.getAttribute("LON");
      if (latAttr && lonAttr) {
        const lat = parseFloat(latAttr);
        const lon = parseFloat(lonAttr);
        if (!isNaN(lat) && !isNaN(lon)) {
          vertices.push({ x: lon, y: lat });
        }
      }
    }

    if (vertices.length > 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.abs(first.x - last.x) < 0.0001 && Math.abs(first.y - last.y) < 0.0001) {
        vertices.pop();
      }
    }

    if (vertices.length >= 3) {
      const isGeog = vertices.every(v => Math.abs(v.x) <= 180 && Math.abs(v.y) <= 90);
      features.push({
        name: "Points GPX Globaux",
        vertices,
        isGeographic: isGeog,
        attributes: {
          Type: "Waypoints GPX",
          Points: String(vertices.length),
          Source: "GPX Import - Waypoints",
        }
      });
    }
  }

  // 4. Regex General Fallback (Catches custom or complex non-standard GPX namespaces)
  if (features.length === 0) {
    const pts: { x: number; y: number }[] = [];
    const ptRegex = /<(?:[a-zA-Z0-9_]+:)?(?:trkpt|rtept|wpt|pt)\s+[^>]*(?:lat|LAT)=["'](-?\d+\.?\d*)["']\s+[^>]*(?:lon|LON)=["'](-?\d+\.?\d*)["']/gi;
    let match;
    while ((match = ptRegex.exec(text)) !== null) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);
      if (!isNaN(lat) && !isNaN(lon)) {
        pts.push({ x: lon, y: lat });
      }
    }
    
    // Try the other way around: lon then lat
    if (pts.length === 0) {
      const ptRegex2 = /<(?:[a-zA-Z0-9_]+:)?(?:trkpt|rtept|wpt|pt)\s+[^>]*(?:lon|LON)=["'](-?\d+\.?\d*)["']\s+[^>]*(?:lat|LAT)=["'](-?\d+\.?\d*)["']/gi;
      while ((match = ptRegex2.exec(text)) !== null) {
        const lon = parseFloat(match[1]);
        const lat = parseFloat(match[2]);
        if (!isNaN(lat) && !isNaN(lon)) {
          pts.push({ x: lon, y: lat });
        }
      }
    }

    if (pts.length > 3) {
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
        pts.pop();
      }
    }

    if (pts.length >= 3) {
      const isGeog = pts.every(v => Math.abs(v.x) <= 180 && Math.abs(v.y) <= 90);
      features.push({
        name: "Trace GPX Extrait",
        vertices: pts,
        isGeographic: isGeog,
        attributes: {
          Type: "GPX Regex Extrait",
          Points: String(pts.length),
          Source: "GPX Regex Fallback",
        }
      });
    }
  }

  return features;
}

/**
 * Highly intelligent parser for tabular row coordinates.
 * Supports auto-detecting column coordinates (X/Y, N/E, Lat/Lon) and auto-grouping by parcel keys.
 */
export function parseTabularData(rows: any[][], fileName: string): ParsedFeature[] {
  if (rows.length === 0) return [];

  // Filter empty rows
  const cleanRows = rows.filter(
    (row) => row && row.some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== "")
  );
  if (cleanRows.length === 0) return [];

  let headerIndex = -1;
  let xCol = -1;
  let yCol = -1;
  let nameCol = -1;
  let groupCol = -1;

  const xKeywords = [/^(x|east|easting|est|e|coord_x)$/i, /longitude|lon|lng|long/i];
  const yKeywords = [/^(y|north|northing|nord|n|coord_y)$/i, /latitude|lat/i];
  const nameKeywords = [/name|nom|label|id|point|no|pn|index|code|n°/i];
  const groupKeywords = [/parcelle|parcel|group|poly|titre|m_parcelle|mparcelle/i];

  // Search headers within first 5 rows
  for (let r = 0; r < Math.min(cleanRows.length, 5); r++) {
    const row = cleanRows[r];
    let foundX = -1;
    let foundY = -1;
    let foundName = -1;
    let foundGroup = -1;

    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || "").trim().toLowerCase();
      if (!val) continue;

      if (foundX === -1 && xKeywords.some((pattern) => pattern.test(val))) {
        foundX = c;
      } else if (foundY === -1 && yKeywords.some((pattern) => pattern.test(val))) {
        foundY = c;
      } else if (foundName === -1 && nameKeywords.some((pattern) => pattern.test(val))) {
        foundName = c;
      } else if (foundGroup === -1 && groupKeywords.some((pattern) => pattern.test(val))) {
        foundGroup = c;
      }
    }

    if (foundX !== -1 && foundY !== -1) {
      headerIndex = r;
      xCol = foundX;
      yCol = foundY;
      nameCol = foundName;
      groupCol = foundGroup;
      break;
    }
  }

  // Fallback heuristics if no header row found
  if (xCol === -1 || yCol === -1) {
    const sampleRow = cleanRows[headerIndex === -1 ? 0 : headerIndex + 1] || cleanRows[0];
    const numericCols: number[] = [];
    sampleRow.forEach((cell, cIdx) => {
      const sanitized = String(cell || "").trim().replace(",", ".");
      const num = parseFloat(sanitized);
      if (!isNaN(num) && sanitized.length > 0) {
        numericCols.push(cIdx);
      }
    });

    if (numericCols.length >= 2) {
      xCol = numericCols[0];
      yCol = numericCols[1];
      if (xCol > 0) {
        nameCol = 0;
      }
    } else {
      xCol = 0;
      yCol = 1;
    }
    if (headerIndex === -1) {
      headerIndex = -1; // No header row, data starts at index 0
    }
  }

  const dataRowsStart = headerIndex + 1;
  
  interface PointWithAttrs {
    x: number;
    y: number;
    group: string;
    name: string;
    attrs: Record<string, string>;
  }

  const rawPoints: PointWithAttrs[] = [];

  for (let r = dataRowsStart; r < cleanRows.length; r++) {
    const row = cleanRows[r];
    if (!row || row.length <= Math.max(xCol, yCol)) continue;

    const xValStr = String(row[xCol] || "").trim().replace(",", ".");
    const yValStr = String(row[yCol] || "").trim().replace(",", ".");

    const x = parseFloat(xValStr);
    const y = parseFloat(yValStr);

    if (isNaN(x) || isNaN(y)) {
      continue; 
    }

    let groupVal = "";
    if (groupCol !== -1 && groupCol < row.length && row[groupCol] !== undefined) {
      groupVal = String(row[groupCol]).trim();
    }
    if (!groupVal) {
      groupVal = `Parcelle Tabulaire - ${fileName.replace(/\.[^/.]+$/, "")}`;
    }

    let pointName = "";
    if (nameCol !== -1 && nameCol < row.length && row[nameCol] !== undefined) {
      pointName = String(row[nameCol]).trim();
    }
    if (!pointName) {
      pointName = `Point ${r - dataRowsStart + 1}`;
    }

    const attrs: Record<string, string> = {};
    row.forEach((cell, cIdx) => {
      const colHeader = (headerIndex !== -1 && headerIndex < cleanRows.length && cleanRows[headerIndex][cIdx] !== undefined)
        ? String(cleanRows[headerIndex][cIdx]).trim()
        : `Col_${cIdx + 1}`;
      if (colHeader === "__proto__" || colHeader === "constructor" || colHeader === "prototype") return;
      attrs[colHeader] = cell !== null && cell !== undefined ? String(cell).trim() : "";
    });

    rawPoints.push({
      x,
      y,
      group: groupVal,
      name: pointName,
      attrs,
    });
  }

  if (rawPoints.length === 0) return [];

  // Group into separate polygon features
  const groups: Record<string, typeof rawPoints> = {};
  rawPoints.forEach((pt) => {
    if (!groups[pt.group]) {
      groups[pt.group] = [];
    }
    groups[pt.group].push(pt);
  });

  const features: ParsedFeature[] = [];

  Object.entries(groups).forEach(([groupName, pts]) => {
    const vertices = pts.map((pt) => ({ x: pt.x, y: pt.y }));

    let looksGeographic = true;
    for (const v of vertices) {
      if (Math.abs(v.x) > 180 || Math.abs(v.y) > 90) {
        looksGeographic = false;
        break;
      }
    }

    // Clean closing point duplicates if exist
    if (vertices.length > 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.abs(first.x - last.x) < 0.005 && Math.abs(first.y - last.y) < 0.005) {
        vertices.pop();
      }
    }

    if (vertices.length >= 3) {
      features.push({
        name: groupName,
        vertices,
        isGeographic: looksGeographic,
        attributes: {
          Format: "Import Tabulaire (Tableau de points)",
          "Métrique": looksGeographic ? "Degrés Géographiques (WGS84)" : "Projection Lambert Locale",
          "Points": String(vertices.length),
          "Calque": "Import",
        }
      });
    }
  });

  return features;
}

/**
 * Client-side CSV text parser.
 * Specifically optimized for the topographer's P1;X1;Y1 format.
 */
export function parseCSV(text: string, fileName: string): ParsedFeature[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  
  // Custom check: is it structured as P1;X1;Y1 where second and third can be floats?
  let isSemicolonPXY = false;
  let matchesCount = 0;
  
  for (const line of lines) {
    const parts = line.split(";");
    if (parts.length >= 3) {
      const xStr = parts[1].trim().replace(",", ".");
      const yStr = parts[2].trim().replace(",", ".");
      const xVal = parseFloat(xStr);
      const yVal = parseFloat(yStr);
      if (!isNaN(xVal) && !isNaN(yVal)) {
        matchesCount++;
      }
    }
  }
  
  if (matchesCount >= 3 || (lines.length > 0 && matchesCount === lines.length)) {
    isSemicolonPXY = true;
  }
  
  if (isSemicolonPXY) {
    const vertices: { x: number; y: number }[] = [];
    
    lines.forEach((line) => {
      const parts = line.split(";");
      if (parts.length >= 3) {
        const xVal = parseFloat(parts[1].trim().replace(",", "."));
        const yVal = parseFloat(parts[2].trim().replace(",", "."));
        if (!isNaN(xVal) && !isNaN(yVal)) {
          vertices.push({ x: xVal, y: yVal });
        }
      }
    });
    
    if (vertices.length >= 3) {
      const first = vertices[0];
      const last = vertices[vertices.length - 1];
      if (Math.abs(first.x - last.x) < 0.005 && Math.abs(first.y - last.y) < 0.005) {
        vertices.pop();
      }
      
      let looksGeographic = true;
      for (const v of vertices) {
        if (Math.abs(v.x) > 180 || Math.abs(v.y) > 90) {
          looksGeographic = false;
          break;
        }
      }
      
      return [{
        name: `Import CSV (${fileName.replace(/\.[^/.]+$/, "")})`,
        vertices,
        isGeographic: looksGeographic,
        attributes: {
          Format: "Arpentage CSV (P;X;Y)",
          Points: String(vertices.length),
          Source: "CSV Delimited Import"
        }
      }];
    }
  }
  
  // Standard CSV parser fallback if not strictly P1;X1;Y1
  const rows: any[][] = [];
  lines.forEach((line) => {
    let delimiter = ",";
    if (line.includes(";")) {
      delimiter = ";";
    } else if (line.includes("\t")) {
      delimiter = "\t";
    }
    
    const row: string[] = [];
    let insideQuotes = false;
    let cell = "";
    
    for (let cIdx = 0; cIdx < line.length; cIdx++) {
      const char = line[cIdx];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        row.push(cell.trim());
        cell = "";
      } else {
        cell += char;
      }
    }
    row.push(cell.trim());
    rows.push(row);
  });
  
  return parseTabularData(rows, fileName);
}

/**
 * Client-side binary Excel reader using SheetJS.
 * Specifically optimised to detect cells formatted as P1|X1|Y1 inside.
 */
export function parseExcel(buffer: ArrayBuffer, fileName: string): ParsedFeature[] {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: "array" });
  if (workbook.SheetNames.length === 0) return [];

  // Read all rows from the active sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

  const vertices: { x: number; y: number }[] = [];

  rows.forEach((row) => {
    if (!row || row.length === 0) return;
    const cellVal = String(row[0] || "").trim();
    if (cellVal.includes("|")) {
      const parts = cellVal.split("|").map(p => p.trim());
      if (parts.length >= 3) {
        const xStr = parts[1].replace(",", ".");
        const yStr = parts[2].replace(",", ".");
        const xVal = parseFloat(xStr);
        const yVal = parseFloat(yStr);
        if (!isNaN(xVal) && !isNaN(yVal)) {
          vertices.push({ x: xVal, y: yVal });
        }
      }
    } else if (row.length >= 3) {
      const xVal = parseFloat(String(row[1] || "").trim().replace(",", "."));
      const yVal = parseFloat(String(row[2] || "").trim().replace(",", "."));
      if (!isNaN(xVal) && !isNaN(yVal)) {
        vertices.push({ x: xVal, y: yVal });
      }
    }
  });

  if (vertices.length >= 3) {
    const first = vertices[0];
    const last = vertices[vertices.length - 1];
    if (Math.abs(first.x - last.x) < 0.005 && Math.abs(first.y - last.y) < 0.005) {
      vertices.pop();
    }
    
    let looksGeographic = true;
    for (const v of vertices) {
      if (Math.abs(v.x) > 180 || Math.abs(v.y) > 90) {
        looksGeographic = false;
        break;
      }
    }

    return [{
      name: `Import Excel (${fileName.replace(/\.[^/.]+$/, "")})`,
      vertices,
      isGeographic: looksGeographic,
      attributes: {
        Format: "Excel Pipe Format (P|X|Y)",
        Points: String(vertices.length),
        Source: "Excel Sheet Import"
      }
    }];
  }

  // Fallback to standard tabular
  const processedRows: any[][] = [];
  rows.forEach((row) => {
    if (!row) return;
    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || "").trim();
      if (cellVal.includes("|")) {
        const parts = cellVal.split("|").map(p => p.trim());
        if (parts.length >= 3) {
          const xVal = parseFloat(parts[1].replace(",", "."));
          const yVal = parseFloat(parts[2].replace(",", "."));
          if (!isNaN(xVal) && !isNaN(yVal)) {
            processedRows.push(parts);
            return;
          }
        }
      }
    }
    processedRows.push(row);
  });

  return parseTabularData(processedRows, fileName);
}

interface TableSchema {
  tableName: string;
  columns: string[];
}

function readVarint(view: DataView, offset: number): { value: number; size: number } {
  let value = 0;
  let size = 0;
  while (size < 9) {
    const b = view.getUint8(offset + size);
    size++;
    if (size === 9) {
      value = value * 256 + b;
      break;
    }
    value = value * 128 + (b & 0x7f);
    if ((b & 0x80) === 0) {
      break;
    }
  }
  return { value, size };
}

function parseWkbGeometry(view: DataView, offset: number): { x: number; y: number }[] | null {
  if (offset + 5 > view.byteLength) return null;
  const littleEndian = view.getUint8(offset) === 1;
  const geomType = view.getUint32(offset + 1, littleEndian);
  
  let ptr = offset + 5;
  
  if (geomType === 3) { // Polygon
    if (ptr + 4 > view.byteLength) return null;
    const numRings = view.getUint32(ptr, littleEndian);
    ptr += 4;
    if (numRings === 0) return null;
    
    // We only need the outer/first ring coordinates
    if (ptr + 4 > view.byteLength) return null;
    const numPoints = view.getUint32(ptr, littleEndian);
    ptr += 4;
    
    if (ptr + numPoints * 16 > view.byteLength) return null;
    const vertices: { x: number; y: number }[] = [];
    for (let p = 0; p < numPoints; p++) {
      const x = view.getFloat64(ptr, littleEndian);
      const y = view.getFloat64(ptr + 8, littleEndian);
      vertices.push({ x, y });
      ptr += 16;
    }
    return vertices;
  }
  
  if (geomType === 6) { // MultiPolygon
    if (ptr + 4 > view.byteLength) return null;
    const numPolygons = view.getUint32(ptr, littleEndian);
    ptr += 4;
    if (numPolygons === 0) return null;
    
    // Parse first polygon structure
    return parseWkbGeometry(view, ptr);
  }
  
  if (geomType === 2) { // LineString
    if (ptr + 4 > view.byteLength) return null;
    const numPoints = view.getUint32(ptr, littleEndian);
    ptr += 4;
    if (ptr + numPoints * 16 > view.byteLength) return null;
    
    const vertices: { x: number; y: number }[] = [];
    for (let p = 0; p < numPoints; p++) {
      const x = view.getFloat64(ptr, littleEndian);
      const y = view.getFloat64(ptr + 8, littleEndian);
      vertices.push({ x, y });
      ptr += 16;
    }
    return vertices;
  }
  
  return null;
}

function parseGpkgGeometry(blob: Uint8Array): { x: number; y: number }[] | null {
  if (blob.length < 8) return null;
  if (blob[0] !== 0x47 || blob[1] !== 0x50) return null; // "GP" magic
  
  const flags = blob[3];
  const envelopeType = flags & 0x07;
  let envelopeSize = 0;
  if (envelopeType === 1) envelopeSize = 32;
  else if (envelopeType === 2) envelopeSize = 48;
  else if (envelopeType === 3) envelopeSize = 48;
  else if (envelopeType === 4) envelopeSize = 64;
  
  const wkbOffset = 8 + envelopeSize;
  if (wkbOffset >= blob.length) return null;
  
  const view = new DataView(blob.buffer, blob.byteOffset + wkbOffset, blob.length - wkbOffset);
  return parseWkbGeometry(view, 0);
}

/**
 * Client-side GeoPackage (.gpkg) file reader.
 * Direct SQLite B-tree leaf page scanner that decodes standard relational SQL tables
 * to extract GIS polygons with all their textual attribute tables intact!
 */
export function parseGeoPackage(buffer: ArrayBuffer): ParsedFeature[] {
  const view = new DataView(buffer);
  const len = buffer.byteLength;
  const features: ParsedFeature[] = [];
  
  // 1. Detect SQLite page size (offset 16 of the SQLite header)
  if (len < 100) return [];
  const pageSize = view.getUint16(16, false);
  if (pageSize < 512 || pageSize > 65536 || (pageSize & (pageSize - 1)) !== 0) {
    return []; // invalid SQLite page size
  }
  
  // 2. Decode the first page or the SQL text to extract user data CREATE TABLE schemas
  const schemas: TableSchema[] = [];
  try {
    const ascii = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(buffer));
    const createTableRegex = /CREATE\s+TABLE\s+["']?([\w\d_.-]+)["']?\s*\(/gi;
    let match;
    while ((match = createTableRegex.exec(ascii)) !== null) {
      const tableName = match[1];
      if (tableName.startsWith("gpkg_") || tableName.startsWith("sqlite_")) {
        continue; // skip metadata/index schemas
      }
      
      // Find the matching end parenthesis of the table definition
      let depth = 1;
      let index = createTableRegex.lastIndex;
      let columnPart = "";
      while (index < ascii.length && depth > 0) {
        const char = ascii[index];
        if (char === "(") depth++;
        else if (char === ")") depth--;
        if (depth > 0) {
          columnPart += char;
        }
        index++;
      }
      
      // Split columns by comma accounting for nested parentheses in types (e.g. VARCHAR(255))
      const columns: string[] = [];
      let currentField = "";
      let parenDepth = 0;
      for (let cIdx = 0; cIdx < columnPart.length; cIdx++) {
        const char = columnPart[cIdx];
        if (char === "(") parenDepth++;
        if (char === ")") parenDepth--;
        if (char === "," && parenDepth === 0) {
          const parts = currentField.trim().split(/\s+/);
          if (parts.length > 0) {
            const col = parts[0].replace(/["']/g, "").trim();
            if (col) {
              const upperCol = col.toUpperCase();
              if (!["CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN"].includes(upperCol)) {
                columns.push(col);
              }
            }
          }
          currentField = "";
        } else {
          currentField += char;
        }
      }
      if (currentField.trim()) {
        const parts = currentField.trim().split(/\s+/);
        if (parts.length > 0) {
          const col = parts[0].replace(/["']/g, "").trim();
          if (col) {
            const upperCol = col.toUpperCase();
            if (!["CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN"].includes(upperCol)) {
              columns.push(col);
            }
          }
        }
      }
      
      schemas.push({ tableName, columns });
    }
  } catch (err) {
    console.error("Error reading schemas:", err);
  }
  
  const userSchemas = schemas.filter(s => !s.tableName.startsWith("gpkg_") && !s.tableName.startsWith("sqlite_"));
  
  // 3. Scan database pages for Table B-Tree Leaf Pages (Page Type 0x0D = 13)
  for (let pageIdx = 0; pageIdx * pageSize < len; pageIdx++) {
    const pageOffset = pageIdx * pageSize;
    const headerOffset = pageIdx === 0 ? 100 : 0;
    const absHeaderOffset = pageOffset + headerOffset;
    
    if (absHeaderOffset >= len) break;
    
    const pageType = view.getUint8(absHeaderOffset);
    if (pageType === 0x0D) { // Table B-Tree Leaf Page
      const cellCount = view.getUint16(absHeaderOffset + 3, false);
      
      for (let c = 0; c < cellCount; c++) {
        const cellPointerOffset = absHeaderOffset + 8 + c * 2;
        if (cellPointerOffset + 2 > len) continue;
        
        const cellPageOffset = view.getUint16(cellPointerOffset, false);
        const absCellOffset = pageOffset + cellPageOffset;
        if (absCellOffset >= len) continue;
        
        try {
          let ptr = absCellOffset;
          const payloadSizeVarint = readVarint(view, ptr);
          ptr += payloadSizeVarint.size;
          
          const rowIdVarint = readVarint(view, ptr);
          ptr += rowIdVarint.size;
          
          const payloadOffset = ptr;
          const headerSizeVarint = readVarint(view, payloadOffset);
          const headerSize = headerSizeVarint.value;
          
          const serialTypes: number[] = [];
          let headerPtr = payloadOffset + headerSizeVarint.size;
          const headerEnd = payloadOffset + headerSize;
          
          while (headerPtr < headerEnd && headerPtr < len) {
            const typeVarint = readVarint(view, headerPtr);
            serialTypes.push(typeVarint.value);
            headerPtr += typeVarint.size;
          }
          
          let dataPtr = payloadOffset + headerSize;
          const cellValues: any[] = [];
          
          for (const t of serialTypes) {
            if (t === 0) {
              cellValues.push(null);
            } else if (t === 1) {
              if (dataPtr < len) {
                cellValues.push(view.getInt8(dataPtr));
                dataPtr += 1;
              } else { cellValues.push(null); }
            } else if (t === 2) {
              if (dataPtr + 2 <= len) {
                cellValues.push(view.getInt16(dataPtr, false));
                dataPtr += 2;
              } else { cellValues.push(null); }
            } else if (t === 3) {
              if (dataPtr + 3 <= len) {
                const b0 = view.getUint8(dataPtr);
                const b1 = view.getUint8(dataPtr + 1);
                const b2 = view.getUint8(dataPtr + 2);
                let val = (b0 << 16) | (b1 << 8) | b2;
                if (val & 0x800000) val |= 0xff000000;
                cellValues.push(val);
                dataPtr += 3;
              } else { cellValues.push(null); }
            } else if (t === 4) {
              if (dataPtr + 4 <= len) {
                cellValues.push(view.getInt32(dataPtr, false));
                dataPtr += 4;
              } else { cellValues.push(null); }
            } else if (t === 5) {
              if (dataPtr + 6 <= len) {
                const high = view.getInt16(dataPtr, false);
                const low = view.getUint32(dataPtr + 2, false);
                cellValues.push(high * 4294967296 + low);
                dataPtr += 6;
              } else { cellValues.push(null); }
            } else if (t === 6) {
              if (dataPtr + 8 <= len) {
                const val = Number(view.getBigInt64(dataPtr, false));
                cellValues.push(val);
                dataPtr += 8;
              } else { cellValues.push(null); }
            } else if (t === 7) {
              if (dataPtr + 8 <= len) {
                cellValues.push(view.getFloat64(dataPtr, false));
                dataPtr += 8;
              } else { cellValues.push(null); }
            } else if (t === 8) {
              cellValues.push(0);
            } else if (t === 9) {
              cellValues.push(1);
            } else if (t >= 12 && t % 2 === 0) {
              const blobSize = (t - 12) / 2;
              if (dataPtr + blobSize <= len) {
                cellValues.push(new Uint8Array(buffer, dataPtr, blobSize));
                dataPtr += blobSize;
              } else { cellValues.push(null); }
            } else if (t >= 13 && t % 2 === 1) {
              const strSize = (t - 13) / 2;
              if (dataPtr + strSize <= len) {
                const bytes = new Uint8Array(buffer, dataPtr, strSize);
                const strVal = new TextDecoder("utf-8").decode(bytes);
                cellValues.push(strVal);
                dataPtr += strSize;
              } else { cellValues.push(null); }
            } else {
              cellValues.push(null);
            }
          }
          
          let ringCoords: { x: number; y: number }[] | null = null;
          let geometryColIndex = -1;
          
          for (let cellIdx = 0; cellIdx < cellValues.length; cellIdx++) {
            const val = cellValues[cellIdx];
            if (val instanceof Uint8Array && val.length > 8 && val[0] === 0x47 && val[1] === 0x50) {
              const parsedGeom = parseGpkgGeometry(val);
              if (parsedGeom && parsedGeom.length >= 3) {
                ringCoords = parsedGeom;
                geometryColIndex = cellIdx;
                break;
              }
            }
          }
          
          if (ringCoords) {
            let matchedSchema: TableSchema | undefined;
            const matchingSchemas = userSchemas.filter(s => s.columns.length === cellValues.length);
            if (matchingSchemas.length === 1) {
              matchedSchema = matchingSchemas[0];
            } else if (userSchemas.length === 1) {
              matchedSchema = userSchemas[0];
            } else {
              matchedSchema = userSchemas.find(s => {
                const geomColName = s.columns[geometryColIndex]?.toLowerCase();
                return geomColName && ["geom", "geometry", "shape", "the_geom"].includes(geomColName);
              });
              // Fallback to the first user schema if still undefined
              if (!matchedSchema && userSchemas.length > 0) {
                matchedSchema = userSchemas[0];
              }
            }
            
            const attributes: Record<string, string> = {
              Source: "GeoPackage Import",
            };
            let proposedName = "";
            
            for (let colIdx = 0; colIdx < cellValues.length; colIdx++) {
              if (colIdx === geometryColIndex) continue;
              
              const colName = (matchedSchema && matchedSchema.columns[colIdx]) ? matchedSchema.columns[colIdx] : `Col_${colIdx + 1}`;
              const rawVal = cellValues[colIdx];
              
              if (rawVal !== null && rawVal !== undefined) {
                const valStr = String(rawVal).trim();
                attributes[colName] = valStr;
                
                const lowerCol = colName.toLowerCase();
                if (!proposedName && ["nom", "name", "id", "fid", "numero", "num", "parcelle", "ref", "section", "libelle"].some(k => lowerCol.includes(k))) {
                  proposedName = valStr;
                }
              }
            }
            
            const finalName = proposedName || `Parcelle GPKG ${features.length + 1}`;
            attributes["Nom"] = finalName;
            
            const firstP = ringCoords[0];
            const lastP = ringCoords[ringCoords.length - 1];
            if (Math.abs(firstP.x - lastP.x) < 0.01 && Math.abs(firstP.y - lastP.y) < 0.01) {
              ringCoords.pop();
            }
            
            // Geographic standard coordinates check (degrees of longitude / latitude)
            const isGeog = ringCoords.every(v => Math.abs(v.x) <= 180 && Math.abs(v.y) <= 90);
            
            // Prevent exact duplicates of the same parcel from multiple index pages
            const isDup = features.some(f => 
              f.vertices.length === ringCoords!.length && 
              Math.abs(f.vertices[0].x - ringCoords![0].x) < 0.001 &&
              Math.abs(f.vertices[0].y - ringCoords![0].y) < 0.001
            );
            
            if (!isDup && ringCoords.length >= 3) {
              features.push({
                name: finalName,
                vertices: ringCoords,
                isGeographic: isGeog,
                attributes
              });
            }
          }
        } catch (e) {
          console.error("Error decoding page cell:", e);
        }
      }
    }
  }
  
  // High-speed binary coordinate-scanning fallback in case no database B-Tree cells were reachable or read
  if (features.length === 0) {
    let i = 0;
    const maxSearch = len - 48;
    while (i < maxSearch) {
      let pts: { x: number; y: number }[] = [];
      let cur = i;
      while (cur < len - 16) {
        const x = view.getFloat64(cur, true);
        const y = view.getFloat64(cur + 8, true);
        const isProj = x >= 50000 && x <= 950000 && y >= 50000 && y <= 950000;
        const isGeog = x >= -18.0 && x <= 0.0 && y >= 20.0 && y <= 36.5;
        if (isProj || isGeog) {
          pts.push({ x, y });
          cur += 16;
        } else {
          break;
        }
      }
      if (pts.length >= 3) {
        const uniqueX = new Set(pts.map(p => p.x.toFixed(3)));
        const uniqueY = new Set(pts.map(p => p.y.toFixed(3)));
        if (uniqueX.size > 2 && uniqueY.size > 2) {
          const first = pts[0];
          const last = pts[pts.length - 1];
          if (Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01) {
            pts.pop();
          }
          if (pts.length >= 3) {
            const isGeographic = pts[0].x >= -18.0 && pts[0].x <= 0.0;
            features.push({
              name: `GeoPackage Parcelle #${features.length + 1}`,
              vertices: pts,
              isGeographic,
              attributes: {
                ID: `GPKG-${features.length + 1}`,
                Source: "GeoPackage Direct Binary Import",
                Points: String(pts.length)
              }
            });
          }
        }
        i = cur + 8;
      } else {
        i += 8;
      }
    }
  }
  
  return features;
}


