import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import L from "leaflet";

// Monkeypatch Leaflet to prevent any LatLng constructor crashing with NaN or infinite values
const OriginalLatLng = L.LatLng;
const originalLatLngFn = L.latLng;

function sanitize(val: any, fallback: number): number {
  if (typeof val === 'number' && !isNaN(val) && isFinite(val)) {
    return val;
  }
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    if (!isNaN(parsed) && isFinite(parsed)) return parsed;
  }
  return fallback;
}

// Override L.LatLng constructor
// @ts-ignore
L.LatLng = function (this: any, lat: any, lng: any, alt: any) {
  let sLat = 33.5731;
  let sLng = -7.5898;
  
  if (lat !== undefined && lat !== null) {
    if (typeof lat === 'object' && 'lat' in lat) {
      sLat = sanitize(lat.lat, 33.5731);
      sLng = sanitize(lat.lng || lat.lon, -7.5898);
    } else if (Array.isArray(lat)) {
      sLat = sanitize(lat[0], 33.5731);
      sLng = sanitize(lat[1], -7.5898);
    } else {
      sLat = sanitize(lat, 33.5731);
      sLng = sanitize(lng, -7.5898);
    }
  }
  
  return new (OriginalLatLng as any)(sLat, sLng, alt);
} as any;

L.LatLng.prototype = OriginalLatLng.prototype;

// Override L.latLng factory function
L.latLng = function (a: any, b?: any, c?: any) {
  if (a instanceof OriginalLatLng) {
    return a;
  }
  
  let sLat = 33.5731;
  let sLng = -7.5898;
  
  if (a !== undefined && a !== null) {
    if (typeof a === 'object' && 'lat' in a) {
      sLat = sanitize(a.lat, 33.5731);
      sLng = sanitize(a.lng || a.lon, -7.5898);
    } else if (Array.isArray(a)) {
      sLat = sanitize(a[0], 33.5731);
      sLng = sanitize(a[1], -7.5898);
    } else {
      sLat = sanitize(a, 33.5731);
      sLng = sanitize(b, -7.5898);
    }
  }
  
  return originalLatLngFn(sLat, sLng, c);
} as any;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

