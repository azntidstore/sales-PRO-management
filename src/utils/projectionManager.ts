import proj4 from "proj4";

// Define the Moroccan Merchich Conic projections
// EPSG:26191 - Merchich / Nord Maroc (Zone 1) - Greenwich-based for standard local topography software
proj4.defs(
  "EPSG:26191",
  "+proj=lcc +lat_1=33.3 +lat_0=33.3 +lon_0=-5.4 +k_0=0.999625769 +x_0=500000 +y_0=300000 +ellps=clrk80ign +towgs84=31,146,47,0,0,0,0 +units=m +no_defs"
);

// EPSG:26192 - Merchich / Sud Maroc (Zone 2) - Greenwich-based for standard local topography software
proj4.defs(
  "EPSG:26192",
  "+proj=lcc +lat_1=29.7 +lat_0=29.7 +lon_0=-5.4 +k_0=0.999615596 +x_0=500000 +y_0=300000 +ellps=clrk80ign +towgs84=31,146,47,0,0,0,0 +units=m +no_defs"
);

// EPSG:26193 - Merchich / Zone 3 - Greenwich-based for standard local topography software
proj4.defs(
  "EPSG:26193",
  "+proj=lcc +lat_1=26.1 +lat_0=26.1 +lon_0=-5.4 +k_0=0.9996 +x_0=1200000 +y_0=400000 +ellps=clrk80ign +units=m +no_defs"
);

// EPSG:26194 - Merchich / Zone 4 - Greenwich-based for standard local topography software
proj4.defs(
  "EPSG:26194",
  "+proj=lcc +lat_1=26.1 +lat_0=26.1 +lon_0=-5.4 +k_0=0.999616304 +x_0=1200000 +y_0=400000 +ellps=clrk80ign +units=m +no_defs"
);

// Register standard WGS84 for explicit conversions
proj4.defs("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");

export type SupportedCRS = "EPSG:26191" | "EPSG:26192" | "EPSG:26193" | "EPSG:26194" | "EPSG:4326";

export const CRS_DETAILS = {
  "EPSG:26191": {
    name: "Merchich / Nord Maroc (Zone 1)",
    arabic: "مرشيش / شمال المغرب (المنطقة 1)",
    epsg: "EPSG:26191",
  },
  "EPSG:26192": {
    name: "Merchich / Sud Maroc (Zone 2)",
    arabic: "مرشيش / جنوب المغرب (المنطقة 2)",
    epsg: "EPSG:26192",
  },
  "EPSG:26193": {
    name: "Merchich / Zone 3 Maroc (Zone 3)",
    arabic: "مرشيش / المنطقة 3 المغربية",
    epsg: "EPSG:26193",
  },
  "EPSG:26194": {
    name: "Merchich / Zone 4 Maroc (Zone 4)",
    arabic: "مرشيش / المنطقة 4 المغربية",
    epsg: "EPSG:26194",
  },
  "EPSG:4326": {
    name: "WGS 84 (GPS Geographic Degrees)",
    arabic: "نظام GPS العالمي (درجات جغرافيّة)",
    epsg: "EPSG:4326",
  },
};

/**
 * High precision transform from a source CRS to a target CRS.
 */
export function transformCRS(
  coords: { x: number; y: number },
  sourceCRS: SupportedCRS,
  targetCRS: SupportedCRS
): { x: number; y: number } {
  if (sourceCRS === targetCRS) return coords;
  if (!coords || isNaN(coords.x) || isNaN(coords.y) || !isFinite(coords.x) || !isFinite(coords.y)) {
    return { x: 0, y: 0 };
  }

  const input: [number, number] = [coords.x, coords.y];

  try {
    // proj4 works with [longitude, latitude] for geographic coordinates or [x, y] for projected
    const output = proj4(sourceCRS, targetCRS, input);
    if (!output || isNaN(output[0]) || isNaN(output[1]) || !isFinite(output[0]) || !isFinite(output[1])) {
      return coords;
    }
    return { x: output[0], y: output[1] };
  } catch (err) {
    console.error(`Failed to transform coordinates from ${sourceCRS} to ${targetCRS}:`, err);
    return coords;
  }
}

/**
 * Helper to convert Lambert meters in active Moroccan CRS to WGS84 Lat/Lng.
 */
export function activeLambertToLatLng(x: number, y: number, activeCRS: SupportedCRS): [number, number] {
  if (isNaN(x) || isNaN(y) || !isFinite(x) || !isFinite(y)) {
    return [33.5731, -7.5898]; // Fallback to Casablanca so Leaflet doesn't crash
  }
  if (activeCRS === "EPSG:4326") {
    const lat = isNaN(y) || !isFinite(y) ? 33.5731 : Math.max(-90, Math.min(90, y));
    const lng = isNaN(x) || !isFinite(x) ? -7.5898 : Math.max(-180, Math.min(180, x));
    return [lat, lng];
  }
  const geo = transformCRS({ x, y }, activeCRS, "EPSG:4326");
  const lat = isNaN(geo.y) || !isFinite(geo.y) ? 33.5731 : Math.max(-90, Math.min(90, geo.y));
  const lng = isNaN(geo.x) || !isFinite(geo.x) ? -7.5898 : Math.max(-180, Math.min(180, geo.x));
  return [lat, lng]; // returns [lat, lng]
}

