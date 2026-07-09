/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { Vertex, Segment, Parcel, DocumentSettings } from "./types";
import { sampleParcels } from "./data/sampleParcels";
import { ParcelMap } from "./components/ParcelMap";
import { PrintSheetLayout } from "./components/PrintSheetLayout";
import { AboutPage } from "./components/AboutPage";
import {
  parseDXF,
  parseGeoJSON,
  convertGeoJSONToParsedFeatures,
  ParsedFeature,
  parseCSV,
  parseExcel,
  parseGeoPackage,
  parseShapefileZip,
  parseShapefilePair,
} from "./utils/fileParsers";
import { translations } from "./utils/translations";
import {
  calculatePolygonArea,
  calculatePolygonPerimeter,
  buildSegmentsAndStats,
  formatAreaHac,
  latLngToPlane,
} from "./utils/gisUtils";
import {
  SupportedCRS,
  transformCRS,
  CRS_DETAILS,
  detectCRSFromPrj,
  detectMoroccanLambertZone,
} from "./utils/projectionManager";
import {
  Compass,
  Layers,
  Settings,
  Table,
  PlusCircle,
  Trash2,
  FileDown,
  Upload,
  RefreshCw,
  FolderOpen,
  MapPin,
  CheckCircle,
  HelpCircle,
} from "lucide-react";

