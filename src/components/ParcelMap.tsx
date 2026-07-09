import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Parcel, Vertex, Segment, DocumentSettings } from "../types";
import {
  planeToLatLng,
  latLngToPlane,
  getSegmentMidpoint,
  getSegmentAngle,
  getOutsidePoint,
  calculateCentroid,
} from "../utils/gisUtils";
import { SupportedCRS, CRS_DETAILS } from "../utils/projectionManager";
import {
  Layers,
  Globe,
  Grid,
  Maximize,
  Edit2,
  MousePointer,
  Trash2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Navigation,
  Ruler,
  MapPin,
  RotateCcw,
  Check,
  X,
} from "lucide-react";

interface ParcelMapProps {
  parcel: Parcel;
  settings: DocumentSettings;
  selectedVertexId: number | null;
  selectedSegmentId: number | null;
  onVertexSelect: (id: number | null) => void;
  onSegmentSelect: (id: number | null) => void;
  onVertexUpdate: (id: number, x: number, y: number) => void;
  onAddVertex: (x: number, y: number, insertAtIndex?: number) => void;
  onDeleteVertex?: (id: number) => void;
  isDrawingMode: boolean;
  setDrawingMode: (val: boolean) => void;
}

export const ParcelMap: React.FC<ParcelMapProps> = ({
  parcel,
  settings,
  selectedVertexId,
  selectedSegmentId,
  onVertexSelect,
  onSegmentSelect,
  onVertexUpdate,
  onAddVertex,
  onDeleteVertex,
  isDrawingMode,
  setDrawingMode,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const plusMarkerRef = useRef<L.Marker | null>(null);

  const [mapPreset, setMapPreset] = useState<"cad" | "satellite" | "google_sat" | "osm">((() => {
    const saved = localStorage.getItem("live_map_preset");
    if (saved === "cad" || saved === "satellite" || saved === "google_sat" || saved === "osm") {
      return saved as any;
    }
    return "cad";
  })());
  const [isDeleteMode, setDeleteMode] = useState<boolean>(false);
  
  // Go To & Measurement tool states
  const [isMeasuring, setIsMeasuring] = useState<boolean>(false);
  const [measurePoints, setMeasurePoints] = useState<L.LatLng[]>([]);
  const [tempMeasureMouse, setTempMeasureMouse] = useState<L.LatLng | null>(null);

  const [isGotoOpen, setIsGotoOpen] = useState<boolean>(false);
  const [gotoType, setGotoType] = useState<"lambert" | "wgs84">("lambert");
  const [gotoX, setGotoX] = useState<string>("");
  const [gotoY, setGotoY] = useState<string>("");
  const [gotoLat, setGotoLat] = useState<string>("");
  const [gotoLng, setGotoLng] = useState<string>("");
  const [gotoMarkerLatLng, setGotoMarkerLatLng] = useState<L.LatLng | null>(null);
  const [gotoError, setGotoError] = useState<string>("");

  const [mouseCoords, setMouseCoords] = useState<{
    lat: number;
    lng: number;
    x: number;
    y: number;
  } | null>(null);
  const [lang, setLang] = useState<"ar" | "fr">("ar");

  useEffect(() => {
    const saved = localStorage.getItem("cadastral_language");
    if (saved === "ar" || saved === "fr") {
      setLang(saved);
    }
    
    // Periodically poll/sync language changes if the user switches in real-time
    const interval = setInterval(() => {
      const current = localStorage.getItem("cadastral_language");
      if (current && (current === "ar" || current === "fr")) {
        setLang(prev => prev !== current ? (current as any) : prev);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const layersRef = useRef<{
    tileLayer: L.TileLayer | null;
    polygon: L.Polygon | null;
    vertexMarkers: L.Marker[];
    labelMarkers: L.Marker[];
    gridLines: L.Polyline[];
  }>({
    tileLayer: null,
    polygon: null,
    vertexMarkers: [],
    labelMarkers: [],
    gridLines: [],
  });

  const measureLayersRef = useRef<{
    polyline: L.Polyline | null;
    tempPolyline: L.Polyline | null;
    markers: L.Marker[];
  }>({
    polyline: null,
    tempPolyline: null,
    markers: [],
  });

  const gotoLayerRef = useRef<L.Marker | null>(null);

  const activeCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
    ? settings.projectionSystem
    : "EPSG:26191") as SupportedCRS;

  // Re-orient view to center on parcel
  const handleRecenter = () => {
    if (!mapRef.current || parcel.vertices.length === 0) return;
    const latLngs = parcel.vertices
      .map((v) => planeToLatLng(v.x, v.y, activeCRS))
      .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
    if (latLngs.length === 0) return;
    const bounds = L.latLngBounds(latLngs);
    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 19 });
    }
  };

  // Custom Zoom actions
  const handleZoomIn = () => {
    if (mapRef.current) {
      mapRef.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (mapRef.current) {
      mapRef.current.zoomOut();
    }
  };

  // Initialize Map without standard zoom buttons to prevent overlaps
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const initialCenter: [number, number] = [33.5731, -7.5898];
    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
    });

    mapRef.current = map;

    // Record map viewport so PrintSheetLayout can use it
    const handleMoveOrZoom = () => {
      const zoom = map.getZoom();
      const center = map.getCenter();
      localStorage.setItem("live_map_zoom", String(zoom));
      localStorage.setItem("live_map_center", JSON.stringify([center.lat, center.lng]));
    };

    map.on("moveend", handleMoveOrZoom);
    map.on("zoomend", handleMoveOrZoom);

    // Run once initially to capture defaults
    handleMoveOrZoom();

    return () => {
      map.off("moveend", handleMoveOrZoom);
      map.off("zoomend", handleMoveOrZoom);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update background tilelayer based on mapPreset selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (layersRef.current.tileLayer) {
      map.removeLayer(layersRef.current.tileLayer);
    }
    layersRef.current.tileLayer = null;

    localStorage.setItem("live_map_preset", mapPreset);

    if (mapPreset === "satellite") {
      // Reliable ESRI World Imagery URL
      layersRef.current.tileLayer = L.tileLayer(
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          maxZoom: 19,
          attribution: "Esri World Imagery",
        }
      ).addTo(map);
    } else if (mapPreset === "google_sat") {
      // Highly requested and ultra-robust static Google Imagery (Hybrid roads + satellite)
      layersRef.current.tileLayer = L.tileLayer(
        "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        {
          maxZoom: 20,
          attribution: "© Google Satellite Imagery",
        }
      ).addTo(map);
    } else if (mapPreset === "osm") {
      layersRef.current.tileLayer = L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution: "© OpenStreetMap contributors",
        }
      ).addTo(map);
    }
  }, [mapPreset]);

  // Handle map drawing click additions
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: L.LeafletMouseEvent) => {
      if (!isDrawingMode) return;
      const { x, y } = latLngToPlane(e.latlng.lat, e.latlng.lng, activeCRS);
      
      // Smart insertion index to keep the shape perfectly sequence-ordered without crossing
      let insertIndex = parcel.vertices.length;
      if (parcel.vertices.length >= 3) {
        let minDist = Infinity;
        for (let i = 0; i < parcel.vertices.length; i++) {
          const v1 = parcel.vertices[i];
          const v2 = parcel.vertices[(i + 1) % parcel.vertices.length];
          const dx = v2.x - v1.x;
          const dy = v2.y - v1.y;
          const lenSq = dx * dx + dy * dy;
          let t = 0;
          if (lenSq > 0) {
            t = ((x - v1.x) * dx + (y - v1.y) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
          }
          const projX = v1.x + t * dx;
          const projY = v1.y + t * dy;
          const dist = Math.hypot(x - projX, y - projY);
          if (dist < minDist) {
            minDist = dist;
            insertIndex = i + 1;
          }
        }
      }
      onAddVertex(x, y, insertIndex);
    };

    map.on("click", handleMapClick);
    return () => {
      map.off("click", handleMapClick);
    };
  }, [isDrawingMode, onAddVertex, activeCRS, parcel.vertices]);

  // Mutual exclusion of tools
  useEffect(() => {
    if (isMeasuring) {
      if (isDrawingMode) setDrawingMode(false);
      if (isDeleteMode) setDeleteMode(false);
    }
  }, [isMeasuring]);

  useEffect(() => {
    if (isDrawingMode || isDeleteMode) {
      setIsMeasuring(false);
    }
  }, [isDrawingMode, isDeleteMode]);

  // Distance Measurement event listeners
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isMeasuring) {
      setMeasurePoints([]);
      setTempMeasureMouse(null);
      return;
    }

    const handleMeasureClick = (e: L.LeafletMouseEvent) => {
      setMeasurePoints((prev) => [...prev, e.latlng]);
    };

    const handleMeasureMouseMove = (e: L.LeafletMouseEvent) => {
      setTempMeasureMouse(e.latlng);
    };

    map.on("click", handleMeasureClick);
    map.on("mousemove", handleMeasureMouseMove);

    return () => {
      map.off("click", handleMeasureClick);
      map.off("mousemove", handleMeasureMouseMove);
    };
  }, [isMeasuring]);

  // Distance Measurement Layer rendering on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (measureLayersRef.current.polyline) {
      map.removeLayer(measureLayersRef.current.polyline);
      measureLayersRef.current.polyline = null;
    }
    if (measureLayersRef.current.tempPolyline) {
      map.removeLayer(measureLayersRef.current.tempPolyline);
      measureLayersRef.current.tempPolyline = null;
    }
    measureLayersRef.current.markers.forEach((m) => map.removeLayer(m));
    measureLayersRef.current.markers = [];

    const validMeasurePoints = measurePoints.filter(
      (pt) => pt && typeof pt.lat === "number" && !isNaN(pt.lat) && typeof pt.lng === "number" && !isNaN(pt.lng)
    );

    if (!isMeasuring || validMeasurePoints.length === 0) return;

    const poly = L.polyline(validMeasurePoints, {
      color: "#ec4899",
      weight: 3.5,
      dashArray: "6, 12",
      lineJoin: "round",
    }).addTo(map);
    measureLayersRef.current.polyline = poly;

    if (
      tempMeasureMouse &&
      typeof tempMeasureMouse.lat === "number" &&
      !isNaN(tempMeasureMouse.lat) &&
      typeof tempMeasureMouse.lng === "number" &&
      !isNaN(tempMeasureMouse.lng)
    ) {
      const lastPt = validMeasurePoints[validMeasurePoints.length - 1];
      if (lastPt) {
        const tempPoly = L.polyline([lastPt, tempMeasureMouse], {
          color: "#f472b6",
          weight: 2,
          dashArray: "3, 6",
          opacity: 0.8,
        }).addTo(map);
        measureLayersRef.current.tempPolyline = tempPoly;
      }
    }

    let cumulative = 0;
    validMeasurePoints.forEach((pt, index) => {
      let labelText = "";
      if (index === 0) {
        labelText = lang === "ar" ? "البداية" : "Départ";
      } else {
        const segDist = map.distance(validMeasurePoints[index - 1], pt);
        cumulative += segDist;
        labelText = `+${segDist.toFixed(2)}m (${cumulative.toFixed(1)}m)`;
      }

      const marker = L.marker(pt, {
        icon: L.divIcon({
          className: "custom-measure-marker",
          html: `
            <div class="relative flex items-center justify-center">
              <div class="w-3.5 h-3.5 rounded-full bg-pink-500 border-2 border-white shadow-md flex items-center justify-center">
                <div class="w-1.5 h-1.5 bg-slate-950 rounded-full"></div>
              </div>
              <div class="absolute left-5 top-1/2 -translate-y-1/2 bg-slate-900/95 border border-pink-500 text-white font-mono text-[9.5px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-[999] select-none">
                ${labelText}
              </div>
            </div>
          `,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        }),
      }).addTo(map);

      measureLayersRef.current.markers.push(marker);
    });
  }, [isMeasuring, measurePoints, tempMeasureMouse, lang]);

  // Go To Coordinate marker rendering on the map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (gotoLayerRef.current) {
      map.removeLayer(gotoLayerRef.current);
      gotoLayerRef.current = null;
    }

    if (gotoMarkerLatLng) {
      const marker = L.marker(gotoMarkerLatLng, {
        icon: L.divIcon({
          className: "custom-goto-marker",
          html: `
            <div class="relative flex items-center justify-center">
              <div class="absolute w-10 h-10 rounded-full bg-amber-500/30 animate-ping"></div>
              <div class="absolute w-5 h-5 rounded-full bg-amber-400/40 animate-pulse"></div>
              <div class="w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow-2xl flex items-center justify-center z-10">
                <div class="w-1.5 h-1.5 bg-slate-950 rounded-full"></div>
              </div>
              <div class="absolute top-5 bg-slate-900/95 border border-amber-500 text-amber-400 font-mono text-[9px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap z-[1000] select-none flex items-center gap-1">
                <span class="w-1 h-1 rounded-full bg-amber-400"></span>
                <span>${lang === "ar" ? "الموقع المستهدف" : "Cible"}</span>
              </div>
            </div>
          `,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).addTo(map);

      gotoLayerRef.current = marker;
    }
  }, [gotoMarkerLatLng, lang]);

  // Hover Snapping: Shows a "+" button when the cursor is near any polygon segment
  useEffect(() => {
    const map = mapRef.current;
    if (!map || parcel.vertices.length < 3) return;

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      // Actively show ONLY when in drawing mode (rallies/snapping only when isDrawingMode is true and isDeleteMode is false)
      if (!isDrawingMode || isDeleteMode) {
        if (plusMarkerRef.current) {
          map.removeLayer(plusMarkerRef.current);
          plusMarkerRef.current = null;
        }
        return;
      }

      const mousePt = e.containerPoint;

      // Smart check: If mouse is close to an existing vertex (e.g., within 20px), dismiss "+" marker.
      // This allows the browser pointer to focus on the vertex marker and support dragging.
      let closeToVertex = false;
      for (const vertex of parcel.vertices) {
        const vLatLng = planeToLatLng(vertex.x, vertex.y, activeCRS);
        const vPt = map.latLngToContainerPoint(vLatLng);
        const distToVertex = Math.hypot(mousePt.x - vPt.x, mousePt.y - vPt.y);
        if (distToVertex < 18) {
          closeToVertex = true;
          break;
        }
      }

      if (closeToVertex) {
        if (plusMarkerRef.current) {
          map.removeLayer(plusMarkerRef.current);
          plusMarkerRef.current = null;
        }
        return;
      }

      let minDist = Infinity;
      let closestLatLng: L.LatLng | null = null;
      let closestInsertIndex = -1;

      for (let i = 0; i < parcel.vertices.length; i++) {
        const v1 = parcel.vertices[i];
        const v2 = parcel.vertices[(i + 1) % parcel.vertices.length];

        const ll1 = planeToLatLng(v1.x, v1.y, activeCRS);
        const ll2 = planeToLatLng(v2.x, v2.y, activeCRS);

        const pt1 = map.latLngToContainerPoint(ll1);
        const pt2 = map.latLngToContainerPoint(ll2);

        if (
          isNaN(pt1.x) || isNaN(pt1.y) || !isFinite(pt1.x) || !isFinite(pt1.y) ||
          isNaN(pt2.x) || isNaN(pt2.y) || !isFinite(pt2.x) || !isFinite(pt2.y)
        ) {
          continue;
        }

        const dx = pt2.x - pt1.x;
        const dy = pt2.y - pt1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0 || isNaN(lenSq)) continue;

        let t = ((mousePt.x - pt1.x) * dx + (mousePt.y - pt1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        if (isNaN(t)) continue;

        const projX = pt1.x + t * dx;
        const projY = pt1.y + t * dy;

        if (isNaN(projX) || isNaN(projY) || !isFinite(projX) || !isFinite(projY)) {
          continue;
        }

        const dist = Math.hypot(mousePt.x - projX, mousePt.y - projY);
        if (isNaN(dist)) continue;

        if (dist < minDist) {
          const latlng = map.containerPointToLatLng(L.point(projX, projY));
          if (latlng && !isNaN(latlng.lat) && !isNaN(latlng.lng)) {
            minDist = dist;
            closestLatLng = latlng;
            closestInsertIndex = i + 1; // Insert right after the first vertex of the segment
          }
        }
      }

      // 16px snapping distance threshold for a highly precise yet generous feel
      if (minDist < 16 && closestLatLng) {
        const savedLatLng = closestLatLng;
        const savedIndex = closestInsertIndex;

        if (!plusMarkerRef.current) {
          const plusIcon = L.divIcon({
            html: `
              <div class="relative flex items-center justify-center">
                <span class="absolute inline-flex h-7 w-7 animate-ping rounded-full bg-emerald-400 opacity-30"></span>
                <div class="w-6 h-6 rounded-full bg-emerald-500/30 hover:bg-emerald-600/50 border border-white/60 shadow-xl flex items-center justify-center text-white font-black text-sm cursor-pointer select-none transition-transform duration-100 hover:scale-125">
                  +
                </div>
              </div>
            `,
            className: "custom-plus-marker",
            iconSize: [24, 24],
            iconAnchor: [12, 12],
          });

          // Create the marker and register mousedown handler immediately
          const newMarker = L.marker(savedLatLng, { icon: plusIcon }).addTo(map);
          plusMarkerRef.current = newMarker;

          newMarker.on("mousedown", (clickEvent) => {
            L.DomEvent.stopPropagation(clickEvent);
            const plane = latLngToPlane(savedLatLng.lat, savedLatLng.lng, activeCRS);
            onAddVertex(plane.x, plane.y, savedIndex);

            if (plusMarkerRef.current) {
              map.removeLayer(plusMarkerRef.current);
              plusMarkerRef.current = null;
            }
          });
        } else {
          plusMarkerRef.current.setLatLng(savedLatLng);
          plusMarkerRef.current.off("mousedown");
          plusMarkerRef.current.on("mousedown", (clickEvent) => {
            L.DomEvent.stopPropagation(clickEvent);
            const plane = latLngToPlane(savedLatLng.lat, savedLatLng.lng, activeCRS);
            onAddVertex(plane.x, plane.y, savedIndex);

            if (plusMarkerRef.current) {
              map.removeLayer(plusMarkerRef.current);
              plusMarkerRef.current = null;
            }
          });
        }
      } else {
        if (plusMarkerRef.current) {
          map.removeLayer(plusMarkerRef.current);
          plusMarkerRef.current = null;
        }
      }
    };

    const handleMouseLeave = () => {
      if (plusMarkerRef.current) {
        map.removeLayer(plusMarkerRef.current);
        plusMarkerRef.current = null;
      }
    };

    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseLeave);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseout", handleMouseLeave);
      if (plusMarkerRef.current) {
        map.removeLayer(plusMarkerRef.current);
        plusMarkerRef.current = null;
      }
    };
  }, [parcel, isDrawingMode, isDeleteMode, activeCRS, onAddVertex]);

  // Main layers refresh on state changes (parcel, annotations configuration, selection states)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || parcel.vertices.length === 0) return;

    const centroidPlane = calculateCentroid(parcel.vertices);

    // 1. Clear previous overlays
    if (layersRef.current.polygon) {
      map.removeLayer(layersRef.current.polygon);
    }
    layersRef.current.vertexMarkers.forEach((m) => map.removeLayer(m));
    layersRef.current.labelMarkers.forEach((m) => map.removeLayer(m));
    layersRef.current.gridLines.forEach((gl) => map.removeLayer(gl));

    layersRef.current.vertexMarkers = [];
    layersRef.current.labelMarkers = [];
    layersRef.current.gridLines = [];

    // 2. Render backing technical grid lines if preset is "CAD Mode"
    if (mapPreset === "cad") {
      const latLngsGrid = parcel.vertices
        .map((v) => planeToLatLng(v.x, v.y, activeCRS))
        .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
      
      if (latLngsGrid.length > 0) {
        const bounds = L.latLngBounds(latLngsGrid);
        if (bounds.isValid()) {
          const paddedBounds = bounds.pad(0.5);

          const safeGridInterval = Math.max(0.1, Number(settings.gridInterval) || 50);
          const intervalDeg = safeGridInterval / 111120;
          const gridItems: L.Polyline[] = [];

          // Make lines rounded to standard intervals
          const startLat = Math.floor(paddedBounds.getSouth() / intervalDeg) * intervalDeg;
          const endLat = Math.ceil(paddedBounds.getNorth() / intervalDeg) * intervalDeg;
          const startLng = Math.floor(paddedBounds.getWest() / intervalDeg) * intervalDeg;
          const endLng = Math.ceil(paddedBounds.getEast() / intervalDeg) * intervalDeg;

          for (let lat = startLat; lat <= endLat; lat += intervalDeg) {
            const pl = L.polyline([[lat, startLng], [lat, endLng]], {
              color: "#e2e8f0",
              weight: 0.8,
              dashArray: "4, 4",
            }).addTo(map);
            gridItems.push(pl);
          }
          for (let lng = startLng; lng <= endLng; lng += intervalDeg) {
            const pl = L.polyline([[startLat, lng], [endLat, lng]], {
              color: "#e2e8f0",
              weight: 0.8,
              dashArray: "4, 4",
            }).addTo(map);
            gridItems.push(pl);
          }
          layersRef.current.gridLines = gridItems;
        }
      }
    }

    // 3. Render Parcel Polygon boundary with high contrast based on selected background preset
    const latLngs = parcel.vertices
      .map((v) => planeToLatLng(v.x, v.y, activeCRS))
      .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
    
    if (latLngs.length === 0) return;

    const isSatellite = mapPreset === "satellite" || mapPreset === "google_sat";
    const isCad = mapPreset === "cad";

    const poly = L.polygon(latLngs, {
      color: isSatellite ? "#f59e0b" : "#ef4444", // High-contrast amber for satellite layers, Red for CAD/Map
      weight: 3.5,
      fillColor: isCad ? "#fef2f2" : isSatellite ? "#f59e0b" : "#3b82f6",
      fillOpacity: isCad ? 0.85 : isSatellite ? 0.12 : 0.2,
    }).addTo(map);
    layersRef.current.polygon = poly;

    // 4. Render Vertex Circles (Interactive with high frame-rate dragging or immediate click-to-delete)
    parcel.vertices.forEach((v) => {
      const latlng = planeToLatLng(v.x, v.y, activeCRS);
      const isSelected = selectedVertexId === v.id;

      const dotColor = isSelected
        ? "bg-amber-500/30 scale-125 ring-2 ring-amber-400/40"
        : isDeleteMode
          ? "bg-rose-600/30 hover:bg-rose-700/50 hover:scale-135 ring-2 ring-rose-500/40"
          : isSatellite
            ? "bg-emerald-400/30 ring-2 ring-emerald-400/40"
            : "bg-blue-600/30 ring-2 ring-blue-500/40";

      // Calculate outward normal vector from centroid to the vertex to offset the label beautifully
      const dxVal = v.x - centroidPlane.x;
      const dyVal = v.y - centroidPlane.y;
      const lengthVal = Math.sqrt(dxVal * dxVal + dyVal * dyVal);
      const nx = lengthVal > 0 ? dxVal / lengthVal : 1;
      const ny = lengthVal > 0 ? dyVal / lengthVal : 0;

      const tx = (nx * 16).toFixed(1);
      const ty = (-ny * 16).toFixed(1); // Standard web screen is inverted compared to cartesian/UTM plane Y

      // Custom polished CAD precision HTML target marker (no bulky background, offset labels)
      // The background of the dot and label has 70% transparency (30% opacity) for crystal clear viewing of aerial maps
      const vertexIcon = L.divIcon({
        html: `
          <div class="relative flex items-center justify-center select-none" style="pointer-events: none;">
            <!-- Precision Target Dot with 70% transparency (30% opacity) -->
            <div id="vertex-dot-${v.id}" class="w-3.5 h-3.5 rounded-full ${dotColor} border border-white/60 shadow-md flex items-center justify-center transition-all duration-150">
              <div class="w-1.5 h-1.5 rounded-full bg-white"></div>
            </div>
            <!-- Offset Label without background, plain high contrast text with a professional CAD text-shadow/halo -->
            <div 
              style="transform: translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)); z-index: 100; text-shadow: -1.5px -1.5px 0 #000, 1.5px -1.5px 0 #000, -1.5px 1.5px 0 #000, 1.5px 1.5px 0 #000, 0px 2px 3px rgba(0,0,0,0.95); font-size: ${settings.vertexFontSize !== undefined ? settings.vertexFontSize * 1.2 : 10.5}px;"
              class="absolute top-1/2 left-1/2 font-black font-mono text-yellow-300 whitespace-nowrap pointer-events-none tracking-wide"
            >
              ${isDeleteMode ? `✕ ${v.label}` : v.label}
            </div>
          </div>
        `,
        className: "custom-vertex-marker",
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const mk = L.marker(latlng, {
        icon: vertexIcon,
        draggable: !isDeleteMode, // Disable drag during deletion to make clicking instantaneous
      }).addTo(map);

      // Decoupled Dragging implementation: Update the vector polygon on-screen in real-time
      mk.on("drag", (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();

        const idx = parcel.vertices.findIndex((vertex) => vertex.id === v.id);
        if (idx !== -1 && layersRef.current.polygon) {
          const polyLatLngs = layersRef.current.polygon.getLatLngs() as L.LatLng[];
          let flatLatLngs: L.LatLng[] = [];
          if (Array.isArray(polyLatLngs[0])) {
            flatLatLngs = polyLatLngs[0] as L.LatLng[];
          } else {
            flatLatLngs = polyLatLngs;
          }
          flatLatLngs[idx] = pos;
          layersRef.current.polygon.setLatLngs(flatLatLngs);
        }
      });

      // Commit the updated values on dragend
      mk.on("dragend", (e: L.LeafletEvent) => {
        const marker = e.target as L.Marker;
        const pos = marker.getLatLng();
        const plane = latLngToPlane(pos.lat, pos.lng, activeCRS);
        onVertexUpdate(v.id, plane.x, plane.y);
      });

      mk.on("mousedown", (e) => {
        L.DomEvent.stopPropagation(e);
        if (isDeleteMode && onDeleteVertex) {
          onDeleteVertex(v.id);
        } else {
          onVertexSelect(v.id);
        }
      });

      // Show plane coordinates on tooltip inside standard modes
      if (!isDeleteMode) {
        mk.bindTooltip(`<b>${v.label}</b><br/>X: ${v.x.toFixed(2)}<br/>Y: ${v.y.toFixed(2)}`, {
          direction: "top",
          offset: [0, -10],
        });
      } else {
        mk.bindTooltip(`<b>حذف النقطة ${v.label}</b>`, {
          direction: "top",
          offset: [0, -10],
          className: "bg-rose-950 text-white text-[10px] border border-rose-500 rounded px-1.5 py-0.5"
        });
      }

      layersRef.current.vertexMarkers.push(mk);
    });

    // 5. Render rotated boundary labels (lengths & neighbors)
    const showLengths =
      settings.mapLabels === "Longueurs" || settings.mapLabels === "Longueurs + Voisins";
    const showNeighbors =
      settings.mapLabels === "Voisins" || settings.mapLabels === "Longueurs + Voisins";

    if (showLengths || showNeighbors) {
      parcel.segments.forEach((seg) => {
        const midPointCoords = getSegmentMidpoint(seg.startVertex, seg.endVertex);
        const mapOffset = settings.labelOffset !== undefined ? (settings.labelOffset * 6 / 7) : 6;
        const outsidePt = getOutsidePoint(centroidPlane, seg.startVertex, seg.endVertex, mapOffset);
        const latlngLabel = planeToLatLng(outsidePt.x, outsidePt.y, activeCRS);
        const angle = getSegmentAngle(seg.startVertex, seg.endVertex);
        const isSelected = selectedSegmentId === seg.id;

        const lengthSize = settings.labelFontSize !== undefined ? settings.labelFontSize * 1.4 : 10;
        const neighborSize = settings.labelFontSize !== undefined ? settings.labelFontSize * 1.25 : 9;

        const labelHtml = `
          <div class="flex flex-col items-center justify-center cursor-pointer group transition-transform ${
            isSelected ? "scale-110" : ""
          }" style="transform: rotate(${-angle}deg)">
            ${
              showLengths
                ? `<span style="font-size: ${lengthSize}px" class="px-1.5 py-0.5 rounded font-bold shadow-sm select-none border whitespace-nowrap mb-0.5 ${
                    isSelected
                      ? "bg-amber-500 text-white border-amber-600 scale-110"
                      : "bg-blue-50 text-blue-700 border-blue-200 group-hover:bg-blue-100"
                  }">
                    ${seg.length.toFixed(2)} m
                  </span>`
                : ""
            }
            ${
              showNeighbors && seg.neighbor
                ? `<span style="font-size: ${neighborSize}px" class="px-2 py-0.5 rounded font-medium shadow-sm select-none max-w-[100px] truncate block text-center ${
                    isSelected
                      ? "bg-red-600 text-white font-bold"
                      : "bg-stone-800 text-white font-normal opacity-90 group-hover:opacity-100"
                  }" title="${seg.neighbor.replace(/"/g, '&quot;')}">
                    ${seg.neighbor}
                  </span>`
                : ""
            }
          </div>
        `;

        const labelIcon = L.divIcon({
          html: labelHtml,
          className: "custom-rotated-label",
          iconSize: [120, 40],
          iconAnchor: [60, 20],
        });

        const labelMarker = L.marker(latlngLabel, { icon: labelIcon }).addTo(map);
        labelMarker.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          onSegmentSelect(seg.id);
        });

        layersRef.current.labelMarkers.push(labelMarker);
      });
    }

    // Auto fit boundaries on initial load or when parcel changes so they synchronize perfectly
    const lastParcelId = (map as any)._lastParcelId;
    if (lastParcelId !== parcel.id) {
      map.invalidateSize(); // Forces containment refresh to prevent faulty sizes on layout switches
      const latLngsList = parcel.vertices
        .map((v) => planeToLatLng(v.x, v.y, activeCRS))
        .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));
      if (latLngsList.length > 0) {
        const boundsList = L.latLngBounds(latLngsList);
        if (boundsList.isValid()) {
          map.flyToBounds(boundsList, { padding: [50, 50], duration: 0.8 });
          (map as any)._lastParcelId = parcel.id;
        }
      }
    }
  }, [parcel, settings, selectedVertexId, selectedSegmentId, mapPreset, activeCRS, isDeleteMode]);

  // Active mouse coordinates tracker over Leaflet footprint
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMouseMoveCoords = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      const plane = latLngToPlane(lat, lng, activeCRS);
      setMouseCoords({
        lat,
        lng,
        x: plane.x,
        y: plane.y,
      });
    };

    const handleMouseOutCoords = () => {
      setMouseCoords(null);
    };

    map.on("mousemove", handleMouseMoveCoords);
    map.on("mouseout", handleMouseOutCoords);

    return () => {
      map.off("mousemove", handleMouseMoveCoords);
      map.off("mouseout", handleMouseOutCoords);
    };
  }, [activeCRS, mapPreset]);

  const getCumulativeDistance = () => {
    if (!mapRef.current || measurePoints.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < measurePoints.length; i++) {
      total += mapRef.current.distance(measurePoints[i - 1], measurePoints[i]);
    }
    return total;
  };

  const handleExecuteGoto = () => {
    setGotoError("");
    const map = mapRef.current;
    if (!map) return;

    if (gotoType === "lambert") {
      const xVal = parseFloat(gotoX);
      const yVal = parseFloat(gotoY);
      if (isNaN(xVal) || isNaN(yVal)) {
        setGotoError(lang === "ar" ? "الرجاء إدخال أرقام صحيحة لـ X و Y" : "Veuillez entrer des coordonnées X et Y valides");
        return;
      }

      try {
        const [lat, lng] = planeToLatLng(xVal, yVal, activeCRS);
        if (isNaN(lat) || isNaN(lng) || !isFinite(lat) || !isFinite(lng)) {
          setGotoError(lang === "ar" ? "فشل تحويل الإحداثيات المسطحة" : "Échec de conversion des coordonnées Lambert");
          return;
        }
        const latlng = L.latLng(lat, lng);
        setGotoMarkerLatLng(latlng);
        map.flyTo(latlng, 19, { animate: true, duration: 1.5 });
      } catch (err) {
        setGotoError(lang === "ar" ? "خطأ في معالجة الإحداثيات" : "Erreur de traitement des coordonnées");
      }
    } else {
      const latVal = parseFloat(gotoLat);
      const lngVal = parseFloat(gotoLng);
      if (isNaN(latVal) || isNaN(lngVal)) {
        setGotoError(lang === "ar" ? "الرجاء إدخال قيم صحيحة لخط العرض والطول" : "Veuillez saisir des coordonnées géographiques valides");
        return;
      }
      if (latVal < -90 || latVal > 90 || lngVal < -180 || lngVal > 180) {
        setGotoError(lang === "ar" ? "قيم خطوط العرض والطول خارج النطاق المسموح به" : "Valeurs de latitude/longitude hors limites (-90 à 90 / -180 à 180)");
        return;
      }

      const latlng = L.latLng(latVal, lngVal);
      setGotoMarkerLatLng(latlng);
      map.flyTo(latlng, 19, { animate: true, duration: 1.5 });
    }
  };

  const handleUndoMeasure = () => {
    if (measurePoints.length > 0) {
      setMeasurePoints((prev) => prev.slice(0, -1));
    }
  };

  const handleClearMeasure = () => {
    setMeasurePoints([]);
    setTempMeasureMouse(null);
  };

  const crsDetails = CRS_DETAILS[activeCRS] || { name: activeCRS, arabic: activeCRS };
  const crsLabel = lang === "ar" ? crsDetails.arabic : crsDetails.name;

  return (
    <div className="relative w-full h-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-inner group flex flex-col">
      <style>{`
        .leaflet-container {
          background: ${mapPreset === "cad" ? "#ffffff" : "#0d1117"} !important;
          cursor: ${
            isDrawingMode
              ? "crosshair !important"
              : isDeleteMode
                ? "not-allowed !important"
                : "grab"
          } !important;
        }
        .custom-vertex-marker {
          overflow: visible !important;
        }
        .custom-rotated-label {
          overflow: visible !important;
        }
      `}</style>

      {/* Map Element */}
      <div ref={mapContainerRef} className="w-full flex-1 min-h-0 z-10" />

      {/* Unified Professional Dark UI CAD/GIS Control Dashboard (Floating Top-Left) */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-3 max-w-[145px] pointer-events-none">
        
        {/* Navigation & CAD controls panel */}
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1.5 pointer-events-auto">
          {/* Zoom In / Zoom Out custom buttons */}
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={handleZoomIn}
              className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg flex items-center justify-center transition hover:scale-105 active:scale-95"
              title="Agrandir (تقريب الخريطة)"
            >
              <ZoomIn className="w-3.5 h-3.5 text-amber-400" />
            </button>
            <button
              onClick={handleZoomOut}
              className="bg-slate-800 hover:bg-slate-700 text-white p-2 rounded-lg flex items-center justify-center transition hover:scale-105 active:scale-95"
              title="Rétrécir (إبعاد الخريطة)"
            >
              <ZoomOut className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>

          <hr className="border-slate-800 my-0.5" />

          {/* Recenter / Focus trigger */}
          <button
            onClick={handleRecenter}
            className="bg-slate-800 hover:bg-slate-700 text-white p-2 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition hover:scale-105 active:scale-95 text-[10px] font-bold"
            title="Centrer sur la parcelle (تركيز العرض على العقار)"
          >
            <Maximize className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>تركيز</span>
          </button>

          {/* Freehand CAD Drawing Mode Toggle */}
          <button
            onClick={() => {
              setDrawingMode(!isDrawingMode);
              if (isDeleteMode) setDeleteMode(false); // Mutually exclusive
            }}
            className={`p-2 rounded-lg flex items-center justify-center gap-1.5 transition text-[10px] font-bold ${
              isDrawingMode
                ? "bg-amber-600 border border-amber-400 text-white animate-pulse"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
            }`}
            title="وضع رسم ورسم إضافي حر"
          >
            {isDrawingMode ? (
              <MousePointer className="w-3.5 h-3.5 text-white animate-spin" />
            ) : (
              <Edit2 className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>رسم حر</span>
          </button>

          {/* Delete Mode Toggle (New feature) */}
          <button
            onClick={() => {
              setDeleteMode(!isDeleteMode);
              if (isDrawingMode) setDrawingMode(false); // Mutually exclusive
            }}
            className={`p-2 rounded-lg flex items-center justify-center gap-1.5 transition text-[10px] font-bold ${
              isDeleteMode
                ? "bg-rose-600 text-white border border-rose-400"
                : "bg-slate-800 hover:bg-slate-700 text-slate-200"
            }`}
            title="تفعيل وضع مسح وحذف النقط"
          >
            <Trash2 className={`w-3.5 h-3.5 ${isDeleteMode ? "text-white" : "text-rose-400"}`} />
            <span>مسح النقط</span>
          </button>
        </div>

        {/* Satellite & Streetmap Base Layer select panel */}
        <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-1.5 shadow-2xl flex flex-col gap-1 pointer-events-auto">
          <span className="text-[7.5px] font-mono text-slate-400 font-bold tracking-wider px-1 mb-1 block">
            FONDS DE CARTE
          </span>

          <button
            onClick={() => setMapPreset("cad")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "cad"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title="Plan Cadastral (شبكة كاد)"
          >
            <Grid className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>شبكة CAD</span>
          </button>

          <button
            onClick={() => setMapPreset("satellite")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "satellite"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title="Satellite ESRI (صورة جوية إيسري)"
          >
            <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>SAT Esri</span>
          </button>

          <button
            onClick={() => setMapPreset("google_sat")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "google_sat"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title="Google Satellite Hybrid (صور خرائط جوجل مجسمة مدمجة)"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span>SAT Google</span>
          </button>

          <button
            onClick={() => setMapPreset("osm")}
            className={`px-2 py-1.5 rounded-lg text-[9px] font-bold tracking-wider transition flex items-center gap-1.5 focus:outline-none ${
              mapPreset === "osm"
                ? "bg-amber-600 text-white font-black"
                : "text-slate-300 hover:bg-slate-800"
            }`}
            title="OpenStreetMap Standard (خريطة شوارع)"
          >
            <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>خريطة OSM</span>
          </button>
        </div>
      </div>

      {/* Unified Professional Dark UI CAD/GIS Utilities Panel (Floating Top-Right) */}
      <div className="absolute top-4 right-4 z-20 flex flex-col items-end gap-3 max-w-[280px] pointer-events-none">
        {/* Toggle buttons row */}
        <div className="flex gap-2 pointer-events-auto">
          {/* Go To Button */}
          <button
            onClick={() => {
              setIsGotoOpen(!isGotoOpen);
              if (isMeasuring) {
                setIsMeasuring(false);
                setMeasurePoints([]);
                setTempMeasureMouse(null);
              }
            }}
            className={`p-2 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition hover:scale-105 active:scale-95 text-[10px] font-bold border ${
              isGotoOpen
                ? "bg-amber-600 border-amber-400 text-white shadow-lg shadow-amber-500/20"
                : "bg-slate-900/95 border-slate-700/80 text-slate-200 hover:bg-slate-800"
            }`}
            title={lang === "ar" ? "الانتقال إلى إحداثيات محددة" : "Aller aux coordonnées"}
          >
            <Navigation className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>{lang === "ar" ? "الانتقال السريع" : "Go To"}</span>
          </button>

          {/* Measure Button */}
          <button
            onClick={() => {
              setIsMeasuring(!isMeasuring);
              if (isGotoOpen) setIsGotoOpen(false);
            }}
            className={`p-2 py-2.5 rounded-lg flex items-center justify-center gap-1.5 transition hover:scale-105 active:scale-95 text-[10px] font-bold border ${
              isMeasuring
                ? "bg-pink-600 border-pink-400 text-white shadow-lg shadow-pink-500/20"
                : "bg-slate-900/95 border-slate-700/80 text-slate-200 hover:bg-slate-800"
            }`}
            title={lang === "ar" ? "قياس المسافات على الخريطة" : "Mesurer la distance"}
          >
            <Ruler className="w-3.5 h-3.5 text-pink-400 shrink-0" />
            <span>{lang === "ar" ? "قياس المسافة" : "Mesure"}</span>
          </button>
        </div>

        {/* Go To Panel details */}
        {isGotoOpen && (
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl space-y-2.5 w-[260px] pointer-events-auto text-slate-100 font-sans">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
              <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                {lang === "ar" ? "تحديد الموقع بالإحداثيات" : "Aller aux Coordonnées"}
              </span>
              <button 
                onClick={() => setIsGotoOpen(false)}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Coordinate system switcher */}
            <div className="grid grid-cols-2 gap-1 bg-slate-950 p-0.5 rounded-lg border border-slate-800/80">
              <button
                type="button"
                onClick={() => {
                  setGotoType("lambert");
                  setGotoError("");
                }}
                className={`py-1 text-[9px] font-bold rounded-md transition ${
                  gotoType === "lambert"
                    ? "bg-slate-850 text-amber-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                {lang === "ar" ? "لومبرت (X/Y)" : "Lambert (X/Y)"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setGotoType("wgs84");
                  setGotoError("");
                }}
                className={`py-1 text-[9px] font-bold rounded-md transition ${
                  gotoType === "wgs84"
                    ? "bg-slate-850 text-amber-400 shadow-sm"
                    : "text-slate-400 hover:text-slate-300"
                }`}
              >
                {lang === "ar" ? "جغرافي (Lat/Lng)" : "Géographique"}
              </button>
            </div>

            {/* Form Fields */}
            <div className="space-y-2 font-sans">
              {gotoType === "lambert" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] uppercase tracking-wider font-semibold text-slate-400 font-mono block mb-1">
                      X (Lambert m)
                    </label>
                    <input
                      type="text"
                      value={gotoX}
                      onChange={(e) => setGotoX(e.target.value)}
                      placeholder="362450"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] uppercase tracking-wider font-semibold text-slate-400 font-mono block mb-1">
                      Y (Lambert m)
                    </label>
                    <input
                      type="text"
                      value={gotoY}
                      onChange={(e) => setGotoY(e.target.value)}
                      placeholder="411830"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[8px] uppercase tracking-wider font-semibold text-slate-400 font-mono block mb-1">
                      Latitude (°)
                    </label>
                    <input
                      type="text"
                      value={gotoLat}
                      onChange={(e) => setGotoLat(e.target.value)}
                      placeholder="33.5731"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[8px] uppercase tracking-wider font-semibold text-slate-400 font-mono block mb-1">
                      Longitude (°)
                    </label>
                    <input
                      type="text"
                      value={gotoLng}
                      onChange={(e) => setGotoLng(e.target.value)}
                      placeholder="-7.5898"
                      className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-[10px] text-slate-100 focus:outline-none focus:border-amber-500 font-mono"
                    />
                  </div>
                </div>
              )}

              {gotoError && (
                <div className="bg-rose-950/85 border border-rose-800/80 text-[9px] text-rose-300 p-1.5 rounded font-medium">
                  {gotoError}
                </div>
              )}

              <div className="flex gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={handleExecuteGoto}
                  className="flex-1 bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-950 font-extrabold text-[10px] py-1.5 rounded transition shadow-md flex items-center justify-center gap-1"
                >
                  <Navigation className="w-3 h-3 fill-slate-950 text-slate-950" />
                  <span>{lang === "ar" ? "انتقال" : "Aller à"}</span>
                </button>

                {gotoMarkerLatLng && (
                  <button
                    type="button"
                    onClick={() => {
                      setGotoMarkerLatLng(null);
                      setGotoError("");
                    }}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-1.5 rounded transition"
                    title={lang === "ar" ? "مسح علامة التحديد" : "Effacer le repère"}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Distance Measurement details */}
        {isMeasuring && (
          <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3 shadow-2xl space-y-2.5 w-[260px] pointer-events-auto text-slate-100 font-sans">
            <div className="flex justify-between items-center border-b border-slate-800 pb-1.5">
              <span className="text-[10px] font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                <Ruler className="w-3.5 h-3.5" />
                {lang === "ar" ? "قياس المسافات" : "Mesure de Distance"}
              </span>
              <button 
                onClick={() => {
                  setIsMeasuring(false);
                  setMeasurePoints([]);
                  setTempMeasureMouse(null);
                }}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Instruction block */}
            <div className="bg-slate-950 border border-slate-800/80 p-2 rounded text-[9px] leading-relaxed text-slate-300">
              {measurePoints.length === 0 ? (
                <span className="animate-pulse block text-pink-300">
                  {lang === "ar"
                    ? "ℹ️ انقر على أي موقع في الخريطة لوضع أول نقطة قياس."
                    : "ℹ️ Cliquez sur la carte pour placer le premier point."}
                </span>
              ) : (
                <span>
                  {lang === "ar"
                    ? `استمر بالنقر لتمديد القياس. تم تحديد ${measurePoints.length} نقطة.`
                    : `Continuez à cliquer pour mesurer. ${measurePoints.length} points.`}
                </span>
              )}
            </div>

            {measurePoints.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center bg-slate-950/60 p-2 rounded border border-slate-800/50">
                  <span className="text-[9px] text-slate-400 uppercase font-bold tracking-wider">
                    {lang === "ar" ? "المسافة الإجمالية" : "Distance Totale"}
                  </span>
                  <span className="text-xs font-black text-pink-400 font-mono">
                    {getCumulativeDistance().toFixed(2)} m
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-1.5 font-sans">
                  <button
                    type="button"
                    onClick={handleUndoMeasure}
                    disabled={measurePoints.length === 0}
                    className="bg-slate-800 border border-slate-700 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-[9px] font-bold py-1.5 rounded transition flex items-center justify-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{lang === "ar" ? "تراجع" : "Annuler"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearMeasure}
                    disabled={measurePoints.length === 0}
                    className="bg-pink-950 hover:bg-pink-900 border border-pink-800 text-pink-200 text-[9px] font-bold py-1.5 rounded transition flex items-center justify-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>{lang === "ar" ? "مسح الكل" : "Effacer tout"}</span>
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setIsMeasuring(false);
                setMeasurePoints([]);
                setTempMeasureMouse(null);
              }}
              className="w-full bg-slate-850 hover:bg-slate-800 hover:text-white text-slate-200 text-[9px] font-bold py-1.5 rounded transition flex items-center justify-center gap-1 border border-slate-700/60"
            >
              <Check className="w-3 h-3 text-emerald-400" />
              <span>{lang === "ar" ? "إنهاء وإغلاق" : "Terminer"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating notifications for various states */}
      {isDrawingMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-amber-500 text-white border border-amber-400 shadow-xl px-4 py-2 rounded-full font-bold text-[11px] flex items-center gap-2 animate-bounce">
          <Edit2 className="w-3.5 h-3.5" />
          <span>وضع الرسم نشط: انقر في أي مكان على الخريطة لإضافة نقاط حدودية</span>
          <button
            onClick={() => setDrawingMode(false)}
            className="ml-2 bg-amber-700 hover:bg-amber-800 text-white font-black px-2 py-0.5 rounded text-[10px]"
          >
            إنهاء
          </button>
        </div>
      )}

      {isDeleteMode && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-rose-600 text-white border border-rose-500 shadow-xl px-4 py-2 rounded-full font-bold text-[11px] flex items-center gap-2 animate-bounce">
          <Trash2 className="w-3.5 h-3.5 text-white" />
          <span>وضع الحذف نشط: انقر مباشرة فوق أي رأس (Borne) على الخريطة لإزالته نهائياً</span>
          <button
            onClick={() => setDeleteMode(false)}
            className="ml-2 bg-rose-800 hover:bg-rose-900 text-white font-black px-2 py-0.5 rounded text-[10px]"
          >
            إلغاء المعاينة
          </button>
        </div>
      )}

      {/* Bottom-Right indicator showing the currently active view preset details */}
      <div className="absolute bottom-16 right-4 z-20 pointer-events-none bg-slate-900/85 border border-slate-700/50 backdrop-blur-md px-3 py-1.5 rounded-lg text-[9px] text-slate-300 font-bold select-none uppercase tracking-widest font-mono flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
        <span>
          {mapPreset === "cad"
            ? "Plan Lambert actif"
            : mapPreset === "satellite"
              ? "Esri Satellite actif"
              : mapPreset === "google_sat"
                ? "Google Hybrid actif"
                : "Plan OSM actif"}
        </span>
      </div>

      {/* High-Precision Mouse Coordinates Display Frame/Footer */}
      <div className="bg-slate-950 border-t border-slate-800 text-slate-300 px-4 py-2 flex flex-col md:flex-row items-center justify-between gap-3 select-none z-20 shrink-0 font-sans shadow-lg">
        {/* Left Side: Mouse location pointer & Coordinates */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px]">
          <div className="flex items-center gap-1.5 text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="font-bold text-slate-300">
              {lang === "ar" ? "إحداثيات مؤشر الماوس الحية:" : "Coordonnées de la souris :"}
            </span>
          </div>

          {mouseCoords ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 shadow-sm">
                <span className="text-emerald-400 font-bold text-[10px]">X (Lambert):</span>
                <span className="text-slate-100 font-black tracking-wider">{mouseCoords.x.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                <span className="text-[10px] text-slate-500">m</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 shadow-sm">
                <span className="text-emerald-400 font-bold text-[10px]">Y (Lambert):</span>
                <span className="text-slate-100 font-black tracking-wider">{mouseCoords.y.toLocaleString("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
                <span className="text-[10px] text-slate-500">m</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 shadow-sm text-indigo-300">
                <span className="text-indigo-400 font-bold text-[10px]">Lat:</span>
                <span className="font-semibold">{mouseCoords.lat.toFixed(7)}°</span>
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 shadow-sm text-indigo-300">
                <span className="text-indigo-400 font-bold text-[10px]">Lng:</span>
                <span className="font-semibold">{mouseCoords.lng.toFixed(7)}°</span>
              </div>
            </div>
          ) : (
            <div className="text-slate-400 font-sans italic text-[11px] select-none py-1 flex items-center gap-2">
              <MousePointer className="w-3.5 h-3.5 text-amber-500 animate-pulse shrink-0" />
              <span>
                {lang === "ar" 
                  ? "حرّك مؤشر الفأرة (الماوس) فوق الخريطة لعرض الإحداثيات الحية ولومبرت" 
                  : "Survolez l'image aérienne avec la souris pour afficher les coordonnées"}
              </span>
            </div>
          )}
        </div>

        {/* Right Side: Active Projection reference */}
        <div className="flex items-center gap-2 text-[10.5px] text-slate-400 font-mono self-end md:self-auto bg-slate-900 border border-slate-800 px-3 py-1 rounded shadow-inner select-none transition-all hover:border-slate-700">
          <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-spin-slow" style={{ animationDuration: "10s" }} />
          <span className="font-bold text-slate-300">
            {lang === "ar" ? "نظام الإسقاط:" : "Projection :"}
          </span>
          <span className="text-amber-300 font-semibold truncate max-w-[200px]" title={crsLabel}>
            {activeCRS} - {crsLabel}
          </span>
        </div>
      </div>
    </div>
  );
};