/**
 * Helper to convert WGS84 Lat/Lon coordinates into active Moroccan CRS.
 */
export function latLngToActiveLambert(lat: number, lng: number, activeCRS: SupportedCRS): { x: number; y: number } {
  const safeLat = isNaN(lat) || !isFinite(lat) ? 33.5731 : Math.max(-90, Math.min(90, lat));
  const safeLng = isNaN(lng) || !isFinite(lng) ? -7.5898 : Math.max(-180, Math.min(180, lng));
  if (activeCRS === "EPSG:4326") {
    return { x: safeLng, y: safeLat };
  }
  const p = transformCRS({ x: safeLng, y: safeLat }, "EPSG:4326", activeCRS);
  const x = isNaN(p.x) || !isFinite(p.x) ? 360000 : p.x;
  const y = isNaN(p.y) || !isFinite(p.y) ? 410000 : p.y;
  return { x, y };
}

/**
 * Parsed .prj WKT keyword heuristic to map to one of our supported systems.
 */
export function detectCRSFromPrj(prjText: string): SupportedCRS | null {
  if (!prjText) return null;
  const text = prjText.toUpperCase();
  
  if (text.includes("4326") || text.includes("WGS_1984") || text.includes("WGS 84") || text.includes("GEOGCS")) {
    if (!text.includes("PROJCS")) {
      return "EPSG:4326";
    }
  }
  
  if (text.includes("26191") || text.includes("ZONE_1") || text.includes("ZONE_I") || text.includes("NORD_MAROC") || text.includes("NORD MAROC")) {
    return "EPSG:26191";
  }
  if (text.includes("26192") || text.includes("ZONE_2") || text.includes("ZONE_II") || text.includes("SUD_MAROC") || text.includes("SUD MAROC")) {
    return "EPSG:26192";
  }
  if (text.includes("26193") || text.includes("ZONE_3") || text.includes("ZONE_III") || text.includes("ZONE 3") || text.includes("SAHARA")) {
    return "EPSG:26193";
  }
  if (text.includes("26194") || text.includes("ZONE_4") || text.includes("ZONE_IV") || text.includes("ZONE 4") || text.includes("SAHARA NORD") || text.includes("SAHARA_NORD") || text.includes("SAHARA N")) {
    return "EPSG:26194";
  }

  const originMatch = text.match(/LATITUDE_OF_USEFUL_ORIGIN\s*,\s*([\d.]+)/i) || 
                      text.match(/LATITUDE_OF_ORIGIN\s*,\s*([\d.]+)/i) ||
                      text.match(/LATITUDE_OF_CENTER\s*,\s*([\d.]+)/i) || 
                      text.match(/STANDARD_PARALLEL_1\s*,\s*([\d.]+)/i);
                      
  if (originMatch) {
    const lat = parseFloat(originMatch[1]);
    if (Math.abs(lat - 33.3) < 0.2) return "EPSG:26191";
    if (Math.abs(lat - 29.7) < 0.2) return "EPSG:26192";
    if (Math.abs(lat - 26.1) < 0.2) return "EPSG:26193";
    if (Math.abs(lat - 22.5) < 0.2) return "EPSG:26194";
  }

  return null;
}

/**
 * Centroid-based heuristic zone finder when coordinates are in meters
 * (transforms centroid to each zone and finds the one that places it closest to its origin latitude)
 */
export function detectMoroccanLambertZone(x: number, y: number): SupportedCRS {
  // If X is in the Sahara false easting range (around 1,200,000)
  if (x > 850000) {
    // Both Zone 3 and Zone 4 have similar origins, but Zone 4 is historically Sahara Nord.
    // Try transforming with Zone 3 first to confirm geographic coordinates are within range.
    const geo3 = transformCRS({ x, y }, "EPSG:26193", "EPSG:4326");
    if (!isNaN(geo3.y) && geo3.y < 24.29) {
      return "EPSG:26193";
    }
    return "EPSG:26194";
  }

  // Otherwise, it is either Zone 1 (Nord Maroc) or Zone 2 (Sud Maroc)
  const geo1 = transformCRS({ x, y }, "EPSG:26191", "EPSG:4326");
  if (!isNaN(geo1.y)) {
    if (geo1.y >= 31.5) {
      return "EPSG:26191";
    } else {
      return "EPSG:26192";
    }
  }

  return "EPSG:26191";
}
