import React, { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { Parcel, DocumentSettings } from "../types";
import {
  formatAreaHac,
  getSegmentAngle,
  getSegmentMidpoint,
  getOutsidePoint,
  calculateCentroid,
  planeToLatLng,
} from "../utils/gisUtils";
import { Compass, Printer, ArrowLeft, Layers, Download, Loader2, ExternalLink } from "lucide-react";
import { SupportedCRS } from "../utils/projectionManager";

// Helper functions for converting oklch/oklab/lab/lch colors to standard rgb/rgba format for html2canvas compatibility
function convertOklabToRgb(okL: number, okA: number, okB: number, alphaStr: string | null): string {
  // Convert OKLab to LMS
  const l_ = okL + 0.3963377774 * okA + 0.2158037573 * okB;
  const m_ = okL - 0.1055613458 * okA - 0.0638541728 * okB;
  const s_ = okL - 0.0894841775 * okA - 1.2914855480 * okB;

  // Convert LMS to linear RGB
  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const r_ = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const g_ = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const b_ = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3;

  // Linear RGB to sRGB
  const fn = (x: number) => {
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  };

  const r = Math.max(0, Math.min(255, Math.round(fn(r_) * 255)));
  const g = Math.max(0, Math.min(255, Math.round(fn(g_) * 255)));
  const b = Math.max(0, Math.min(255, Math.round(fn(b_) * 255)));

  if (alphaStr) {
    let alpha = parseFloat(alphaStr);
    if (alphaStr.includes("%")) {
      alpha = alpha / 100;
    }
    if (isNaN(alpha)) alpha = 1;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } else {
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function parseOklch(innerStr: string): string {
  const normalized = innerStr.trim().replace(/,/g, " ");
  const parts = normalized.split("/");
  const colorPart = parts[0].trim();
  const alphaPart = parts[1] ? parts[1].trim() : null;

  const colorCoords = colorPart.split(/\s+/).filter(Boolean);
  if (colorCoords.length < 3) return "#78716c";

  let l = parseFloat(colorCoords[0]);
  if (colorCoords[0].includes("%")) l = l / 100;
  let c = parseFloat(colorCoords[1]);
  if (colorCoords[1].includes("%")) c = (c / 100) * 0.4;
  let h = parseFloat(colorCoords[2]) || 0;

  return convertOklabToRgb(l, c * Math.cos(h * Math.PI / 180), c * Math.sin(h * Math.PI / 180), alphaPart);
}

function parseOklab(innerStr: string): string {
  const normalized = innerStr.trim().replace(/,/g, " ");
  const parts = normalized.split("/");
  const colorPart = parts[0].trim();
  const alphaPart = parts[1] ? parts[1].trim() : null;

  const colorCoords = colorPart.split(/\s+/).filter(Boolean);
  if (colorCoords.length < 3) return "#78716c";

  let l = parseFloat(colorCoords[0]);
  if (colorCoords[0].includes("%")) l = l / 100;
  let a = parseFloat(colorCoords[1]);
  if (colorCoords[1].includes("%")) a = (a / 100) * 0.4;
  let b = parseFloat(colorCoords[2]);
  if (colorCoords[2].includes("%")) b = (b / 100) * 0.4;

  return convertOklabToRgb(l, a, b, alphaPart);
}

function convertLabToRgb(labL: number, labA: number, labB: number, alphaStr: string | null): string {
  const y = (labL + 16) / 116;
  const x = labA / 500 + y;
  const z = y - labB / 200;

  const x3 = x * x * x;
  const y3 = y * y * y;
  const z3 = z * z * z;

  const xr = x3 > 0.008856 ? x3 : (116 * x - 16) / 903.3;
  const yr = y3 > 0.008856 ? y3 : (116 * y - 16) / 903.3;
  const zr = z3 > 0.008856 ? z3 : (116 * z - 16) / 903.3;

  const X = xr * 95.047;
  const Y = yr * 100.000;
  const Z = zr * 108.883;

  const x_ = X / 100;
  const y_ = Y / 100;
  const z_ = Z / 100;

  const r_ = x_ * 3.2406 + y_ * -1.5372 + z_ * -0.4986;
  const g_ = x_ * -0.9689 + y_ * 1.8758 + z_ * 0.0415;
  const b_ = x_ * 0.0557 + y_ * -0.2040 + z_ * 1.0570;

  const fn = (x: number) => {
    return x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  };

  const r = Math.max(0, Math.min(255, Math.round(fn(r_) * 255)));
  const g = Math.max(0, Math.min(255, Math.round(fn(g_) * 255)));
  const b = Math.max(0, Math.min(255, Math.round(fn(b_) * 255)));

  if (alphaStr) {
    let alpha = parseFloat(alphaStr);
    if (alphaStr.includes("%")) alpha = alpha / 100;
    if (isNaN(alpha)) alpha = 1;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  } else {
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function parseLab(innerStr: string): string {
  const normalized = innerStr.trim().replace(/,/g, " ");
  const parts = normalized.split("/");
  const colorPart = parts[0].trim();
  const alphaPart = parts[1] ? parts[1].trim() : null;

  const colorCoords = colorPart.split(/\s+/).filter(Boolean);
  if (colorCoords.length < 3) return "#78716c";

  let l = parseFloat(colorCoords[0]);
  if (colorCoords[0].includes("%")) l = l;
  let a = parseFloat(colorCoords[1]);
  if (colorCoords[1].includes("%")) a = (a / 100) * 125;
  let b = parseFloat(colorCoords[2]);
  if (colorCoords[2].includes("%")) b = (b / 100) * 125;

  return convertLabToRgb(l, a, b, alphaPart);
}

function parseLch(innerStr: string): string {
  const normalized = innerStr.trim().replace(/,/g, " ");
  const parts = normalized.split("/");
  const colorPart = parts[0].trim();
  const alphaPart = parts[1] ? parts[1].trim() : null;

  const colorCoords = colorPart.split(/\s+/).filter(Boolean);
  if (colorCoords.length < 3) return "#78716c";

  let l = parseFloat(colorCoords[0]);
  if (colorCoords[0].includes("%")) l = l;
  let c = parseFloat(colorCoords[1]);
  if (colorCoords[1].includes("%")) c = (c / 100) * 150;
  let h = parseFloat(colorCoords[2]) || 0;

  const a = c * Math.cos(h * Math.PI / 180);
  const b = c * Math.sin(h * Math.PI / 180);

  return convertLabToRgb(l, a, b, alphaPart);
}

function replaceModernColorsInCss(cssText: string): string {
  let result = cssText;
  const colorFunctions = [
    { name: "oklch", parser: parseOklch },
    { name: "oklab", parser: parseOklab },
    { name: "lch", parser: parseLch },
    { name: "lab", parser: parseLab }
  ];

  colorFunctions.forEach(({ name, parser }) => {
    let i = 0;
    let text = result;
    let newResult = "";
    while (i < text.length) {
      if (text.startsWith(`${name}(`, i)) {
        let parenCount = 1;
        let start = i;
        i += name.length + 1;
        while (i < text.length && parenCount > 0) {
          if (text[i] === "(") {
            parenCount++;
          } else if (text[i] === ")") {
            parenCount--;
          }
          i++;
        }
        const innerStr = text.substring(start + name.length + 1, i - 1);
        try {
          const replacement = parser(innerStr);
          newResult += replacement;
        } catch (e) {
          newResult += "#78716c";
        }
      } else {
        newResult += text[i];
        i++;
      }
    }
    result = newResult;
  });

  return result;
}

interface PrintSheetLayoutProps {
  parcel: Parcel;
  settings: DocumentSettings;
  onBackToEditor: () => void;
  initialLayoutType?: "type1" | "type2";
}

export const PrintSheetLayout: React.FC<PrintSheetLayoutProps> = ({
  parcel,
  settings,
  onBackToEditor,
  initialLayoutType = "type1",
}) => {
  const [printLayoutType, setPrintLayoutType] = useState<"type1" | "type2" | undefined>(initialLayoutType);

  useEffect(() => {
    if (initialLayoutType) {
      setPrintLayoutType(initialLayoutType);
    }
  }, [initialLayoutType]);
  
  // Local state overrides for editable grid interval & interactive scale
  const [localGridInterval, setLocalGridInterval] = useState(() => settings.gridInterval || 50);
  const [scaleMode, setScaleMode] = useState<"auto" | "100" | "250" | "500" | "1000" | "2500" | "5000" | "custom">(
    () => settings.scaleMode || "auto"
  );
  const [customScaleValue, setCustomScaleValue] = useState<number>(
    () => settings.customScale || 500
  );

  const centroid = calculateCentroid(parcel.vertices);
  const areaParts = formatAreaHac(parcel.area);
  const activeCRS = (settings.projectionSystem && settings.projectionSystem.startsWith("EPSG:")
    ? settings.projectionSystem
    : "EPSG:26191") as SupportedCRS;

  const xs = parcel.vertices.map((v) => v.x);
  const ys = parcel.vertices.map((v) => v.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const deltaX = maxX - minX || 1;
  const deltaY = maxY - minY || 1;
  const boundsMax = Math.max(deltaX, deltaY);

  // 1. Calculate numerical scale with a reference bounding box (resolves circular layout loop)
  const refWidth = 520;
  const refHeight = 374;
  const refScaleFactor = (Math.min(refWidth, refHeight) - 80) / boundsMax; // Increased safety margin from 24 to 80 to ensure standard auto scale is safer
  const refNumericScale = localGridInterval ? Math.round(100 / refScaleFactor) * 10 : 500;

  const getStandardScaleValue = (scale: number): number => {
    if (scale < 150) return 100;
    if (scale < 350) return 250;
    if (scale < 750) return 500;
    if (scale < 1500) return 1000;
    if (scale < 3500) return 2500;
    if (scale < 7500) return 5000;
    return Math.round(scale / 1000) * 1000 || 10000;
  };

  const finalNumericalScale = (() => {
    if (scaleMode === "auto") return getStandardScaleValue(refNumericScale);
    if (scaleMode === "custom") return customScaleValue;
    return parseInt(scaleMode, 10);
  })();

  // 2. Physical Page Size in mm based on scale and drawing projection size on paper
  const physicalWidthMm = Math.round((deltaX / finalNumericalScale) * 1000);
  const physicalHeightMm = Math.round((deltaY / finalNumericalScale) * 1000);

  // Page 2 width and height in mm
  const page2WidthMm = Math.max(297, physicalWidthMm + 180); // Expanded to reserve space for Coordinates Table AND give comfortable margin for neighbors labels
  const page2HeightMm = Math.max(210, physicalHeightMm + 70); // Expanded vertically to provide balanced visual breathing room around the parcel

  // Width and height details of the combined physical sheets
  const totalWidthMm = printLayoutType === "type2" ? page2WidthMm : 210 + page2WidthMm; // Page 1 Portrait (210) + Page 2 Variable (Landscape)
  const maxPageHeightMm = printLayoutType === "type2" ? page2HeightMm : Math.max(297, page2HeightMm); // Match tallest of standard A4 Portrait or dynamic Page 2

  // 3. Definitive Dynamic SVG Coordinates matching 100% of physical page aspect ratio
  const svgWidth = page2WidthMm * 2.5;
  const svgHeight = page2HeightMm * 2.5;

  // Dynamic calculations for the Coordinates Table columns on Page 2
  const totalPoints = parcel.vertices.length;
  // Estimate height available for the table: (svgHeight - borders/padding) divided by 2.5 to get mm
  const estTableHeightMm = page2HeightMm - 17.6;
  // Each table row takes around 4.0mm of height. Allow at least 10 rows per column.
  const maxRowsPerColumn = Math.max(10, Math.floor((estTableHeightMm - 14) / 4.0));
  const numColumns = Math.ceil(totalPoints / maxRowsPerColumn);
  const rowsPerColumn = Math.ceil(totalPoints / numColumns);

  const colWidthMm = 36;
  const gapWidthMm = 3;
  const paddingAndBordersMm = 8;
  const calculatedWidthMm = numColumns * colWidthMm + (numColumns - 1) * gapWidthMm + paddingAndBordersMm;
  const containerWidthMm = Math.max(80, calculatedWidthMm);

  // Perfectly symmetric inner boundaries to center the coordinate grid/grille harmoniously
  const mapLeft = 28;
  const mapRight = svgWidth - (containerWidthMm * 2.5 + 28); // Shuffled left dynamically to leave exact space for Coordinates Table
  const mapTop = printLayoutType === "type2" ? 45 : 16;
  const mapBottom = svgHeight - 28;
  
  const mapWidth = mapRight - mapLeft;
  const mapHeight = mapBottom - mapTop;

  // Exact physical scale: 1 meter = (2500 / S) SVG units.
  // This guarantees that measuring with a physical ruler on printed paper matches the selected scale.
  const scaleFactor = 2500 / (finalNumericalScale || 500);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const projectToSvg = (x: number, y: number) => {
    const px = mapLeft + (mapWidth / 2) + (x - centerX) * scaleFactor;
    const py = mapTop + (mapHeight / 2) - (y - centerY) * scaleFactor;
    return { x: px, y: py };
  };

  const svgVertices = parcel.vertices.map((v) => ({
    ...v,
    ...projectToSvg(v.x, v.y),
  }));

  // Coordinate reference grids using local interval override (safeguard against non-positive value inputs)
  const gridInterval = Math.max(0.1, Number(localGridInterval) || 50);
  const startGridX = Math.ceil(minX / gridInterval) * gridInterval;
  const endGridX = Math.floor(maxX / gridInterval) * gridInterval;
  const startGridY = Math.ceil(minY / gridInterval) * gridInterval;
  const endGridY = Math.floor(maxY / gridInterval) * gridInterval;

  const gridTicksX: number[] = [];
  for (let gx = startGridX - gridInterval; gx <= endGridX + gridInterval; gx += gridInterval) {
    gridTicksX.push(gx);
  }
  const gridTicksY: number[] = [];
  for (let gy = startGridY - gridInterval; gy <= endGridY + gridInterval; gy += gridInterval) {
    gridTicksY.push(gy);
  }

  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [showIframeModal, setShowIframeModal] = useState(false);
  const [showAerialArrow, setShowAerialArrow] = useState(true);

  // High-fidelity page fitting & snapshot control states
  const [isSnapshotting, setIsSnapshotting] = useState(false);
  const [zoomScale, setZoomScale] = useState(0.85);
  const [zoomMode, setZoomMode] = useState<"auto" | number>("auto");
  const containerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<L.Map | null>(null);

  // Initialize Page 1 Aerial Minimap with Parcel Outline and Project Pin Arrow
  useEffect(() => {
    // Ensure any existing map instance is cleaned up
    if (minimapRef.current) {
      minimapRef.current.remove();
      minimapRef.current = null;
    }

    const container = document.getElementById("page1-aerial-minimap");
    if (!container || parcel.vertices.length === 0) return;

    // Convert parcel vertices to LatLng array using activeCRS
    const latLngs = parcel.vertices
      .map((v) => planeToLatLng(v.x, v.y, activeCRS))
      .filter((ll) => Array.isArray(ll) && ll.length === 2 && typeof ll[0] === 'number' && !isNaN(ll[0]) && isFinite(ll[0]) && typeof ll[1] === 'number' && !isNaN(ll[1]) && isFinite(ll[1]));

    if (latLngs.length === 0) return;

    const bounds = L.latLngBounds(latLngs);
    
    // Default fallback center/zoom
    let center = bounds.isValid() ? bounds.getCenter() : L.latLng(33.5731, -7.5898);
    let zoom = 15;
    let fallbackFit = true;

    // Let's load the synchronized live map state from localStorage
    const savedPreset = localStorage.getItem("live_map_preset") || "cad";
    const savedZoomStr = localStorage.getItem("live_map_zoom");
    const savedCenterStr = localStorage.getItem("live_map_center");

    if (savedZoomStr && savedCenterStr) {
      try {
        const parsedCenter = JSON.parse(savedCenterStr);
        if (
          Array.isArray(parsedCenter) && 
          parsedCenter.length === 2 && 
          typeof parsedCenter[0] === "number" && 
          !isNaN(parsedCenter[0]) && 
          isFinite(parsedCenter[0]) &&
          typeof parsedCenter[1] === "number" && 
          !isNaN(parsedCenter[1]) && 
          isFinite(parsedCenter[1])
        ) {
          center = L.latLng(parsedCenter[0], parsedCenter[1]);
          zoom = parseInt(savedZoomStr, 10) || 15;
          fallbackFit = false;
        }
      } catch (_) {
        // Fall back to default auto fit
      }
    }

    // Initialize Leaflet map
    const map = L.map(container, {
      center: center,
      zoom: zoom,
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      dragging: false,
    });

    minimapRef.current = map;

    // Load correct background tile layer matching what was selected in the live workspace
    // Let's map "cad" -> no background layer, "osm" -> OSM, "satellite" -> Esri, "google_sat" -> Google Satellite
    let tileUrl = "";
    if (savedPreset === "satellite") {
      tileUrl = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    } else if (savedPreset === "osm") {
      tileUrl = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
    } else if (savedPreset === "google_sat") {
      tileUrl = "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
    }

    if (tileUrl) {
      L.tileLayer(tileUrl, {
        maxZoom: 20,
      }).addTo(map);
    }

    // Draw the Red Polygon for the parcel on top
    const isSatellite = savedPreset === "satellite" || savedPreset === "google_sat";
    L.polygon(latLngs, {
      color: isSatellite ? "#f59e0b" : "#ef4444",      // Bright amber for sat/hybrid, red otherwise
      weight: 3.5,
      fillColor: isSatellite ? "#f59e0b" : "#ef4444",
      fillOpacity: savedPreset === "cad" ? 0.08 : isSatellite ? 0.12 : 0.2,
    }).addTo(map);

    let adjustZoomTimer: any = null;

    if (fallbackFit && bounds.isValid()) {
      // Fit boundary then zoom out slightly (zoom scale-out to show neighborhood context)
      map.fitBounds(bounds, { padding: [15, 15] });
      
      adjustZoomTimer = setTimeout(() => {
        if (map) {
          const currentZoom = map.getZoom();
          // Zoom out 2.5 levels to give regional context
          map.setZoom(Math.max(12, currentZoom - 2.5));
        }
      }, 150);
    }

    return () => {
      if (adjustZoomTimer) {
        clearTimeout(adjustZoomTimer);
      }
      if (minimapRef.current) {
        minimapRef.current.remove();
        minimapRef.current = null;
      }
    };
  }, [parcel, activeCRS]);

  const mmToPx = 3.7795275590551;

  useEffect(() => {
    if (zoomMode !== "auto") {
      setZoomScale(zoomMode);
      return;
    }

    const handleResize = () => {
      if (containerRef.current) {
        const availableWidth = containerRef.current.clientWidth - 32; // comfortable margin
        const designWidth = totalWidthMm * mmToPx;
        const autoScale = availableWidth / designWidth;
        setZoomScale(Math.max(0.1, Math.min(1.2, autoScale)));
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [zoomMode, totalWidthMm, page2WidthMm]);

  const handlePrint = () => {
    // Detect if running inside an iframe (such as the AI Studio dev/pre workspace preview)
    const isInIframe = window.self !== window.top;
    if (isInIframe) {
      setShowIframeModal(true);
      return;
    }

    try {
      window.focus();
      window.print();
    } catch (e) {
      console.error("Browser Print Trigger Error:", e);
      alert("Si l'impression est bloquée par votre navigateur, veuillez ouvrir l'application dans un nouvel onglet standard pour débloquer l'accès complet.");
    }
  };

  const handleDownloadPDF = async () => {
    const compositeEl = document.getElementById("cadastral-combined-sheet");
    if (!compositeEl) return;

    try {
      setIsSnapshotting(true);
      setIsExporting(true);
      setExportError(null);
      // Wait to ensure transform scaling transitions are fully completed in the DOM
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Construct a single-page PDF capturing the exact side-by-side composite sheet layout
      const pdf = new jsPDF({
        orientation: totalWidthMm > maxPageHeightMm ? "landscape" : "portrait",
        unit: "mm",
        format: [totalWidthMm, maxPageHeightMm],
      });

      const cloneOptions = {
        scale: 2.2, // 2.2x scale is crisp, fast, and perfect for print without crashing
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        onclone: (clonedDoc: Document) => {
          try {
            // 1. Gather all CSS rules from same-origin stylesheets in the original document
            let combinedCss = "";
            const sheetsToRemoveFromClone: string[] = [];

            Array.from(document.styleSheets).forEach((sheet) => {
              try {
                if (sheet.cssRules) {
                  let sheetCss = "";
                  Array.from(sheet.cssRules).forEach((rule) => {
                    sheetCss += rule.cssText + "\n";
                  });
                  combinedCss += sheetCss;

                  if (sheet.ownerNode) {
                    const nodeType = sheet.ownerNode.nodeName.toLowerCase();
                    const nodeId = (sheet.ownerNode as HTMLElement).id;
                    
                    let selector = nodeType;
                    if (nodeId) {
                      selector += `#${nodeId}`;
                    } else if (nodeType === "link") {
                      const href = (sheet.ownerNode as HTMLLinkElement).getAttribute("href");
                      if (href) {
                        selector += `[href="${href}"]`;
                      }
                    }
                    
                    sheetsToRemoveFromClone.push(selector);
                  }
                }
              } catch (err) {
                // If CORS prevents reading cssRules, we skip removing it to let the iframe load it
                console.warn("CORS/Access error reading rules for sheet, skipping preprocessing:", sheet.href, err);
              }
            });

            // 2. Process combined CSS to replace oklch, oklab, lab, lch with compatible RGB values
            const cleanCss = replaceModernColorsInCss(combinedCss);

            // 3. Remove all existing style/link tags except Google fonts to guarantee no unparsed oklch remains
            clonedDoc.querySelectorAll("style, link[rel='stylesheet']").forEach((el) => {
              try {
                if (el.nodeName.toLowerCase() === "link") {
                  const href = (el as HTMLLinkElement).getAttribute("href") || "";
                  if (href.includes("fonts.googleapis.com") || href.includes("fonts.gstatic.com")) {
                    return; // Keep Google fonts
                  }
                }
                el.parentNode?.removeChild(el);
              } catch (e) {
                console.warn("Failed to remove style/link element from clone:", e);
              }
            });

            // Clean any inline style attributes in the cloned document that might contain oklch/oklab/lch/lab
            clonedDoc.querySelectorAll("[style]").forEach((el) => {
              try {
                const htmlEl = el as HTMLElement;
                const styleAttr = htmlEl.getAttribute("style");
                if (styleAttr && (
                  styleAttr.includes("oklch") || 
                  styleAttr.includes("oklab") || 
                  styleAttr.includes("lch") || 
                  styleAttr.includes("lab")
                )) {
                  htmlEl.setAttribute("style", replaceModernColorsInCss(styleAttr));
                }
              } catch (e) {
                // Ignore
              }
            });

            // 4. Inject clean unified CSS as a single <style> element containing resolved Colors
            const newStyle = clonedDoc.createElement("style");
            newStyle.textContent = cleanCss;
            clonedDoc.head.appendChild(newStyle);

            // 5. Automatically resolve and copy element-level computed colors from original to clone using getComputedStyle
            const clonedComposite = clonedDoc.getElementById("cadastral-combined-sheet");
            if (clonedComposite && compositeEl) {
              const copyComputedColours = (orig: HTMLElement, cln: HTMLElement) => {
                try {
                  const comp = window.getComputedStyle(orig);
                  const props = [
                    "color",
                    "background-color",
                    "border-color",
                    "border-top-color",
                    "border-right-color",
                    "border-bottom-color",
                    "border-left-color",
                    "outline-color",
                    "fill",
                    "stroke"
                  ];
                  props.forEach((p) => {
                    const originalVal = comp.getPropertyValue(p);
                    if (originalVal) {
                      const resolvedVal = replaceModernColorsInCss(originalVal);
                      cln.style.setProperty(p, resolvedVal);
                    }
                  });
                } catch (e) {
                  // Skip on error
                }

                const origCh = Array.from(orig.children) as HTMLElement[];
                const clnCh = Array.from(cln.children) as HTMLElement[];
                const minLen = Math.min(origCh.length, clnCh.length);
                for (let k = 0; k < minLen; k++) {
                  copyComputedColours(origCh[k], clnCh[k]);
                }
              };
              copyComputedColours(compositeEl, clonedComposite as HTMLElement);
            }

            // Adjust leaflet transform calculations to standard browser absolute positions during generation
            const leafletElements = clonedDoc.querySelectorAll(
              ".leaflet-tile-container, .leaflet-tile, .leaflet-zoom-animated, .leaflet-marker-icon, .leaflet-pane, .leaflet-map-container img"
            );

            const docView = clonedDoc.defaultView || window;

            leafletElements.forEach((el) => {
              try {
                const htmlEl = el as HTMLElement;
                const inlineTransform = htmlEl.style.transform;
                let transformStr = inlineTransform;

                if (!transformStr && docView) {
                  const computedStyle = docView.getComputedStyle(htmlEl);
                  transformStr = computedStyle ? computedStyle.transform : "";
                }

                if (transformStr && transformStr !== "none") {
                  const translate3dMatch = transformStr.match(/translate3d\(\s*(-?[0-9.]+)(?:px)?\s*,\s*(-?[0-9.]+)(?:px)?\s*,\s*(-?[0-9.]+)(?:px)?\s*\)/i);
                  const translateMatch = transformStr.match(/translate\(\s*(-?[0-9.]+)(?:px)?\s*,\s*(-?[0-9.]+)(?:px)?\s*\)/i);
                  const matrixMatch = transformStr.match(/^matrix\(\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*,\s*([0-9.-]+)\s*\)$/i);

                  if (translate3dMatch) {
                    const x = parseFloat(translate3dMatch[1]);
                    const y = parseFloat(translate3dMatch[2]);
                    htmlEl.style.transform = "none";
                    htmlEl.style.left = `${x}px`;
                    htmlEl.style.top = `${y}px`;
                    htmlEl.style.position = "absolute";
                  } else if (translateMatch) {
                    const x = parseFloat(translateMatch[1]);
                    const y = parseFloat(translateMatch[2]);
                    htmlEl.style.transform = "none";
                    htmlEl.style.left = `${x}px`;
                    htmlEl.style.top = `${y}px`;
                    htmlEl.style.position = "absolute";
                  } else if (matrixMatch) {
                    const x = parseFloat(matrixMatch[5]);
                    const y = parseFloat(matrixMatch[6]);
                    htmlEl.style.transform = "none";
                    htmlEl.style.left = `${x}px`;
                    htmlEl.style.top = `${y}px`;
                    htmlEl.style.position = "absolute";
                  }
                }
              } catch (elErr) {
                console.warn("Skipped parsing individual tile transform inside cloned canvas:", elErr);
              }
            });
          } catch (cloneErr) {
            console.error("Critical error inside HTML2Canvas document clone processing:", cloneErr);
          }
        }
      };

      const canvas = await html2canvas(compositeEl, cloneOptions);
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      pdf.addImage(imgData, "JPEG", 0, 0, totalWidthMm, maxPageHeightMm);

      const safeName = parcel.name ? parcel.name.trim().replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "_") : "Plan";
      pdf.save(`Plan_Parcellaire_${safeName}.pdf`);
    } catch (err) {
      console.error("PDF Export Error:", err);
      setExportError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSnapshotting(false);
      setIsExporting(false);
    }
  };

  return (
    <div className="w-full bg-stone-100 p-4 md:p-8 min-h-screen text-slate-800 relative select-text font-sans">
      {/* PERFECT HIGH-FIDELITY BROWSER PRINTING OVERRIDES */}
      <style>{`
        @media print {
          @page {
            size: ${totalWidthMm}mm ${maxPageHeightMm}mm;
            margin: 0 !important;
          }

          /* Clean up outer layouts */
          body, html, #root {
            background-color: #ffffff !important;
            background: #ffffff !important;
            color: #1c1917 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            width: ${totalWidthMm}mm !important;
            height: ${maxPageHeightMm}mm !important;
          }

          /* Hide print-hidden elements */
          .print\\:hidden {
            display: none !important;
          }

          /* Reset interactive scaled structures */
          #print-viewport-parent,
          #print-scaled-container {
            transform: none !important;
            width: ${totalWidthMm}mm !important;
            height: ${maxPageHeightMm}mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            background: transparent !important;
            display: block !important;
          }

          #cadastral-combined-sheet {
            transform: none !important;
            width: ${totalWidthMm}mm !important;
            height: ${maxPageHeightMm}mm !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            box-shadow: none !important;
            border: none !important;
            background: #ffffff !important;
            display: flex !important;
            flex-direction: row !important;
            align-items: start !important;
            justify-content: start !important;
            gap: 0 !important;
          }

          /* Page 1 Cover Sheet styling & disabled page break */
          #page-1-cover {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
            display: flex !important;
            box-sizing: border-box !important;
            border: 4px double #1c1917 !important;
            background-color: #ffffff !important;
          }

          /* Page 2 Technical Sheet styling & disabled page break */
          #page-2-technical {
            width: ${page2WidthMm}mm !important;
            height: ${page2HeightMm}mm !important;
            min-height: ${page2HeightMm}mm !important;
            max-height: ${page2HeightMm}mm !important;
            margin: 0 !important;
            page-break-before: avoid !important;
            break-before: avoid !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
            display: flex !important;
            box-sizing: border-box !important;
            border: 4px double #1c1917 !important;
            background-color: #ffffff !important;
          }

          /* Ensure exact color graphics when compiling PDF */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>

      {/* Iframe Print Warning Modal */}
      {showIframeModal && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-md z-[99999] flex items-center justify-center p-4">
          <div className="bg-white p-6 rounded-2xl shadow-2xl border border-stone-200 flex flex-col items-center gap-4 text-center max-w-md w-full animate-in fade-in zoom-in duration-200 text-slate-800">
            <div className="bg-amber-100 p-3 rounded-full text-amber-600 animate-pulse">
              <ExternalLink className="w-8 h-8" />
            </div>
            <h3 className="font-extrabold text-base text-stone-950">
              طباعة المخطط محجوبة بسبب المعاينة (Iframe)
            </h3>
            <p className="text-xs text-stone-600 leading-relaxed">
              يقوم المتصفح تلقائياً بحظر نوافذ الطباعة التفاعلية (<code>window.print()</code>) عند تشغيلها من داخل إطار المعاينة الخاص بمنصة التطوير لحماية الأمان.
            </p>
            <p className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-2.5 rounded-lg leading-relaxed">
              👉 يرجى النقر على الزر الأخضر أدناه لفتح المخطط في علامة تبويب جديدة مستقلة بالمتصفح، حيث يمكنك الطباعة والحفظ بصيغة PDF بدقة فائقة وبشكل فوري!
            </p>
            <div className="border-t border-stone-100 w-full my-1"></div>
            <p className="text-[10px] text-stone-500 leading-relaxed italic">
              Pour des raisons de sécurité, le navigateur bloque l'impression standard depuis l'aperçu intégré. Veuillez ouvrir l'application dans un nouvel onglet autonome pour débloquer l'accès complet à l'impression HD.
            </p>
            <div className="flex gap-2 w-full mt-2">
              <button
                onClick={() => setShowIframeModal(false)}
                className="flex-[2] px-4 py-2.5 text-xs font-semibold text-stone-500 bg-stone-100 hover:bg-stone-200 rounded-lg transition"
              >
                إغلاق / Fermer
              </button>
              <a
                href={window.location.href}
                target="_blank"
                rel="noreferrer noopener"
                onClick={() => setShowIframeModal(false)}
                className="flex-[3] flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-md hover:shadow-lg"
              >
                <span>فتح في نافذة جديدة</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Loading Overlay when generating direct PDF copy */}
      {isExporting && (
        <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm z-[9999] flex flex-col items-center justify-center text-white font-sans pointer-events-auto">
          <div className="bg-white p-6 rounded-2xl shadow-2xl border border-stone-200 flex flex-col items-center gap-4 text-stone-800 max-w-xs text-center animate-in fade-in duration-250">
            <Loader2 className="w-10 h-10 text-rose-600 animate-spin" />
            <h3 className="font-bold text-sm">Génération du PDF en cours...</h3>
            <p className="text-[11px] text-stone-500">
              Veuillez patienter pendant la compilation du plan parcellaire haute fidélité.
            </p>
          </div>
        </div>
      )}

      {/* Print Action Bar (Hidden when exporting/printing) */}
      <div className="max-w-[1240px] mx-auto bg-white border border-stone-200 p-4 rounded-xl shadow-md mb-6 flex flex-col lg:flex-row gap-4 items-center justify-between print:hidden font-sans">
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 p-2 rounded-lg text-emerald-700">
            <Printer className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-slate-800">
              {printLayoutType === "type1" ? "Visualisation du Dossier d'Impression (الطباعة مرفوقة بصفحة الغلاف)" : "Visualisation du Plan Parcellaire (الطباعة بدون صفحة الغلاف)"}
            </h1>
            <p className="text-[11px] text-slate-500">
              {printLayoutType === "type1" 
                ? "Dossier d'impression complet (Page 1: page de garde + Page 2: plan de détails)"
                : "Plan parcellaire seul (Page unique du plan horizontal sans page de garde)"}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-end w-full lg:w-auto">
          {/* Layout Type Fast Switcher */}
          <div className="flex bg-stone-100 p-1 rounded-lg border border-stone-200 text-xs font-bold leading-none shrink-0 print:hidden select-none mr-2">
            <button
              onClick={() => setPrintLayoutType("type1")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                printLayoutType === "type1" 
                  ? "bg-amber-600 text-white shadow-sm" 
                  : "text-stone-500 hover:text-stone-850"
              }`}
              title="Page de Garde + Page de Détails"
            >
              الطباعة مرفوقة بصفحة الغلاف
            </button>
            <button
              onClick={() => setPrintLayoutType("type2")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                printLayoutType === "type2" 
                  ? "bg-amber-600 text-white shadow-sm animate-none" 
                  : "text-stone-500 hover:text-stone-850"
              }`}
              title="Plan Parcellaire Seul"
            >
              الطباعة بدون صفحة الغلاف
            </button>
          </div>

          {/* Editable Grid Interval */}
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-600 shrink-0">
            <span className="text-[10px] text-stone-500 font-extrabold uppercase">Grille (m) :</span>
            <input
              type="number"
              min="1"
              max="1000"
              value={localGridInterval || ""}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "") {
                  setLocalGridInterval("" as any);
                } else {
                  setLocalGridInterval(parseFloat(val) || 0);
                }
              }}
              onBlur={() => {
                if (!localGridInterval || localGridInterval < 0.1) {
                  setLocalGridInterval(50);
                }
              }}
              className="bg-transparent border-none outline-none w-12 font-extrabold text-stone-850 text-center"
            />
          </div>

          {/* Scale Selection Dropdown */}
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-600 shrink-0">
            <span className="text-[10px] text-stone-500 font-extrabold uppercase">Échelle :</span>
            <select
              value={scaleMode}
              onChange={(e) => setScaleMode(e.target.value as any)}
              className="bg-transparent border-none outline-none pr-1 py-0 font-extrabold text-slate-800 cursor-pointer text-xs"
            >
              <option value="custom">⚠️ Saisie Manuelle (Custom)</option>
              <option value="auto">Auto-optimisé ({getStandardScaleValue(refNumericScale)})</option>
              <option value="100">1 / 100</option>
              <option value="250">1 / 250</option>
              <option value="500">1 / 500</option>
              <option value="1000">1 / 1000</option>
              <option value="2500">1 / 2500</option>
              <option value="5000">1 / 5000</option>
            </select>
            {scaleMode === "custom" && (
              <span className="flex items-center gap-1 pl-1 border-l border-stone-200">
                <span className="text-[10px] text-stone-400">1/</span>
                <input
                  type="number"
                  min="5"
                  max="100000"
                  value={customScaleValue || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setCustomScaleValue("" as any);
                    } else {
                      setCustomScaleValue(parseInt(val) || 0);
                    }
                  }}
                  onBlur={() => {
                    if (!customScaleValue || customScaleValue < 5) {
                      setCustomScaleValue(500);
                    }
                  }}
                  className="bg-transparent border-none outline-none w-14 font-extrabold text-stone-850 text-center"
                />
              </span>
            )}
          </div>

          {/* Sizing Scale Selector */}
          <div className="flex items-center gap-1.5 bg-stone-50 border border-stone-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-600 print:hidden shrink-0">
            <span className="text-[10px] text-stone-500 font-extrabold uppercase">Aperçu :</span>
            <select
              value={zoomMode}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "auto") {
                  setZoomMode("auto");
                } else {
                  setZoomMode(parseFloat(val));
                }
              }}
              className="bg-transparent border-none outline-none pr-1 py-0 font-extrabold text-slate-800 cursor-pointer text-xs"
            >
              <option value="auto">Auto-ajusté</option>
              <option value="0.5">50%</option>
              <option value="0.65">65%</option>
              <option value="0.8">80%</option>
              <option value="0.95">95%</option>
              <option value="1">100%</option>
            </select>
          </div>

          {/* Toggle for aerial arrow projection */}
          <label className="flex items-center gap-2 bg-stone-50 border border-stone-200 px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-600 print:hidden cursor-pointer select-none shrink-0 transition hover:bg-stone-100">
            <input
              type="checkbox"
              checked={showAerialArrow}
              onChange={(e) => setShowAerialArrow(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-red-650 focus:ring-red-500 border-stone-300 accent-red-600 cursor-pointer"
            />
            <span className="text-[11px] text-stone-700 font-bold">Flèche Projet (Vue Aérienne)</span>
          </label>

          <button
            onClick={onBackToEditor}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-stone-600 bg-stone-100 ring-1 ring-stone-200 hover:bg-stone-200 rounded-lg transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Retour</span>
          </button>
          
          <button
            onClick={handleDownloadPDF}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 disabled:bg-stone-50 disabled:text-stone-350 disabled:cursor-not-allowed rounded-lg transition"
            title="Génération haute fidélité en une seule planche composite"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Télécharger PDF (Composite)</span>
          </button>

          <button
            onClick={handlePrint}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-5 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02] shadow-md hover:shadow-lg rounded-lg transition duration-200 outline outline-2 outline-offset-2 outline-emerald-500/20"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimer</span>
          </button>
        </div>
      </div>

      {/* Permanent High-Fidelity Print & PDF Settings Guide (FR) */}
      <div className="max-w-[1240px] mx-auto bg-slate-50 border border-slate-200 p-4 rounded-xl shadow-sm mb-6 print:hidden">
        <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider mb-2.5 flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-ping"></span>
          Guide pour une impression PDF parfaite (Fidélité Maximale)
        </h3>
        <p className="text-xs text-slate-600 mb-3 leading-relaxed">
          Pour exporter votre plan en haute définition sans aucune erreur ou déformation de couleurs, cliquez sur le bouton vert <strong className="text-emerald-700">"Imprimer"</strong> ci-dessus et appliquez les réglages simples suivants dans la fenêtre de votre navigateur :
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white p-2.5 rounded-lg border border-slate-100 flex gap-2">
            <span className="text-slate-400 font-bold text-xs">1.</span>
            <div>
              <h4 className="font-bold text-xs text-slate-800">Destination & Format</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Sélectionnez <strong>"Enregistrer au format PDF"</strong>. Choisissez une orientation ou configurer à taille réelle pour vos deux pages.</p>
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-100 flex gap-2">
            <span className="text-slate-400 font-bold text-xs">2.</span>
            <div>
              <h4 className="font-bold text-xs text-slate-800">Arrière-plans (Essentiel)</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Cochez absolument la case <strong>"Graphismes d'arrière-plan"</strong> pour rendre la carte de situation OSM et les cadres visibles.</p>
            </div>
          </div>
          <div className="bg-white p-2.5 rounded-lg border border-slate-100 flex gap-2">
            <span className="text-slate-400 font-bold text-xs">3.</span>
            <div>
              <h4 className="font-bold text-xs text-slate-800">En-têtes & Marges</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Réglez les <strong>"Marges"</strong> sur <strong>"Aucune"</strong> (Sans Marge) et décochez <strong>"En-têtes et pieds de page"</strong> pour un rendu de plan parfait.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Export Error Alert Banner */}
      {exportError && (
        <div className="max-w-[1240px] mx-auto bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl shadow-sm mb-6 flex items-start justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 print:hidden font-sans">
          <div className="flex-1">
            <h4 className="font-bold text-xs uppercase tracking-wider text-rose-900 mb-1">
              Échec de la génération directe du PDF
            </h4>
            <p className="text-xs text-rose-700">
               Une erreur est survenue lors de la compilation : <span className="font-mono bg-rose-100 px-1.5 py-0.5 rounded text-rose-800 font-semibold">{exportError}</span>.
            </p>
            <p className="text-[11px] text-rose-600/90 mt-2">
              💡 <strong>Astuce :</strong> Comme indiqué ci-dessus, l'outil de génération locale direct est soumis aux restrictions du navigateur. Utilisez le bouton vert <strong>"Imprimer / PDF Navigateur (Recommandé)"</strong> pour obtenir un document haute résolution immédiatement.
            </p>
          </div>
          <button 
            onClick={() => setExportError(null)} 
            className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-900 px-2.5 py-1 rounded-md font-bold transition shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Responsive Scaled Viewport Sheets Container */}
      <div 
        id="print-viewport-parent"
        ref={containerRef}
        className="w-full flex flex-col items-center overflow-x-auto pb-10 scrollbar-thin select-none print:overflow-visible print:pb-0"
      >
        <div
          id="print-scaled-container"
          className={`${isSnapshotting ? "" : "transition-transform duration-200"} origin-top select-text print:transform-none`}
          style={{
            transform: isSnapshotting ? "none" : `scale(${zoomScale})`,
            width: isSnapshotting || zoomScale === 1 ? "auto" : `${totalWidthMm * mmToPx * zoomScale}px`,
            height: isSnapshotting || zoomScale === 1 ? "auto" : `${maxPageHeightMm * mmToPx * zoomScale}px`,
          }}
        >
          <div
            id="cadastral-combined-sheet"
            className="bg-white flex flex-row items-start justify-start gap-0 relative print:flex print:flex-row print:items-start print:justify-start print:m-0 print:border-none print:shadow-none print:p-0 print:static shadow-2xl overflow-visible"
            style={{
              width: `${totalWidthMm}mm`,
              height: `${maxPageHeightMm}mm`,
            }}
          >
            {/* ========================================================= */}
            {/* PAGE 1 (Left Side): Page De Garde - Fixed A4 Portrait */}
            {/* ========================================================= */}
            {printLayoutType === "type1" && (
              <div
                id="page-1-cover"
                className="border-[5px] border-double border-stone-800 p-6 flex flex-col justify-between bg-white print:border-[5px] print:border-double print:border-stone-800 print:m-0 print:static shrink-0 font-sans"
                style={{
                  width: "210mm",
                  height: "297mm",
                  minHeight: "297mm",
                  maxHeight: "297mm",
                  pageBreakAfter: "avoid",
                  breakAfter: "avoid",
                  pageBreakBefore: "avoid",
                  breakBefore: "avoid",
                }}
              >
              {/* UPPER HALF: Rich Official Property Data Hub (Enlarged and balanced) */}
              <div className="flex flex-col justify-between h-[126mm] max-h-[126mm] min-h-[126mm] pb-2">
                {/* Top Row: Arabic Title Right, French Left, Logo in center */}
                <div className="grid grid-cols-12 items-center w-full">
                  {/* French Administration info */}
                  <div className="col-span-4 text-left font-sans text-[11px] leading-relaxed text-stone-800 uppercase whitespace-pre-line select-none font-semibold">
                    {settings.ministryFr}
                  </div>

                  {/* Centered Logo */}
                  <div className="col-span-4 flex flex-col items-center justify-center">
                    <div className="w-20 h-20 flex items-center justify-center">
                      <img
                        src={settings.logoUrl || "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Coat_of_arms_of_Morocco.svg/240px-Coat_of_arms_of_Morocco.svg.png"}
                        alt="Logo"
                        className="max-h-full max-w-full object-contain"
                        crossOrigin="anonymous"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  </div>

                  {/* Arabic Administration info */}
                  <div
                    dir="rtl"
                    className="col-span-4 text-right font-sans text-[12px] leading-relaxed text-stone-950 whitespace-pre-line select-none font-black"
                  >
                    {settings.ministryAr}
                  </div>
                </div>

                {/* Separator Line */}
                <hr className="border-t-2 border-stone-800 my-1" />

                {/* Title Block: Plan Parcellaire (changeable type) */}
                <div className="text-center py-2.5">
                  <h2 className="text-stone-950 text-3xl font-black tracking-[0.22em] uppercase font-sans">
                    {settings.planTitle}
                  </h2>
                </div>

                {/* Separator Line */}
                <hr className="border-t-2 border-stone-800 my-1" />

                {/* Property information card (Generously upscored) */}
                <div className="bg-stone-50/85 p-5.5 rounded-lg border-2 border-stone-800 grid grid-cols-3 gap-6 shadow-md">
                  <div className="flex flex-col justify-between">
                    <span className="text-[11px] text-stone-500 uppercase font-bold font-mono tracking-wider block mb-1">
                      Propriété dite :
                    </span>
                    <span className="font-extrabold text-[17.5px] text-slate-900 leading-snug break-words">
                      {parcel.name}
                    </span>
                  </div>
                  <div className="flex flex-col justify-between border-l-2 border-r-2 border-stone-300 px-5">
                    <span className="text-[11px] text-stone-500 uppercase font-bold font-mono tracking-wider block mb-1">
                      Surface Totale :
                    </span>
                    <div>
                      <span className="font-black text-[15px] text-rose-600 leading-none block">
                        {parcel.area.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} m²
                      </span>
                      <span className="text-[10px] font-bold text-stone-600 block leading-tight mt-2">
                        {areaParts.fr}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between">
                    <span className="text-[11px] text-stone-500 uppercase font-bold font-mono tracking-wider block mb-1">
                      Date d'Émission :
                    </span>
                    <span className="font-extrabold text-[15.5px] text-stone-900 leading-none">
                      {settings.date}
                    </span>
                  </div>
                </div>

                {/* Separator Line */}
                <hr className="border-t-2 border-stone-800 my-1" />

                {/* Structured Metadata & Certification Box with enlarged typography for improved readability */}
                <div className="bg-stone-50 border-2 border-stone-800 rounded-lg p-3 grid grid-cols-4 items-center text-center font-mono select-none divide-x-2 divide-stone-300 shadow-sm leading-normal">
                  <div className="flex flex-col items-center justify-center px-1">
                    <span className="text-[9.5px] text-stone-500 uppercase font-black block mb-1 tracking-tight">SYSTÈME DE COORDONNÉES</span>
                    <span className="font-extrabold text-indigo-700 text-[12.5px] tracking-tighter leading-tight block">
                      Merchich / {settings.projectionSystem}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center px-1">
                    <span className="text-[9.5px] text-stone-500 uppercase font-black block mb-1">Dossier N°</span>
                    <span className="font-black text-rose-600 text-[13.5px] block truncate leading-tight">
                      {settings.dossierNumber || "2026/..."}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center px-1">
                    <span className="text-[9.5px] text-stone-500 uppercase font-black block mb-1">Nombre de sommets</span>
                    <span className="font-black text-stone-900 text-[13.5px] block leading-tight">
                      {parcel.vertices.length}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center px-1">
                    <span className="text-[9.5px] text-stone-500 uppercase font-black block mb-1">Echelle</span>
                    <span className="font-black text-stone-900 text-[13.5px] block leading-tight">
                      1 / {finalNumericalScale}
                    </span>
                  </div>
                </div>
              </div>

              {/* Thicker visual separation line between information hub and coordinates table */}
              <hr className="border-t-[3px] border-double border-stone-800 my-2" />

              {/* LOWER HALF: Aerial Imagery Excerpt Map with high-contrast red indicator arrow */}
              <div className="flex flex-col h-[126mm] max-h-[126mm] min-h-[126mm] mt-2 justify-start select-none relative">
                <span className="text-[12px] font-black text-stone-800 uppercase tracking-widest mb-2 block font-sans text-center">
                  <span className="text-red-600 font-extrabold pr-1">PROJET</span> (Vue Aérienne)
                </span>
                <div className="w-full h-[114mm] border-2 border-stone-800 rounded-lg overflow-hidden relative shadow-inner bg-stone-50">
                  {/* Leaflet minimap container */}
                  <div id="page1-aerial-minimap" className="w-full h-full" />
                </div>

                {/* Highly stylized professional red arrow linking 'PROJET' to the center parcel */}
                {showAerialArrow && (
                  <svg className="absolute inset-0 w-full h-full pointer-events-none z-[1000]" style={{ zIndex: 1000 }} viewBox="0 0 200 150" preserveAspectRatio="none">
                    <defs>
                      <marker
                        id="red-arrow-head-aerial"
                        viewBox="0 0 10 10"
                        refX="6"
                        refY="5"
                        markerWidth="5"
                        markerHeight="5"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 1.5 L 8 5 L 0 8.5 z" fill="#dc2626" />
                      </marker>
                    </defs>
                    
                    {/* Thinner, elegant curved path pointing towards the center but stopping short to avoid covering the parcel */}
                    <path
                      d="M 76 11 Q 35 32 80 58"
                      fill="none"
                      stroke="#dc2626"
                      strokeWidth="1.0"
                      strokeDasharray="3,2"
                      markerEnd="url(#red-arrow-head-aerial)"
                    />
                    
                    {/* Tiny start anchor point (red dot) at y=11 (safely under the text characters) */}
                    <circle cx="76" cy="11" r="1.5" fill="#dc2626" />
                  </svg>
                )}
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* PAGE 2 (Right Side): Modèle Technique - Variable Maps/Tables */}
          {/* ========================================================= */}
          <div
            id="page-2-technical"
            className="border-4 border-double border-stone-800 p-4 bg-white relative print:border-4 print:border-double print:border-stone-800 print:m-0 print:static shrink-0 flex flex-col justify-center items-center overflow-hidden"
            style={{
              width: `${page2WidthMm}mm`,
              height: `${page2HeightMm}mm`,
              pageBreakBefore: "avoid",
              breakBefore: "avoid",
              pageBreakAfter: "avoid",
              breakAfter: "avoid",
            }}
          >
            {/* Vector Map Frame with coordinate values - Filling the entire space */}
            <div 
              className="relative bg-white overflow-hidden flex flex-col justify-between w-full h-full"
            >
              {/* Absolute-positioned coordinates table in the right margin of Page 2 */}
              <div 
                className="absolute bg-stone-50/90 border-2 border-stone-800 rounded-lg p-3 z-20 font-sans flex flex-col shadow-md hover:bg-stone-50 select-none transition-colors duration-150"
                style={{
                  top: `${mapTop / 2.5}mm`,
                  right: "4mm",
                  width: `${containerWidthMm}mm`,
                  height: `${mapHeight / 2.5}mm`,
                  maxHeight: `${mapHeight / 2.5}mm`,
                }}
              >
                <span className="text-[11px] font-black text-stone-900 uppercase tracking-widest mb-2 block text-center border-b-2 border-stone-800 pb-1.5 font-sans">
                  Tableau des Coordonnées
                </span>
                <div className="flex-1 overflow-x-auto overflow-y-hidden scrollbar-thin">
                  <div className="flex flex-row gap-[3mm] items-start justify-start h-full pb-1">
                    {(() => {
                      const columnsArray: typeof parcel.vertices[] = [];
                      for (let i = 0; i < totalPoints; i += rowsPerColumn) {
                        columnsArray.push(parcel.vertices.slice(i, i + rowsPerColumn));
                      }
                      
                      return columnsArray.map((colVertices, colIdx) => (
                        <div 
                          key={colIdx} 
                          className="w-[36mm] min-w-[36mm] border border-stone-300 rounded bg-white overflow-hidden shadow-sm flex flex-col"
                          style={{ maxHeight: "100%" }}
                        >
                          <table className="w-full text-left font-mono border-collapse">
                            <thead className="bg-stone-200 text-stone-900 border-b border-stone-400 text-[8px] font-extrabold sticky top-0">
                              <tr>
                                <th className="px-1.5 py-1 uppercase text-center border-r border-stone-300 w-[25%]">FID</th>
                                <th className="px-1.5 py-1 uppercase text-right border-r border-stone-300">X (m)</th>
                                <th className="px-1.5 py-1 uppercase text-right">Y (m)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-200 text-stone-950 text-[8.5px]">
                              {colVertices.map((v) => {
                                const origIdx = parcel.vertices.findIndex((orig) => orig.id === v.id);
                                return (
                                  <tr key={v.id} className="hover:bg-amber-50/25 odd:bg-stone-100/20">
                                    <td className="px-1.5 py-0.5 font-bold text-center border-r border-stone-200">
                                      {v.label || `P${origIdx + 1}`}
                                    </td>
                                    <td className="px-1.5 py-0.5 text-right font-medium border-r border-stone-200 bg-stone-50/10">
                                      {v.x.toFixed(2)}
                                    </td>
                                    <td className="px-1.5 py-0.5 text-right font-medium">
                                      {v.y.toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              </div>

              {/* Automated Label Generation Stamp on bottom-right of page 2 technical sheet */}
              <div 
                className="absolute text-stone-500 font-mono font-bold tracking-normal pointer-events-none select-none text-right z-30"
                style={{
                  top: `calc(${mapBottom / 2.5}mm + 1.2mm)`, // Aligned perfectly below the coordinate table frame
                  right: "6mm",
                  width: `${containerWidthMm}mm`,
                  fontSize: "6.5px",
                }}
              >
                Généré automatiquement par PARCEL LAYOUT DESIGNER v1.1
              </div>

              <svg
                width="100%"
                height="100%"
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="text-stone-800 z-10 w-full h-full"
              >
                {/* Custom Title Card for Plan Parcellaire (printLayoutType === "type2") */}
                {printLayoutType === "type2" && (
                  <g id="type2-header-title">
                    {/* Header Box background */}
                    <rect
                      x={mapLeft}
                      y={8}
                      width={mapWidth}
                      height={27}
                      fill="#fcfbf7"
                      stroke="#1c1917"
                      strokeWidth="1.5"
                      rx="3"
                    />
                    {/* Centered PLAN PARCELLAIRE title */}
                    <text
                      x={mapLeft + mapWidth / 2}
                      y={26}
                      textAnchor="middle"
                      className="font-sans font-black tracking-widest fill-stone-900"
                      style={{ fontSize: "14px", fontWeight: 900, letterSpacing: "0.15em" }}
                    >
                      PLAN PARCELLAIRE
                    </text>
                  </g>
                )}

                {/* Elegant Inner Map Border Cadre */}
                <rect
                  x={mapLeft}
                  y={mapTop}
                  width={mapWidth}
                  height={mapHeight}
                  fill="none"
                  stroke="#1c1917"
                  strokeWidth="1.5"
                />

                {/* Custom Surface badge inside the map near the bottom frame (printLayoutType === "type2") */}
                {printLayoutType === "type2" && (
                  <g id="type2-surface-badge">
                    {/* Background rectangle for legibility */}
                    <rect
                      x={mapLeft + mapWidth / 2 - 140}
                      y={mapBottom - 26}
                      width={280}
                      height={18}
                      fill="#fcfbf7"
                      stroke="#1c1917"
                      strokeWidth="1.2"
                      rx="2"
                    />
                    {/* Bilingual Surface Display with requested format */}
                    <text
                      x={mapLeft + mapWidth / 2}
                      y={mapBottom - 13}
                      textAnchor="middle"
                      className="font-sans font-extrabold fill-stone-900"
                      style={{ fontSize: "10px", fontWeight: 850 }}
                    >
                      {`SURFACE : ${Math.floor(parcel.area / 10000)} H . ${Math.floor((parcel.area % 10000) / 100)} A . ${(parcel.area % 100).toFixed(2)} Ca`}
                    </text>
                  </g>
                )}

                {/* Horizontal grid lines and bottom tick labels (X constant lines) */}
                {gridTicksX.map((gx, idx) => {
                  const pt = projectToSvg(gx, centerY);
                  if (pt.x < mapLeft || pt.x > mapRight) return null;
                  return (
                    <g key={`tech-grid-x-${idx}`}>
                      {/* Grid Line */}
                      <line
                        x1={pt.x}
                        y1={mapTop}
                        x2={pt.x}
                        y2={mapBottom}
                        stroke="#cbd5e1"
                        strokeDasharray="2,2"
                        strokeWidth="0.5"
                      />
                      {/* Inside tick at top border pointing down */}
                      <line
                        x1={pt.x}
                        y1={mapTop}
                        x2={pt.x}
                        y2={mapTop + 5}
                        stroke="#1c1917"
                        strokeWidth="1.2"
                      />
                      {/* Inside tick at bottom border pointing up */}
                      <line
                        x1={pt.x}
                        y1={mapBottom}
                        x2={pt.x}
                        y2={mapBottom - 5}
                        stroke="#1c1917"
                        strokeWidth="1.2"
                      />
                      {/* Label below the frame (Outside bottom) */}
                      <text
                        x={pt.x}
                        y={mapBottom + 16}
                        textAnchor="middle"
                        style={{ fontSize: "10px" }}
                        className="font-mono font-extrabold fill-stone-900"
                      >
                        {gx.toFixed(0)}
                      </text>
                    </g>
                  );
                })}

                {/* Vertical grid lines and left tick labels (Y constant lines) */}
                {gridTicksY.map((gy, idx) => {
                  const pt = projectToSvg(centerX, gy);
                  if (pt.y < mapTop || pt.y > mapBottom) return null;
                  return (
                    <g key={`tech-grid-y-${idx}`}>
                      {/* Grid Line */}
                      <line
                        x1={mapLeft}
                        y1={pt.y}
                        x2={mapRight}
                        y2={pt.y}
                        stroke="#cbd5e1"
                        strokeDasharray="2,2"
                        strokeWidth="0.5"
                      />
                      {/* Inside tick at left border pointing right */}
                      <line
                        x1={mapLeft}
                        y1={pt.y}
                        x2={mapLeft + 5}
                        y2={pt.y}
                        stroke="#1c1917"
                        strokeWidth="1.2"
                      />
                      {/* Inside tick at right border pointing left */}
                      <line
                        x1={mapRight}
                        y1={pt.y}
                        x2={mapRight - 5}
                        y2={pt.y}
                        stroke="#1c1917"
                        strokeWidth="1.2"
                      />
                      {/* Label left of the frame rotated, reading bottom-to-top */}
                      <text
                        x={mapLeft - 10}
                        y={pt.y + 3.5}
                        textAnchor="middle"
                        style={{ fontSize: "10px" }}
                        className="font-mono font-extrabold fill-stone-900"
                        transform={`rotate(-90, ${mapLeft - 10}, ${pt.y})`}
                      >
                        {gy.toFixed(0)}
                      </text>
                    </g>
                  );
                })}

                {/* Main Boundary Parcel Drawing */}
                <polygon
                  points={svgVertices.map((v) => `${v.x},${v.y}`).join(" ")}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                />

                {/* Labels of segments */}
                {parcel.segments.map((seg) => {
                  const labelOffset = settings.labelOffset !== undefined ? settings.labelOffset : 7;
                  const insidePrPoint = getOutsidePoint(centroid, seg.startVertex, seg.endVertex, labelOffset);
                  const pt = projectToSvg(insidePrPoint.x, insidePrPoint.y);

                  if (pt.x < mapLeft + 10 || pt.x > mapRight - 10 || pt.y < mapTop + 10 || pt.y > mapBottom - 10) {
                    return null;
                  }

                  const angle = getSegmentAngle(seg.startVertex, seg.endVertex);
                  const showL = settings.mapLabels === "Longueurs" || settings.mapLabels === "Longueurs + Voisins";
                  const showN = settings.mapLabels === "Voisins" || settings.mapLabels === "Longueurs + Voisins";

                  // Professionally split neighbors with text-wrapping over 2 lines to avoid overlap and clipping
                  const splitNeighborText = (text: string): string[] => {
                    if (!text) return [];
                    const trimmed = text.trim();
                    if (trimmed.length <= 13) return [trimmed];
                    const words = trimmed.split(/\s+/);
                    if (words.length <= 1) return [trimmed];
                    
                    let bestDiff = Infinity;
                    let splitIdx = 1;
                    for (let i = 1; i < words.length; i++) {
                      const firstHalf = words.slice(0, i).join(" ");
                      const secondHalf = words.slice(i).join(" ");
                      const diff = Math.abs(firstHalf.length - secondHalf.length);
                      if (diff < bestDiff) {
                        bestDiff = diff;
                        splitIdx = i;
                      }
                    }
                    return [
                      words.slice(0, splitIdx).join(" "),
                      words.slice(splitIdx).join(" ")
                    ];
                  };

                  const neighborLines = showN && seg.neighbor ? splitNeighborText(seg.neighbor) : [];
                  const baseLabelSize = settings.labelFontSize !== undefined ? settings.labelFontSize : 7.0;
                  const neighborFontSize = `${baseLabelSize * 0.9}px`;
                  const lengthFontSize = `${baseLabelSize}px`;

                  return (
                    <g key={seg.id}>
                      <g transform={`translate(${pt.x}, ${pt.y}) rotate(${-angle})`}>
                        {showL && (
                          <g>
                            {/* White thick halo background text */}
                            <text
                              x="0"
                              y="-4"
                              textAnchor="middle"
                              stroke="#ffffff"
                              strokeWidth="3"
                              strokeLinejoin="round"
                              style={{ fontSize: lengthFontSize }}
                              className="font-sans font-black select-none"
                            >
                              {seg.length.toFixed(2)} m
                            </text>
                            <text
                              x="0"
                              y="-4"
                              textAnchor="middle"
                              style={{ fontSize: lengthFontSize }}
                              className="font-sans font-black fill-blue-800 select-none"
                            >
                              {seg.length.toFixed(2)} m
                            </text>
                          </g>
                        )}

                        {showN && neighborLines.length > 0 && (
                          <g>
                            {neighborLines.length === 1 ? (
                              <g>
                                {/* White outline halo */}
                                <text
                                  x="0"
                                  y="5"
                                  textAnchor="middle"
                                  stroke="#ffffff"
                                  strokeWidth="3.2"
                                  strokeLinejoin="round"
                                  style={{ fontSize: neighborFontSize }}
                                  className="font-sans font-bold select-none"
                                >
                                  {neighborLines[0]}
                                </text>
                                {/* Fill text */}
                                <text
                                  x="0"
                                  y="5"
                                  textAnchor="middle"
                                  style={{ fontSize: neighborFontSize }}
                                  className="font-sans font-black fill-stone-850 select-none"
                                >
                                  {neighborLines[0]}
                                </text>
                              </g>
                            ) : (
                              <g>
                                {/* Line 1 Halo & Fill */}
                                <text
                                  x="0"
                                  y="4.5"
                                  textAnchor="middle"
                                  stroke="#ffffff"
                                  strokeWidth="3.2"
                                  strokeLinejoin="round"
                                  style={{ fontSize: `${baseLabelSize * 0.8}px`, lineHeight: "1" }}
                                  className="font-sans font-bold select-none"
                                >
                                  {neighborLines[0]}
                                </text>
                                <text
                                  x="0"
                                  y="4.5"
                                  textAnchor="middle"
                                  style={{ fontSize: `${baseLabelSize * 0.8}px`, lineHeight: "1" }}
                                  className="font-sans font-black fill-stone-850 select-none"
                                >
                                  {neighborLines[0]}
                                </text>

                                {/* Line 2 Halo & Fill */}
                                <text
                                  x="0"
                                  y="11"
                                  textAnchor="middle"
                                  stroke="#ffffff"
                                  strokeWidth="3.2"
                                  strokeLinejoin="round"
                                  style={{ fontSize: `${baseLabelSize * 0.8}px`, lineHeight: "1" }}
                                  className="font-sans font-bold select-none"
                                >
                                  {neighborLines[1]}
                                </text>
                                <text
                                  x="0"
                                  y="11"
                                  textAnchor="middle"
                                  style={{ fontSize: `${baseLabelSize * 0.8}px`, lineHeight: "1" }}
                                  className="font-sans font-black fill-stone-850 select-none"
                                >
                                  {neighborLines[1]}
                                </text>
                              </g>
                            )}
                          </g>
                        )}
                      </g>
                    </g>
                  );
                })}

                {/* Corner polygon Vertex labels with active-balancing outward projection */}
                {(() => {
                  if (svgVertices.length === 0) return null;
                  const svgCentroidX = svgVertices.reduce((sum, v2) => sum + v2.x, 0) / svgVertices.length;
                  const svgCentroidY = svgVertices.reduce((sum, v2) => sum + v2.y, 0) / svgVertices.length;

                  return svgVertices.map((v) => {
                    const dx = v.x - svgCentroidX;
                    const dy = v.y - svgCentroidY;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const nx = len > 0 ? dx / len : 1;
                    const ny = len > 0 ? dy / len : 0;

                    // Extrude point labels 9 pixels in the outward direction from the centroid
                    const labelX = v.x + nx * 9;
                    const labelY = v.y + ny * 9;

                    return (
                      <g key={v.id}>
                        <circle cx={v.x} cy={v.y} r="3" fill="#ef4444" stroke="#ffffff" strokeWidth="1" />
                        
                        {/* Perfect White Text Halo Cover for maximum high-contrast separation */}
                        <text
                          x={labelX}
                          y={labelY + 2.5}
                          textAnchor="middle"
                          stroke="#ffffff"
                          strokeWidth="3.5"
                          strokeLinejoin="round"
                          style={{ fontSize: `${settings.vertexFontSize || 8.5}px` }}
                          className="font-sans font-extrabold select-none"
                        >
                          {v.label}
                        </text>

                        <text
                          x={labelX}
                          y={labelY + 2.5}
                          textAnchor="middle"
                          style={{ fontSize: `${settings.vertexFontSize || 8.5}px` }}
                          className="font-sans font-extrabold fill-stone-900 select-none"
                        >
                          {v.label}
                        </text>
                      </g>
                    );
                  });
                })()}

                {/* Cartographic North Arrow Directly inside grid viewBox */}
                <g transform={`translate(${mapRight - 46}, ${mapTop + 10})`}>
                  <rect
                    x="0"
                    y="0"
                    width="36"
                    height="36"
                    rx="3.5"
                    fill="#ffffff"
                    fillOpacity="0.95"
                    stroke="#1c1917"
                    strokeWidth="1"
                  />
                  <g transform="translate(18, 19.5) scale(0.28)">
                    {/* Ring 1 (Thin outer) */}
                    <circle cx="0" cy="0" r="44" fill="none" stroke="#1c1917" strokeWidth="1" />
                    {/* Ring 2 (Dashed middle track) */}
                    <circle cx="0" cy="0" r="39" fill="none" stroke="#1c1917" strokeWidth="0.5" strokeDasharray="1,1.5" />
                    {/* Ring 3 (Medium inner) */}
                    <circle cx="0" cy="0" r="36" fill="none" stroke="#1c1917" strokeWidth="0.75" />
                    
                    {/* Cardinal Axis Lines */}
                    <line x1="-42" y1="0" x2="42" y2="0" stroke="#1c1917" strokeWidth="0.5" opacity="0.4" />
                    <line x1="0" y1="-42" x2="0" y2="42" stroke="#1c1917" strokeWidth="0.5" opacity="0.4" />
                    <line x1="-31" y1="-31" x2="31" y2="31" stroke="#1c1917" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.3" />
                    <line x1="-31" y1="31" x2="31" y2="-31" stroke="#1c1917" strokeWidth="0.5" strokeDasharray="2,2" opacity="0.3" />
                    
                    {/* North Pointer */}
                    <polygon points="0,-42 -8,0 0,-4" fill="#1c1917" />
                    <polygon points="0,-42 8,0 0,-4" fill="#f5f5f4" stroke="#1c1917" strokeWidth="0.75" />
                    
                    {/* South Pointer */}
                    <polygon points="0,34 -6,0 0,2" fill="#f5f5f4" stroke="#1c1917" strokeWidth="0.5" />
                    <polygon points="0,34 6,0 0,2" fill="#1c1917" />
                    
                    {/* East Pointer */}
                    <polygon points="34,0 0,-6 -2,0" fill="#f5f5f4" stroke="#1c1917" strokeWidth="0.5" />
                    <polygon points="34,0 0,6 -2,0" fill="#1c1917" />
                    
                    {/* West Pointer */}
                    <polygon points="-34,0 0,-6 2,0" fill="#1c1917" />
                    <polygon points="-34,0 0,6 2,0" fill="#f5f5f4" stroke="#1c1917" strokeWidth="0.5" />
                    
                    {/* Center Pivot Jewel */}
                    <circle cx="0" cy="0" r="3" fill="#ffffff" stroke="#1c1917" strokeWidth="1" />
                    
                    {/* Capital Serif 'N' */}
                    <text
                      x="0"
                      y="-49"
                      style={{ fontSize: "16px", fontFamily: '"Times New Roman", "Georgia", "Liberation Serif", serif', fontWeight: "900" }}
                      className="fill-stone-900"
                      textAnchor="middle"
                    >
                      N
                    </text>
                  </g>
                </g>

                {/* Cartographic Numerical Scale Directly inside grid viewBox */}
                <g transform={`translate(${mapRight - 106}, ${mapBottom - 24})`}>
                  <rect
                    x="0"
                    y="0"
                    width="100"
                    height="18"
                    rx="3.5"
                    fill="#ffffff"
                    fillOpacity="0.95"
                    stroke="#1c1917"
                    strokeWidth="1"
                  />
                  <text
                    x="50"
                    y="12"
                    textAnchor="middle"
                    style={{ fontSize: "9px" }}
                    className="font-mono font-bold fill-stone-900"
                  >
                    1 / {finalNumericalScale}
                  </text>
                </g>
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);
};