export default function App() {
  // Global Workspace States
  const [parcels, setParcels] = useState<Parcel[]>(() => {
    try {
      const saved = localStorage.getItem("cadastral_parcels");
      const loaded = saved ? JSON.parse(saved) : sampleParcels;
      
      const defaultParcel = sampleParcels.find(p => p.id === "parcelle-par-defaut");
      if (Array.isArray(loaded)) {
        const index = loaded.findIndex((p: any) => p.id === "parcelle-par-defaut");
        if (index !== -1) {
          // Force update the default parcel so the new neighbor names and coordinates are applied immediately
          if (defaultParcel) {
            loaded[index] = defaultParcel;
          }
        } else {
          if (defaultParcel) {
            loaded.unshift(defaultParcel);
          }
        }
      }
      return loaded;
    } catch (_) {
      return sampleParcels;
    }
  });

  const [selectedParcelId, setSelectedParcelId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem("cadastral_selected_parcel_id");
      // Change the default start-up selected parcel to our new default parcel
      if (!saved || saved === "titre-almarj") {
        return "parcelle-par-defaut";
      }
      return saved;
    } catch (_) {
      return "parcelle-par-defaut";
    }
  });

  const [viewMode, setViewMode] = useState<"map_editor" | "print_preview" | "about">("map_editor");
  const [printLayoutType, setPrintLayoutType] = useState<"type1" | "type2">("type1");

  const [lang, setLang] = useState<"ar" | "fr">(() => {
    try {
      const saved = localStorage.getItem("cadastral_language");
      return (saved as "ar" | "fr") || "ar";
    } catch (_) {
      return "ar";
    }
  });

  React.useEffect(() => {
    try {
      localStorage.setItem("cadastral_language", lang);
    } catch (_) {}
  }, [lang]);

  const t = translations[lang];

  const [selectedVertexId, setSelectedVertexId] = useState<number | null>(null);
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);
  const [isDrawingMode, setDrawingMode] = useState<boolean>(false);

  // States for dynamic unified file imports (Source coordinates + Column naming + Parcel list)
  const [importNotification, setImportNotification] = useState<{
    fileName: string;
    count: number;
    show: boolean;
    parcelIds: string[];
    rawFeatures: ParsedFeature[];
    sourceCRS: SupportedCRS;
    format: string;
  } | null>(null);

  // Dynamic tabular attribute naming mapping state
  const [selectedAttributeKey, setSelectedAttributeKey] = useState<string>("");

  // Search query for filtering large list of imported parcels
  const [importSearchQuery, setImportSearchQuery] = useState<string>("");

  // Clean reset of selected columns when switcher triggers
  React.useEffect(() => {
    setSelectedAttributeKey("");
  }, [selectedParcelId]);

  // Moroccan Cadastre Template Settings
  const [settings, setSettings] = useState<DocumentSettings>(() => {
    const defaultSettings: DocumentSettings = {
      ministryFr: "Royaume du Maroc\nMinistère des Habous et des Affaires Islamiques\nService de Conservations des Biens",
      ministryAr: "المملكة المغربية\nوزارة الأوقاف والشؤون الإسلامية\nمصلحة المحافظة على الأملاك",
      planTitle: "PLAN PARCELLAIRE",
      author: "",
      service: "Service de Conservation Foncière (Casablanca)",
      date: new Date().toLocaleDateString("fr-FR"),
      logoUrl: "", // Default vector badge renders if empty
      gridInterval: 50,
      northArrowSize: 12,
      pageFormat: "A4",
      mapLabels: "Longueurs + Voisins",
      projectionSystem: "EPSG:26191",
      scaleMode: "auto",
      customScale: 500,
      dossierNumber: "2026/...",
      vertexPrefixType: "P",
      customPrefix: "",
      vertexFontSize: 8.5,
      labelFontSize: 7.0,
      labelOffset: 7.0,
    };
    try {
      const saved = localStorage.getItem("cadastral_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        const savedParcelId = localStorage.getItem("cadastral_selected_parcel_id");
        if (!savedParcelId || savedParcelId === "parcelle-par-defaut") {
          parsed.projectionSystem = "EPSG:26191";
        }
        if (!parsed.dossierNumber) {
          parsed.dossierNumber = "2026/...";
        }
        if (!parsed.vertexPrefixType) {
          parsed.vertexPrefixType = "P";
        }
        if (parsed.customPrefix === undefined) {
          parsed.customPrefix = "";
        }
        if (parsed.vertexFontSize === undefined) {
          parsed.vertexFontSize = 8.5;
        }
        if (parsed.labelFontSize === undefined) {
          parsed.labelFontSize = 7.0;
        }
        if (parsed.labelOffset === undefined) {
          parsed.labelOffset = 7.0;
        }
        return parsed;
      }
      return defaultSettings;
    } catch (_) {
      return defaultSettings;
    }
  });

  const getFormattedLabel = (idx: number, type = settings.vertexPrefixType, custom = settings.customPrefix) => {
    const pType = type || "P";
    if (pType === "None") return `${idx + 1}`;
    if (pType === "B") return `B${idx + 1}`;
    if (pType === "Custom") return `${(custom || "").trim()}${idx + 1}`;
    return `P${idx + 1}`;
  };

  const updateVertexLabels = (
    prefixType: "P" | "B" | "Custom" | "None",
    customPrefixStr: string
  ) => {
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        const updatedVertices = p.vertices.map((v, idx) => ({
          ...v,
          label: getFormattedLabel(idx, prefixType, customPrefixStr),
        }));

        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: updatedVertices,
          segments: buildSegmentsAndStats(updatedVertices, existingNeighbors),
        };
      })
    );
  };

  // Persist State to LocalStorage for cross-tab multi-view synching
  React.useEffect(() => {
    try {
      localStorage.setItem("cadastral_parcels", JSON.stringify(parcels));
    } catch (_) {}
  }, [parcels]);

  React.useEffect(() => {
    try {
      localStorage.setItem("cadastral_selected_parcel_id", selectedParcelId);
    } catch (_) {}
  }, [selectedParcelId]);

  React.useEffect(() => {
    try {
      localStorage.setItem("cadastral_settings", JSON.stringify(settings));
    } catch (_) {}
  }, [settings]);

  const handleWorkspaceCRSChange = (newCRS: SupportedCRS) => {
    const oldCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
      ? settings.projectionSystem
      : "EPSG:26191") as SupportedCRS;
    
    if (oldCRS === newCRS) return;

    // Reproject coordinates of all existing parcels in memory!
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        const reprojectedVertices = p.vertices.map((v) => {
          const transformed = transformCRS({ x: v.x, y: v.y }, oldCRS, newCRS);
          return {
            ...v,
            x: parseFloat(transformed.x.toFixed(2)),
            y: parseFloat(transformed.y.toFixed(2)),
          };
        });

        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: reprojectedVertices,
          segments: buildSegmentsAndStats(reprojectedVertices, existingNeighbors),
          area: calculatePolygonArea(reprojectedVertices),
          perimeter: calculatePolygonPerimeter(reprojectedVertices),
        };
      })
    );

    setSettings((prev) => ({
      ...prev,
      projectionSystem: newCRS,
    }));
  };

  const handleUpdateImportCRS = (newSourceCRS: SupportedCRS) => {
    if (!importNotification) return;

    const oldCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
      ? settings.projectionSystem
      : "EPSG:26191") as SupportedCRS;

    // Update coordinates of all corresponding parcels in place!
    setParcels((prevParcels) => {
      return prevParcels.map((p) => {
        const idxInImport = importNotification.parcelIds.indexOf(p.id);
        if (idxInImport === -1) {
          // This is NOT part of the current import; we must transform its coordinates to keep it aligned with the new workspace CRS
          const reprojectedVertices = p.vertices.map((v) => {
            const transformed = transformCRS({ x: v.x, y: v.y }, oldCRS, newSourceCRS);
            return {
              id: v.id,
              label: v.label,
              x: parseFloat(transformed.x.toFixed(2)),
              y: parseFloat(transformed.y.toFixed(2)),
            };
          });
          return {
            ...p,
            vertices: reprojectedVertices,
            segments: buildSegmentsAndStats(reprojectedVertices),
            area: calculatePolygonArea(reprojectedVertices),
            perimeter: calculatePolygonPerimeter(reprojectedVertices),
          };
        }

        const rawFeat = importNotification.rawFeatures[idxInImport];
        if (!rawFeat) return p;

        // Project coordinates correctly based on whether raw features are using geographic degrees or raw file meters
        const projectedVerts: Vertex[] = rawFeat.vertices.map((v, vIdx) => {
          const rawSystem = rawFeat.isGeographic ? "EPSG:4326" : newSourceCRS;
          const transformed = transformCRS({ x: v.x, y: v.y }, rawSystem, newSourceCRS);
          return {
            id: vIdx + 1,
            label: getFormattedLabel(vIdx),
            x: parseFloat(transformed.x.toFixed(2)),
            y: parseFloat(transformed.y.toFixed(2)),
          };
        });

        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: projectedVerts,
          segments: buildSegmentsAndStats(projectedVerts, existingNeighbors),
          area: calculatePolygonArea(projectedVerts),
          perimeter: calculatePolygonPerimeter(projectedVerts),
        };
      });
    });

    // Keep workspace projection system synchronized with the imported file's SRS
    setSettings((prev) => ({
      ...prev,
      projectionSystem: newSourceCRS,
    }));

    // Update local state in importNotification
    setImportNotification((prev) => prev ? { ...prev, sourceCRS: newSourceCRS } : null);
  };

  const handleUpdateNamingKey = (key: string) => {
    setSelectedAttributeKey(key);
    if (!importNotification) return;

    setParcels((prev) =>
      prev.map((p) => {
        const idxInImport = importNotification.parcelIds.indexOf(p.id);
        if (idxInImport === -1) return p;

        const rawFeat = importNotification.rawFeatures[idxInImport];
        if (rawFeat && rawFeat.attributes && rawFeat.attributes[key]) {
          const val = String(rawFeat.attributes[key]).trim();
          if (val) {
            return {
              ...p,
              name: val,
            };
          }
        }
        return p;
      })
    );
  };

  // Reference hooks & Form parameters
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [newVertexX, setNewVertexX] = useState<string>("");
  const [newVertexY, setNewVertexY] = useState<string>("");

  // Retrieve active parcel details
  const activeParcel = parcels.find((p) => p.id === selectedParcelId) || parcels[0];

  // Sync state helpers when coordinates or vertices change
  const handleVertexUpdate = (id: number, updatedX: number, updatedY: number) => {
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        if (p.id !== selectedParcelId) return p;

        // Map and update target vertex point coordinates
        const updatedVertices = p.vertices.map((v) =>
          v.id === id ? { ...v, x: parseFloat(updatedX.toFixed(2)), y: parseFloat(updatedY.toFixed(2)) } : v
        );

        // Retrieve existing neighbor names to persist them across rebuilds
        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        const newSegments = buildSegmentsAndStats(updatedVertices, existingNeighbors);
        const newArea = calculatePolygonArea(updatedVertices);
        const newPerimeter = calculatePolygonPerimeter(updatedVertices);

        return {
          ...p,
          vertices: updatedVertices,
          segments: newSegments,
          area: newArea,
          perimeter: newPerimeter,
        };
      })
    );
  };

  // Persists edited neighbor credentials immediately into App state
  const handleNeighborUpdate = (segmentId: number, nameText: string) => {
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        if (p.id !== selectedParcelId) return p;
        const updatedSegments = p.segments.map((s) =>
          s.id === segmentId ? { ...s, neighbor: nameText } : s
        );
        return {
          ...p,
          segments: updatedSegments,
        };
      })
    );
  };

  // Adds a vertex manually via sidebar coordinate submission
  const handleAddVertexSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const xVal = parseFloat(newVertexX);
    const yVal = parseFloat(newVertexY);

    if (isNaN(xVal) || isNaN(yVal)) {
      alert("Veuillez saisir des coordonnées numériques valides.");
      return;
    }

    handleAddVertex(xVal, yVal);
    setNewVertexX("");
    setNewVertexY("");
  };

  // Add vertex logic utilized by both Form and Draggable events
  const handleAddVertex = (x: number, y: number, insertAtIndex?: number) => {
    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        if (p.id !== selectedParcelId) return p;

        const nextId = p.vertices.length > 0 ? Math.max(...p.vertices.map((v) => v.id)) + 1 : 1;
        const newVert: Vertex = {
          id: nextId,
          label: getFormattedLabel(p.vertices.length),
          x: parseFloat(x.toFixed(2)),
          y: parseFloat(y.toFixed(2)),
        };

        const updatedVertices = [...p.vertices];
        if (typeof insertAtIndex === "number") {
          updatedVertices.splice(insertAtIndex, 0, newVert);
        } else {
          updatedVertices.push(newVert);
        }

        // Re-index all vertices so names remain sequential (P1, P2...) if points are inserted/deleted
        const reindexedVertices = updatedVertices.map((v, idx) => ({
          ...v,
          id: idx + 1,
          label: getFormattedLabel(idx),
        }));

        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: reindexedVertices,
          segments: buildSegmentsAndStats(reindexedVertices, existingNeighbors),
          area: calculatePolygonArea(reindexedVertices),
          perimeter: calculatePolygonPerimeter(reindexedVertices),
        };
      })
    );
  };

  // Deletes target vertex and triggers re-calculations
  const handleDeleteVertex = (vertexId: number) => {
    if (activeParcel.vertices.length <= 3) {
      alert("Une parcelle doit comporter au moins 3 points d'angle pour délimiter une surface !");
      return;
    }

    setParcels((prevParcels) =>
      prevParcels.map((p) => {
        if (p.id !== selectedParcelId) return p;

        // Skip target point and re-index vertex labels for consistency
        const filteredVertices = p.vertices
          .filter((v) => v.id !== vertexId)
          .map((v, idx) => ({
            ...v,
            label: getFormattedLabel(idx),
            id: idx + 1,
          }));

        // Adjust layout segment mapping
        const existingNeighbors: Record<number, string> = {};
        p.segments.forEach((s) => {
          existingNeighbors[s.id] = s.neighbor;
        });

        return {
          ...p,
          vertices: filteredVertices,
          segments: buildSegmentsAndStats(filteredVertices, existingNeighbors),
          area: calculatePolygonArea(filteredVertices),
          perimeter: calculatePolygonPerimeter(filteredVertices),
        };
      })
    );
    setSelectedVertexId(null);
  };

  // Universal importer for multiple formats: GeoJSON, DXF, KML, CSV, and EXCEL
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files: File[] = Array.from(fileList);

    // SECURITY: Input validation & Size checking (Max 15MB per file to prevent Browser crash / DoS)
    const MAX_FILE_SIZE_MB = 15;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    const SUPPORTED_EXTENSIONS = [
      ".geojson", ".json", ".csv", ".xls", ".xlsx", ".dxf", ".gpkg", ".zip", ".shp", ".dbf", ".gpx", ".kml"
    ];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        alert(
          lang === "ar"
            ? `⚠️ حجم الملف "${file.name}" كبير جداً. الحد الأقصى المسموح به هو ${MAX_FILE_SIZE_MB} ميغابايت.`
            : `⚠️ Le fichier "${file.name}" est trop volumineux. La limite maximale autorisée est de ${MAX_FILE_SIZE_MB} Mo.`
        );
        return;
      }

      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) {
        alert(
          lang === "ar"
            ? `⚠️ صيغة الملف غير مدعومة لـ "${file.name}".`
            : `⚠️ Le format du fichier "${file.name}" n'est pas pris en charge.`
        );
        return;
      }
    }

    const processFeatures = (
      features: ParsedFeature[],
      formatName: string,
      originFileName: string,
      explicitCRS?: SupportedCRS
    ) => {
      if (features.length === 0) {
        alert("Aucune entité géométrique fermée (Polygone ou Polyligne) n'a été détectée dans ce fichier.");
        return;
      }

      const isGeographic = features.some((f) => f.isGeographic);
      let finalSourceCRS: SupportedCRS = "EPSG:26191";

      if (explicitCRS) {
        finalSourceCRS = explicitCRS;
      } else if (isGeographic) {
        finalSourceCRS = "EPSG:4326";
      } else {
        // Run smart geographic zone auto-detection based on the coordinate center point (centroid)
        let sumX = 0, sumY = 0, count = 0;
        features.forEach((feat) => {
          feat.vertices.forEach((v) => {
            sumX += v.x;
            sumY += v.y;
            count++;
          });
        });
        if (count > 0) {
          const avgX = sumX / count;
          const avgY = sumY / count;
          finalSourceCRS = detectMoroccanLambertZone(avgX, avgY);
        }
      }

      const oldCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
        ? settings.projectionSystem
        : "EPSG:26191") as SupportedCRS;

      if (oldCRS !== finalSourceCRS) {
        // Reproject any existing parcels to the new system so they stay in spatial alignment under the new workspace CRS
        setParcels((prevParcels) =>
          prevParcels.map((p) => {
            const reprojectedVertices = p.vertices.map((v) => {
              const transformed = transformCRS({ x: v.x, y: v.y }, oldCRS, finalSourceCRS);
              return {
                id: v.id,
                label: v.label,
                x: parseFloat(transformed.x.toFixed(2)),
                y: parseFloat(transformed.y.toFixed(2)),
              };
            });
            return {
              ...p,
              vertices: reprojectedVertices,
              segments: buildSegmentsAndStats(reprojectedVertices),
              area: calculatePolygonArea(reprojectedVertices),
              perimeter: calculatePolygonPerimeter(reprojectedVertices),
            };
          })
        );

        setSettings((prev) => ({
          ...prev,
          projectionSystem: finalSourceCRS,
        }));
      }

      const newParcels: Parcel[] = features.map((feat, idx) => {
        const id = `uploaded-${Date.now()}-${idx}`;
        const projectedVerts: Vertex[] = feat.vertices.map((v, vIdx) => {
          // Project coordinates correctly based on whether raw features are using WGS84 degrees or are in native metres
          const rawSystem = feat.isGeographic ? "EPSG:4326" : finalSourceCRS;
          const transformed = transformCRS({ x: v.x, y: v.y }, rawSystem, finalSourceCRS);
          return {
            id: vIdx + 1,
            label: getFormattedLabel(vIdx),
            x: parseFloat(transformed.x.toFixed(2)),
            y: parseFloat(transformed.y.toFixed(2)),
          };
        });

        const name = feat.name || `قطعة أرضية ${idx + 1}`;

        return {
          id,
          name,
          vertices: projectedVerts,
          segments: buildSegmentsAndStats(projectedVerts),
          area: calculatePolygonArea(projectedVerts),
          perimeter: calculatePolygonPerimeter(projectedVerts),
          attributes: feat.attributes || {
            ID: `FEAT-${idx + 1}`,
            Nom: name,
            Source: formatName,
          }
        };
      });

      setParcels((prev) => [...prev, ...newParcels]);
      setSelectedParcelId(newParcels[0].id);
      setSelectedAttributeKey(""); // Reset column mapping selection
      setImportSearchQuery(""); // Reset search query on new import

      setImportNotification({
        fileName: originFileName,
        count: newParcels.length,
        show: true,
        parcelIds: newParcels.map((p) => p.id),
        rawFeatures: features,
        sourceCRS: finalSourceCRS,
        format: formatName,
      });
    };

    try {
      const shpFile = files.find(f => f.name.toLowerCase().endsWith(".shp"));
      const dbfFile = files.find(f => f.name.toLowerCase().endsWith(".dbf"));
      const zipFile = files.find(f => f.name.toLowerCase().endsWith(".zip"));

      // Scenario A: Zipped Shapefile / ZIP containing map files
      if (zipFile) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          try {
            const buffer = event.target?.result as ArrayBuffer;
            const parsed = await parseShapefileZip(buffer);
            processFeatures(parsed, "Zipped Shapefile (.zip)", zipFile.name);
          } catch (err) {
            console.error(err);
            alert("Erreur: Impossible d'analyser le fichier ZIP.");
          }
        };
        reader.readAsArrayBuffer(zipFile);
        return;
      }

      // Scenario B: Individual .shp + .dbf selected together
      if (shpFile && dbfFile) {
        const shpReader = new FileReader();
        shpReader.onload = (shpEvent) => {
          const shpBuffer = shpEvent.target?.result as ArrayBuffer;
          const dbfReader = new FileReader();
          dbfReader.onload = async (dbfEvent) => {
            const dbfBuffer = dbfEvent.target?.result as ArrayBuffer;
            try {
              const parsed = await parseShapefilePair(shpBuffer, dbfBuffer);
              processFeatures(parsed, "Shapefile (.shp + .dbf)", shpFile.name);
            } catch (err) {
              console.error(err);
              alert("Erreur: Impossible d'analyser la paire de fichiers Shapefile (.shp + .dbf).");
            }
          };
          dbfReader.readAsArrayBuffer(dbfFile);
        };
        shpReader.readAsArrayBuffer(shpFile);
        return;
      }

      // Scenario E: Other individual files
      const primaryFile = files[0];
      if (primaryFile) {
        const extension = primaryFile.name.substring(primaryFile.name.lastIndexOf(".")).toLowerCase();
        const reader = new FileReader();

        if (extension === ".xlsx" || extension === ".xls") {
          reader.onload = (event) => {
            try {
              const buffer = event.target?.result as ArrayBuffer;
              const parsed = parseExcel(buffer, primaryFile.name);
              processFeatures(parsed, extension === ".xlsx" ? "Excel (.xlsx)" : "Excel (.xls)", primaryFile.name);
            } catch (err) {
              console.error(err);
              alert("Erreur: Impossible de lire ou analyser ce fichier Excel.");
            }
          };
          reader.readAsArrayBuffer(primaryFile);
          return;
        }

        if (extension === ".gpkg") {
          reader.onload = (event) => {
            try {
              const buffer = event.target?.result as ArrayBuffer;
              const parsed = parseGeoPackage(buffer);
              processFeatures(parsed, "GeoPackage (.gpkg)", primaryFile.name);
            } catch (err) {
              console.error(err);
              alert("Erreur: Impossible de lire ou analyser ce fichier GeoPackage.");
            }
          };
          reader.readAsArrayBuffer(primaryFile);
          return;
        }

        reader.onload = (event) => {
          const content = event.target?.result as string;
          try {
            if (extension === ".csv") {
              const parsed = parseCSV(content, primaryFile.name);
              processFeatures(parsed, "CSV", primaryFile.name);
            } else if (extension === ".dxf") {
              const parsed = parseDXF(content);
              processFeatures(parsed, "DXF", primaryFile.name);
            } else {
              const parsed = parseGeoJSON(content);

              let geojsonCRS: SupportedCRS | undefined;
              try {
                const rawObj = JSON.parse(content);
                if (rawObj.crs?.properties?.name) {
                  const crsName = String(rawObj.crs.properties.name);
                  if (crsName.includes("26191")) geojsonCRS = "EPSG:26191";
                  else if (crsName.includes("26192")) geojsonCRS = "EPSG:26192";
                  else if (crsName.includes("26193")) geojsonCRS = "EPSG:26193";
                  else if (crsName.includes("26194")) geojsonCRS = "EPSG:26194";
                  else if (crsName.includes("4326")) geojsonCRS = "EPSG:4326";
                }
              } catch (_) {}

              processFeatures(parsed, "GeoJSON", primaryFile.name, geojsonCRS);
            }
          } catch (err) {
            alert("Une erreur de lecture ou d'analyse s'est produite lors du décodage de ce fichier.");
          }
        };
        reader.readAsText(primaryFile);
      }
    } catch (err) {
      console.error(err);
      alert("Une erreur inattendue s'est produite lors de l'importation.");
    }
  };

  // Instantiates a fresh blank square parcel centered in the workspace
  const handleAddNewBlankParcel = () => {
    const freshId = `parcelle-${Date.now()}`;
    const newVertices: Vertex[] = [
      { id: 1, label: "P1", x: 360050.0, y: 410050.0 },
      { id: 2, label: "P2", x: 360150.0, y: 410050.0 },
      { id: 3, label: "P3", x: 360150.0, y: 410150.0 },
      { id: 4, label: "P4", x: 360050.0, y: 410150.0 },
    ];
    const newParcel: Parcel = {
      id: freshId,
      name: `Projet de délimitation N° ${parcels.length + 1}`,
      vertices: newVertices,
      segments: buildSegmentsAndStats(newVertices),
      area: calculatePolygonArea(newVertices),
      perimeter: calculatePolygonPerimeter(newVertices),
    };
    setParcels((prev) => [...prev, newParcel]);
    setSelectedParcelId(freshId);
    setDrawingMode(true);
  };

  // Logo file selection reader to render image inside Page 1 Layout header
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSettings((prev) => ({ ...prev, logoUrl: event.target!.result as string }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* ======================================================== */}
      {/* 1. APP TOP BAR HEADER (Hidden from print layout) */}
      {/* ======================================================== */}
      <header className="bg-emerald-950 border-b border-emerald-800 px-6 py-4 flex flex-col md:flex-row gap-4 items-center justify-between shadow-lg sticky top-0 z-50 print:hidden leading-none">
        {/* Title */}
        <div className="flex items-center gap-3 animate-fade-in">
          <div className="bg-amber-500 text-slate-900 p-2 rounded-xl shadow-md">
            <Compass className="w-6 h-6 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-md font-extrabold tracking-widest text-[#f3f4f6] flex items-center gap-2">
              {t.appTitle}
              <span className="text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded-sm uppercase font-mono tracking-widest font-black leading-none">
                {t.version}
              </span>
            </h1>
            <p className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider mt-1 leading-none">
              {t.appSubtitle}
            </p>
          </div>
        </div>

        {/* Global Selectors */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Language Switcher */}
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setLang("ar")}
              className={`px-3 py-1 text-[11px] rounded transition-all font-bold ${
                lang === "ar"
                  ? "bg-emerald-600 text-white shadow-md font-sans"
                  : "text-slate-400 hover:text-slate-200 font-sans"
              }`}
            >
              العربية
            </button>
            <button
              onClick={() => setLang("fr")}
              className={`px-3 py-1 text-[11px] rounded transition-all font-bold ${
                lang === "fr"
                  ? "bg-emerald-600 text-white shadow-md font-sans"
                  : "text-slate-400 hover:text-slate-200 font-sans"
              }`}
            >
              Français
            </button>
          </div>

          {/* Active target parcel dropdown */}
          <div className="flex items-center gap-2 bg-slate-800/80 rounded-xl px-3 py-2 border border-slate-700 w-full md:w-48 text-stone-100 md:w-auto">
            <Layers className="w-4 h-4 text-emerald-400" />
            <select
              value={selectedParcelId}
              onChange={(e) => setSelectedParcelId(e.target.value)}
              className="bg-transparent text-xs font-bold focus:outline-none w-full text-slate-200"
            >
              {parcels.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-800 text-slate-100">
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Create new plan button */}
          <button
            onClick={handleAddNewBlankParcel}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-800 hover:bg-emerald-700 border border-emerald-600 rounded-xl text-xs font-semibold transition"
            title={t.newPlanBtn}
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>{t.newPlanBtn}</span>
          </button>

          {/* Mode toggle */}
          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            <button
              onClick={() => setViewMode("map_editor")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === "map_editor"
                  ? "bg-amber-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>{t.editMapBtn}</span>
            </button>
            <button
              onClick={() => {
                setViewMode("print_preview");
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === "print_preview"
                  ? "bg-amber-600 text-white shadow-md animate-none"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{t.printBtn}</span>
            </button>
            <button
              onClick={() => setViewMode("about")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                viewMode === "about"
                  ? "bg-amber-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{lang === "ar" ? "حول البرنامج" : "À Propos"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* 2. MAIN VIEW SWITCHER */}
      {/* ======================================================== */}
      {viewMode === "print_preview" ? (
        <PrintSheetLayout
          parcel={activeParcel}
          settings={settings}
          onBackToEditor={() => setViewMode("map_editor")}
          initialLayoutType={printLayoutType}
        />
      ) : viewMode === "about" ? (
        <AboutPage
          lang={lang}
          onBack={() => setViewMode("map_editor")}
        />
      ) : (
        /* workspace view (editor) */
        <main className="flex-1 grid grid-cols-12 print:hidden leading-none select-none">
          {/* ======================================================== */}
          {/* A. LEFT SIDEBAR: Template Configuration Parameters */}
          {/* ======================================================== */}
          <aside className="col-span-12 xl:col-span-3 bg-slate-800/90 border-r border-slate-700 p-5 flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-80px)]">
            {/* Expanded Multi-Format Importer box */}
            <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-700 flex flex-col gap-3">
              <h2 className="text-xs font-extrabold text-amber-400 uppercase tracking-widest flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                <span>Importation Données</span>
              </h2>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Importation de levés topographiques multi-formats :
                <span className="block mt-1 text-[9.5px] font-mono text-emerald-400 font-bold">
                  • DXF • GEOPACKAGE (.gpkg) • GeoJSON • CSV • EXCEL (.xlsx/.xls) • SHAPEFILE (.zip/.shp)
                </span>
              </p>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-600/50 hover:bg-emerald-950/20 rounded-lg p-3.5 text-center cursor-pointer transition flex flex-col items-center justify-center gap-2 group"
              >
                <Upload className="w-5 h-5 text-slate-500 group-hover:text-emerald-500 transition" />
                <span className="text-[10.5px] font-medium text-slate-300">Choisir un fichier d'arpentage</span>
                <span className="text-[8px] text-slate-500 font-mono">Glisser DXF, CSV, EXCEL, GPKG, GeoJSON, SHP, DBF, ou ZIP</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".geojson,.json,.csv,.xls,.xlsx,.dxf,.gpkg,.zip,.shp,.dbf"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>

              {/* Unified Import Session Control Card */}
              {importNotification && importNotification.show && (
                <div className="bg-emerald-950/85 border border-emerald-500/40 rounded-lg p-3 text-xs flex flex-col gap-2.5 mt-2 leading-none font-sans">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold justify-between">
                    <div className="flex items-center gap-1.5 font-sans">
                      <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                      <span>{lang === "ar" ? "معالجة ومطابقة بيانات الرفع" : "Rapprochement & Traitement des Données"}</span>
                    </div>
                    <button 
                      onClick={() => setImportNotification(null)}
                      className="text-stone-400 hover:text-stone-200 text-[10px] font-mono px-1"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="text-[10px] text-slate-300 leading-normal border-b border-emerald-900/50 pb-2 font-sans">
                    {t.importFile} <span className="font-mono text-amber-400 block truncate font-semibold">{importNotification.fileName}</span>
                    {t.importType} <span className="text-emerald-400 font-bold">{importNotification.format || "Autre"}</span>
                  </div>

                  {/* 1. COORDINATE SYSTEM OF FILE SECTION */}
                  <div className="bg-slate-950/70 p-2 rounded border border-slate-850 flex flex-col gap-1.5 leading-relaxed font-sans">
                    <span className="text-[9.5px] text-amber-500 font-bold font-sans">
                      {t.importSourceCrs}
                    </span>
                    <select
                      value={importNotification.sourceCRS || "EPSG:26191"}
                      onChange={(e) => handleUpdateImportCRS(e.target.value as SupportedCRS)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-200 focus:outline-none cursor-pointer font-sans"
                    >
                      {Object.entries(CRS_DETAILS).map(([crs, details]) => (
                        <option key={crs} value={crs} className="font-sans">
                          {crs} - {lang === "ar" ? details.arabic : details.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 2. CHOOSE ATTRIBUTE KEY FOR NAMING */}
                  {(() => {
                    const importedParcels = parcels.filter(p => importNotification.parcelIds.includes(p.id));
                    const firstImported = importedParcels[0];
                    const attributeKeys = firstImported && firstImported.attributes
                      ? Object.keys(firstImported.attributes).filter(k => k !== "Source")
                      : [];

                    if (attributeKeys.length === 0) return null;

                    return (
                      <div className="bg-slate-950/70 border border-slate-850 p-2 rounded flex flex-col gap-1.5 leading-relaxed font-sans">
                        <label className="text-[9.5px] text-amber-500 block font-bold">
                          {t.importAdoptName}
                        </label>
                        <select
                          value={selectedAttributeKey}
                          onChange={(e) => handleUpdateNamingKey(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-[10px] text-slate-200 focus:outline-none cursor-pointer"
                        >
                          <option value="">{t.importChooseColumn}</option>
                          {attributeKeys.map(k => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })()}

                  {/* 3. LIST OF PROPERTIES */}
                  <div className="border-t border-slate-800/80 pt-2 flex flex-col gap-1.5 mt-0.5">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[9.5px] text-emerald-400 font-bold block font-sans animate-pulse">
                        {lang === "ar" ? "لائحة الأملاك المكونة للملــــف :" : "Liste des parcelles composant le dossier :"}
                      </span>
                      {importNotification.parcelIds.length > 5 && (
                        <span className="text-[8.5px] font-mono text-slate-400 font-bold bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800/60">
                          {importNotification.parcelIds.length} {lang === "ar" ? "مضلعات" : "polygones"}
                        </span>
                      )}
                    </div>

                    {/* Highly interactive search & filter tool */}
                    <div className="relative">
                      <input
                        type="text"
                        placeholder={lang === "ar" ? "🔍 ابحث باسم أو رقم الملك أو القمم..." : "🔍 Rechercher par nom, attribut..."}
                        value={importSearchQuery}
                        onChange={(e) => setImportSearchQuery(e.target.value)}
                        className={`w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-[11px] text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all font-sans ${
                          lang === "ar" ? "text-right" : "text-left"
                        }`}
                      />
                      {importSearchQuery && (
                        <button
                          onClick={() => setImportSearchQuery("")}
                          className={`absolute text-slate-500 hover:text-slate-300 transition text-[10px] px-1 font-sans top-1/2 -translate-y-1/2 ${
                            lang === "ar" ? "left-2.5" : "right-2.5"
                          }`}
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    {/* List of properties filtered */}
                    <div className="max-h-40 overflow-y-auto flex flex-col gap-1 pr-1 font-sans bg-slate-950/60 p-1.5 rounded border border-slate-850">
                      {(() => {
                        const filteredIds = importNotification.parcelIds.filter((pId) => {
                          const matchP = parcels.find((p) => p.id === pId);
                          if (!matchP) return false;
                          if (!importSearchQuery.trim()) return true;
                          const q = importSearchQuery.toLowerCase();
                          const matchesName = matchP.name.toLowerCase().includes(q);
                          const matchesAttrs = matchP.attributes && Object.values(matchP.attributes).some(
                            (val) => String(val).toLowerCase().includes(q)
                          );
                          return matchesName || matchesAttrs;
                        });

                        if (filteredIds.length === 0) {
                          return (
                            <div className="text-center py-4 text-slate-500 text-[10.5px] font-sans">
                              {lang === "ar" ? "⚠️ لا توجد نتائج مطابقة لبحثك" : "⚠️ Aucun résultat correspondant"}
                            </div>
                          );
                        }

                        return (
                          <>
                            {importSearchQuery.trim() && (
                              <div className="text-[8.5px] text-amber-400 font-mono mb-1 border-b border-slate-800 pb-1 flex justify-between px-1">
                                <span>{lang === "ar" ? "نتائج البحث :" : "Résultats :"}</span>
                                <span>
                                  {filteredIds.length} / {importNotification.parcelIds.length}
                                </span>
                              </div>
                            )}
                            {filteredIds.map((pId) => {
                              const matchP = parcels.find(p => p.id === pId);
                              if (!matchP) return null;
                              const isActive = selectedParcelId === pId;
                              return (
                                <button
                                  key={pId}
                                  onClick={() => {
                                    setSelectedParcelId(pId);
                                  }}
                                  className={`w-full text-left px-2.5 py-1.5 rounded transition flex items-start justify-between min-h-[36px] border ${
                                    isActive 
                                      ? "bg-emerald-600/20 text-emerald-300 border-emerald-500/60 font-bold" 
                                      : "bg-slate-900/60 hover:bg-slate-800 text-slate-300 border-slate-800/40"
                                  }`}
                                >
                                  <span className={`font-semibold text-[10.5px] break-words whitespace-normal flex-1 mr-2 ${lang === "ar" ? "text-right" : "text-left"}`}>
                                    {matchP.name}
                                  </span>
                                  <span className="text-[8.5px] font-mono opacity-80 shrink-0 font-bold bg-slate-950/40 px-1.5 py-0.5 rounded text-emerald-400 mt-0.5 font-sans">
                                    {lang === "ar" ? `${matchP.vertices.length} قمم` : `${matchP.vertices.length} Bornes`}
                                  </span>
                                </button>
                              );
                            })}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Document Print layout customizer panel */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-2 border-b border-slate-700 pb-2">
                <Settings className="w-4 h-4 text-emerald-400" />
                <h2 className="text-xs font-extrabold text-[#f3f4f6] uppercase tracking-widest leading-none font-sans">
                  {lang === "ar" ? "إعدادات المخطط والطباعة" : "Paramètres de Levée & Impression"}
                </h2>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-1 gap-3.5 text-xs text-slate-300 font-sans">
                {/* Plan Document Title */}
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                    {lang === "ar" ? "العنوان الرئيسي للوثيقة" : "Titre Principal du Document"}
                  </label>
                  <input
                    type="text"
                    value={settings.planTitle}
                    onChange={(e) => setSettings({ ...settings, planTitle: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-bold text-slate-200 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                  />
                </div>

                {/* Column / Attribute Selector for Name */}
                {activeParcel.attributes && Object.keys(activeParcel.attributes).length > 0 && (
                  <div className="bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20 flex flex-col gap-1.5">
                    <label className="text-[10px] text-amber-400 uppercase tracking-wider block font-bold leading-normal">
                      {t.adoptNameFromTableBtn}
                    </label>
                    <select
                      value={selectedAttributeKey}
                      onChange={(e) => {
                        const key = e.target.value;
                        setSelectedAttributeKey(key);
                        if (key && activeParcel.attributes && activeParcel.attributes[key]) {
                          const attrVal = activeParcel.attributes[key];
                          setParcels(prev => prev.map(p => p.id === activeParcel.id ? { ...p, name: attrVal } : p));
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1.5 text-[11px] text-slate-200 focus:ring-1 focus:ring-emerald-500 focus:outline-none font-sans"
                    >
                      <option value="">{t.importChooseColumn}</option>
                      {Object.keys(activeParcel.attributes).map((attrKey) => (
                        <option key={attrKey} value={attrKey}>
                          {attrKey} ({activeParcel.attributes![attrKey]})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Active Parcel Name Text Input (Editable) */}
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                    {t.parcelNameLabel}
                  </label>
                  <input
                    type="text"
                    value={activeParcel.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setParcels(prev => prev.map(p => p.id === activeParcel.id ? { ...p, name: newName } : p));
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 font-bold text-slate-200 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                  />
                </div>

                {/* Submitting Ministry French Text */}
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                    {lang === "ar" ? "الإصدار الإداري (الفرنسية)" : "Administration émettrice (Français)"}
                  </label>
                  <textarea
                    rows={3}
                    value={settings.ministryFr}
                    onChange={(e) => setSettings({ ...settings, ministryFr: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-sans text-slate-300 text-[10.5px] leading-relaxed focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Submitting Ministry Arabic Text */}
                <div>
                  <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                    {lang === "ar" ? "الإصدار الإداري (العربية)" : "Administration émettrice (Arabe)"}
                  </label>
                  <textarea
                    rows={3}
                    dir="rtl"
                    value={settings.ministryAr}
                    onChange={(e) => setSettings({ ...settings, ministryAr: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 font-sans text-slate-300 text-[11px] leading-relaxed focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                {/* Dossier N° / Service block */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "رقم الملف" : "Dossier N°"}
                    </label>
                    <input
                      type="text"
                      value={settings.dossierNumber}
                      onChange={(e) => setSettings({ ...settings, dossierNumber: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "مصلحة المسح" : "Service Topo"}
                    </label>
                    <input
                      type="text"
                      value={settings.service}
                      onChange={(e) => setSettings({ ...settings, service: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    />
                  </div>
                </div>

                {/* Date Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "تاريخ المخطط" : "Date du Plan"}
                    </label>
                    <input
                      type="text"
                      value={settings.date}
                      onChange={(e) => setSettings({ ...settings, date: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "النظام الإحداثي" : "projection CRS"}
                    </label>
                    <select
                      value={settings.projectionSystem}
                      onChange={(e) => handleWorkspaceCRSChange(e.target.value as SupportedCRS)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10px] text-slate-200"
                    >
                      {Object.entries(CRS_DETAILS).map(([crs, details]) => (
                        <option key={crs} value={crs}>
                          {crs} ({lang === "ar" ? details.arabic : details.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Grid Interval block & Compass size */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono_ tracking-normal">
                      {lang === "ar" ? "تباعد شبكة الإحداثيات (م)" : "Espacement Grille (m)"}
                    </label>
                    <input
                      type="number"
                      value={settings.gridInterval || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setSettings({ ...settings, gridInterval: "" as any });
                        } else {
                          setSettings({ ...settings, gridInterval: parseFloat(val) || 0 });
                        }
                      }}
                      onBlur={() => {
                        if (!settings.gridInterval || settings.gridInterval < 0.1) {
                          setSettings({ ...settings, gridInterval: 50 });
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[11px]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "تعليقات ومسميات" : "Annotations Carte"}
                    </label>
                    <select
                      value={settings.mapLabels}
                      onChange={(e: any) => setSettings({ ...settings, mapLabels: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-1.5 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    >
                      <option value="Aucun">{lang === "ar" ? "اخفاء كل المسميات" : "Aucun"}</option>
                      <option value="Longueurs">{lang === "ar" ? "المسافات فقط" : "Longueurs"}</option>
                      <option value="Voisins">{lang === "ar" ? "أسماء المجاورين فقط" : "Voisins"}</option>
                      <option value="Longueurs + Voisins">{lang === "ar" ? "المسافات والمجاورين معاً" : "Longueurs + Voisins"}</option>
                    </select>
                  </div>
                </div>

                {/* Échelle Numérique Choice & Custom Scale Input */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "المقياس الإفتراضي" : "Échelle Numérique"}
                    </label>
                    <select
                      value={settings.scaleMode || "auto"}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          scaleMode: e.target.value as any,
                        })
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    >
                      <option value="auto">{lang === "ar" ? "تلقائي" : "Auto-optimisé"}</option>
                      <option value="100">1 / 100</option>
                      <option value="250">1 / 250</option>
                      <option value="500">1 / 500</option>
                      <option value="1000">1 / 1000</option>
                      <option value="2500">1 / 2500</option>
                      <option value="5000">1 / 5000</option>
                      <option value="custom">{lang === "ar" ? "تعديل يدوي" : "Saisie Manuelle"}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "مقياس مخصص" : "Échelle Personnalisée"}
                    </label>
                    <input
                      type="number"
                      disabled={settings.scaleMode !== "custom"}
                      value={settings.scaleMode === "custom" ? (settings.customScale || "") : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setSettings({ ...settings, customScale: "" as any });
                        } else {
                          setSettings({ ...settings, customScale: parseInt(val) || 0 });
                        }
                      }}
                      onBlur={() => {
                        if (!settings.customScale || settings.customScale < 5) {
                          setSettings({ ...settings, customScale: 500 });
                        }
                      }}
                      placeholder="Ex: 500"
                      className="w-full bg-slate-900 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    />
                  </div>
                </div>

                {/* Point Label Prefix Configuration */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "تسمية نقط الحدود" : "Préfixe des Sommets"}
                    </label>
                    <select
                      value={settings.vertexPrefixType || "P"}
                      onChange={(e) => {
                        const newType = e.target.value as "P" | "B" | "Custom" | "None";
                        setSettings((prev) => ({ ...prev, vertexPrefixType: newType }));
                        updateVertexLabels(newType, settings.customPrefix || "");
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    >
                      <option value="P">{lang === "ar" ? "الحرف P (افتراضي)" : "P (Par défaut)"}</option>
                      <option value="B">{lang === "ar" ? "الحرف B (بورن)" : "B (Borne)"}</option>
                      <option value="None">{lang === "ar" ? "بدون حرف (أرقام فقط)" : "Sans lettre (Chiffres seuls)"}</option>
                      <option value="Custom">{lang === "ar" ? "بادئة مخصصة..." : "Personnalisé..."}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block mb-1 font-mono">
                      {lang === "ar" ? "بادئة مخصصة" : "Préfixe Perso."}
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      disabled={settings.vertexPrefixType !== "Custom"}
                      value={settings.customPrefix || ""}
                      onChange={(e) => {
                        const newVal = e.target.value;
                        setSettings((prev) => ({ ...prev, customPrefix: newVal }));
                        updateVertexLabels(settings.vertexPrefixType || "Custom", newVal);
                      }}
                      placeholder="Ex: T"
                      className="w-full bg-slate-900 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none text-[10.5px]"
                    />
                  </div>
                </div>

                {/* Visual Label & Font Customization Controls */}
                <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-700/60 space-y-2.5">
                  <span className="text-[9.5px] font-bold text-emerald-400 uppercase tracking-wider block border-b border-slate-800 pb-1">
                    {lang === "ar" ? "تخصيص أبعاد وحجم الكتابة" : "Taille & Position des Textes"}
                  </span>
                  
                  {/* Vertex Font Size */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono">
                        {lang === "ar" ? "حجم خط النقط (القمم)" : "Police des Sommets"}
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">
                        {settings.vertexFontSize || 8.5}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={18}
                      step={0.5}
                      value={settings.vertexFontSize !== undefined ? settings.vertexFontSize : 8.5}
                      onChange={(e) => {
                        setSettings((prev) => ({ ...prev, vertexFontSize: parseFloat(e.target.value) }));
                      }}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Label Font Size */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono">
                        {lang === "ar" ? "حجم خط التسميات والتعليقات" : "Police des Étiquettes"}
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">
                        {settings.labelFontSize || 7.0}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={4}
                      max={18}
                      step={0.5}
                      value={settings.labelFontSize !== undefined ? settings.labelFontSize : 7.0}
                      onChange={(e) => {
                        setSettings((prev) => ({ ...prev, labelFontSize: parseFloat(e.target.value) }));
                      }}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>

                  {/* Label Offset */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-[10px] text-slate-400 uppercase font-mono">
                        {lang === "ar" ? "المسافة بين التسميات والضلع" : "Distance aux Limites"}
                      </label>
                      <span className="text-[10px] text-amber-400 font-mono font-bold">
                        {settings.labelOffset !== undefined ? settings.labelOffset : 7.0}m
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      step={0.5}
                      value={settings.labelOffset !== undefined ? settings.labelOffset : 7.0}
                      onChange={(e) => {
                        setSettings((prev) => ({ ...prev, labelOffset: parseFloat(e.target.value) }));
                      }}
                      className="w-full accent-emerald-500 h-1 bg-slate-800 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>

                {/* Custom Logo Upload */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] text-slate-400 uppercase tracking-wider block font-mono">
                      {lang === "ar" ? "تخصيص شعار الإدارة" : "Logo d'En-tête Personnalisé"}
                    </label>
                    {settings.logoUrl && (
                      <button
                        onClick={() => setSettings((prev) => ({ ...prev, logoUrl: "" }))}
                        className="text-[9px] text-amber-500 hover:text-amber-400 underline cursor-pointer"
                      >
                        {lang === "ar" ? "إعادة للشعار الافتراضي" : "Réinitialiser"}
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg text-[10px] px-2 py-1 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </aside>

          {/* ======================================================== */}
          {/* B. CENTER & RIGHT WORKSPACE PANELS */}
          {/* ======================================================== */}
          <section className="col-span-12 xl:col-span-9 p-6 flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-80px)] bg-slate-900">
            {/* State widgets and stats readout */}
            <div className="bg-slate-800/80 p-4 rounded-xl border border-emerald-500/20 backdrop-blur-xs flex flex-wrap gap-4 items-center justify-between shadow-md">
              <div className="flex items-center gap-3 font-sans">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-505/30 flex items-center justify-center text-emerald-400 font-bold">
                  {activeParcel.vertices.length}
                </div>
                <div>
                  <span className="text-[10px] text-stone-400 uppercase tracking-widest font-sans">
                    {lang === "ar" ? "المنطقة الفعالة النشطة" : "Propriété active"}
                  </span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <h3 className="text-sm font-bold text-slate-100">{activeParcel.name}</h3>
                  </div>
                </div>
              </div>

              {/* Surface Stats readout */}
              <div className="flex flex-wrap gap-6 text-xs font-mono">
                <div className="bg-slate-900/40 px-3.5 py-2 rounded-lg border border-slate-700/60 text-right">
                  <span className="text-[8px] text-stone-400 uppercase tracking-widest block mb-0.5 font-sans">
                    {lang === "ar" ? "المساحة الإجمالية (م²)" : "Surface Globale (m²)"}
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    {activeParcel.area.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} m²
                  </span>
                </div>
                <div className="bg-slate-900/40 px-3.5 py-2 rounded-lg border border-slate-700/60">
                  <span className="text-[8px] text-stone-400 uppercase tracking-widest block mb-0.5 font-sans">
                    {lang === "ar" ? "المساحة الفلاحية (هـ - آ - ج)" : "Contenance (ha - a - ca)"}
                  </span>
                  <span className="text-xs font-semibold text-amber-500 hover:text-amber-400 leading-tight">
                    {lang === "ar" ? formatAreaHac(activeParcel.area).ar : formatAreaHac(activeParcel.area).fr}
                  </span>
                </div>
                <div className="bg-slate-900/40 px-3.5 py-2 rounded-lg border border-slate-700/60 text-right">
                  <span className="text-[8px] text-stone-400 uppercase tracking-widest block mb-0.5 font-sans">
                    {lang === "ar" ? "محيط الحدود (م)" : "Périmètre Borne (m)"}
                  </span>
                  <span className="text-sm font-bold text-emerald-400">
                    {activeParcel.perimeter.toFixed(2)} m
                  </span>
                </div>
              </div>
            </div>

            {/* UPPER PANE: Professional Live Layout & Map Vector Canvas */}
            <div className="flex flex-col gap-2 bg-slate-800/40 p-3 rounded-2xl border border-slate-705/50 shadow-sm animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <span className="text-xs font-bold text-slate-100 flex items-center gap-2 uppercase tracking-wider font-sans">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  {lang === "ar" ? "أداة المعاينة الحية التفاعلية والتحرير الجغرافي ذو الدقة العالية" : "Outil de Diagnostic Map et Édition Vectorielle en Temps Réel"}
                </span>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                  {lang === "ar" ? "شاشة التشخيص والتحليل الهندسي" : "ÉCRAN DE DIAGNOSTIC ET CRÉATION CAO"}
                </span>
              </div>
              <p className="text-[10.5px] text-slate-400 px-1 leading-normal font-sans">
                {t.helpBody}
              </p>
              <div className="h-[650px] rounded-xl overflow-hidden shadow-2xl border border-slate-750 bg-slate-950 relative">
                <ParcelMap
                  parcel={activeParcel}
                  settings={settings}
                  selectedVertexId={selectedVertexId}
                  selectedSegmentId={selectedSegmentId}
                  onVertexSelect={setSelectedVertexId}
                  onSegmentSelect={setSelectedSegmentId}
                  onVertexUpdate={handleVertexUpdate}
                  onAddVertex={handleAddVertex}
                  onDeleteVertex={handleDeleteVertex}
                  isDrawingMode={isDrawingMode}
                  setDrawingMode={setDrawingMode}
                />
              </div>
            </div>

            {/* Low Pane: Dual Tables Layout Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {/* Table Left: Point details & X-Y Lambert Metris */}
              <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-xl flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-amber-400" />
                    <h3 className="text-[12px] font-bold text-slate-100 uppercase tracking-wider font-sans">
                      {t.verticesTableTitle}
                    </h3>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">{lang === "ar" ? "سحب وإفلات متزامن" : "Interactive Drag Sync"}</span>
                </div>

                <div className="overflow-x-auto max-h-[220px]">
                  <table className="w-full text-left bg-slate-900 p-1.5 rounded border border-slate-800/80 font-mono text-xs">
                    <thead>
                      <tr className="bg-slate-850/50 text-slate-400 border-b border-slate-700 font-sans">
                        <th className="px-3 py-2 text-center">{t.thVertexName}</th>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "إحداثي لومبرت X (م)" : "Raw X (m)"}</th>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "إحداثي لومبرت Y (م)" : "Raw Y (m)"}</th>
                        <th className="px-3 py-2 text-center">{lang === "ar" ? "حذف" : "Retirer"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {activeParcel.vertices.map((v) => {
                        const isHighlight = selectedVertexId === v.id;
                        return (
                          <tr
                            key={v.id}
                            className={`transition-colors whitespace-nowrap ${
                              isHighlight ? "bg-red-950/45 text-[#fff]" : "hover:bg-slate-800/30 text-slate-300"
                            }`}
                            onMouseEnter={() => setSelectedVertexId(v.id)}
                            onMouseLeave={() => setSelectedVertexId(null)}
                          >
                            <td className="px-3 py-2 text-center font-bold text-amber-400">{v.label}</td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={v.x}
                                onChange={(e) => handleVertexUpdate(v.id, parseFloat(e.target.value) || 0, v.y)}
                                className="bg-slate-950 border border-slate-700/50 hover:border-slate-600 focus:border-emerald-500 focus:outline-none w-full text-right px-2 py-1.5 rounded text-xs font-bold font-mono text-slate-200"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={v.y}
                                onChange={(e) => handleVertexUpdate(v.id, v.x, parseFloat(e.target.value) || 0)}
                                className="bg-slate-950 border border-slate-700/50 hover:border-slate-600 focus:border-emerald-500 focus:outline-none w-full text-right px-2 py-1.5 rounded text-xs font-bold font-mono text-slate-200"
                              />
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => handleDeleteVertex(v.id)}
                                className="text-slate-500 hover:text-red-400 p-1 rounded-md transition"
                                title={lang === "ar" ? "حذف نقطة الحدود هذه" : "Supprimer ce point de borne d'angle"}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Add vertex inline submit bar */}
                <form
                  onSubmit={handleAddVertexSubmit}
                  className="mt-2 grid grid-cols-12 gap-2 border-t border-slate-700/40 pt-3"
                >
                  <label className="col-span-12 text-[9px] text-slate-400 uppercase tracking-wider font-sans">
                    {lang === "ar" ? "إضافة نقطة زاوية جديدة للمضلع :" : "Ajouter Sommet aux Bornes existantes :"}
                  </label>
                  <div className="col-span-5">
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder={lang === "ar" ? "الإحداثي X" : "Coordonnée X"}
                      value={newVertexX}
                      onChange={(e) => setNewVertexX(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 w-full text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="col-span-5">
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder={lang === "ar" ? "الإحداثي Y" : "Coordonnée Y"}
                      value={newVertexY}
                      onChange={(e) => setNewVertexY(e.target.value)}
                      className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 w-full text-xs font-mono font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <button
                    type="submit"
                    className="col-span-2 bg-emerald-800 hover:bg-emerald-700 rounded text-white flex items-center justify-center transition"
                    title={t.addVertexBtn}
                  >
                    <PlusCircle className="w-4 h-4" />
                  </button>
                </form>
              </div>

              {/* Table Right: Segment ranges & Neighbor titles Alignment */}
              <div className="bg-slate-800/60 border border-slate-700/60 p-5 rounded-xl flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-slate-700 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-[12px] font-bold text-slate-100 uppercase tracking-wider font-sans">
                      {t.alignmentsTableTitle}
                    </h3>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 uppercase">{lang === "ar" ? "ملصقات الخريطة المطبوعة" : "Printed Map Labels"}</span>
                </div>

                <div className="overflow-y-auto max-h-[290px]">
                  <table className="w-full text-left bg-slate-900 p-1.5 rounded border border-slate-800/80 text-xs">
                    <thead>
                      <tr className="bg-slate-850/50 text-slate-400 border-b border-slate-700 leading-none font-sans">
                        <th className="px-3 py-2 font-mono">{t.thSegment}</th>
                        <th className="px-3 py-2 text-right font-mono">{lang === "ar" ? "المسافة (م)" : "Distance (m)"}</th>
                        <th className="px-3 py-2 font-sans text-right">{lang === "ar" ? "خطوط الحدود / المجاورون" : "Limite de Voisinage / Voisin"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50 text-xs text-slate-300">
                      {activeParcel.segments.map((s) => {
                        const isHighlight = selectedSegmentId === s.id;
                        return (
                          <tr
                            key={s.id}
                            className={`transition-colors whitespace-nowrap ${
                              isHighlight ? "bg-red-950/45 text-[#fff]" : "hover:bg-slate-800/30 text-slate-300"
                            }`}
                            onMouseEnter={() => setSelectedSegmentId(s.id)}
                            onMouseLeave={() => setSelectedSegmentId(null)}
                          >
                            <td className="px-3 py-2 font-bold font-mono text-amber-400 whitespace-nowrap">
                              {s.startLabel} - {s.endLabel}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold whitespace-nowrap">
                              {s.length.toFixed(2)} m
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={s.neighbor}
                                placeholder={t.placeholderVoisin}
                                onChange={(e) => handleNeighborUpdate(s.id, e.target.value)}
                                className="bg-slate-950 border border-slate-700/50 hover:border-slate-600 focus:border-emerald-500 focus:outline-none w-full text-left px-2 py-1.5 rounded text-xs font-semibold font-sans text-slate-200"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Technical warning block */}
                <div className="bg-emerald-950/30 rounded-lg p-3 ring-1 ring-emerald-500/10 text-emerald-400 text-[10px] leading-relaxed select-none font-sans">
                  {lang === "ar" ? (
                    <span>💡 <b>معلومة ذكية :</b> يمكنك أيضاً سحب وإزاحة أي نقطة حدود حمراء مباشرة على الخريطة ! وسيتم إعادة حساب المسافات والمساحة الإجمالية تلقائياً في نفس اللحظة.</span>
                  ) : (
                    <span>💡 <b>Astuce pro :</b> Vous pouvez également faire glisser n'importe quelle borne d'angle directement sur le canevas de carte ci-dessus ! Les distances et la surface se recalculeront instantanément.</span>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

