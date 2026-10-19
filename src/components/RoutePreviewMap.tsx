import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { LatLngItem, RouteItem } from '@/types/models'

/** The app's light map (OpenFreeMap), the same data the phones use. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

/** Same colors as the app's route lines. */
const MODE_COLORS: Record<string, string> = {
  Walk: '#4CAF50',
  Jeepney: '#2196F3',
  Bus: '#F44336',
  Train: '#9C27B0',
  Tricycle: '#FF9800',
  'FX/Van': '#FFC107',
  Ferry: '#03A9F4',
}
const DEFAULT_COLOR = '#2196F3'

const toLngLat = (p: LatLngItem): [number, number] => [p.lng, p.lat]

/** Each step's piece of the drawn line, in its mode's color. */
function stepLines(route: RouteItem): { color: string; coords: [number, number][] }[] {
  const path = route.pathPoints ?? []
  const steps = route.steps ?? []
  const boundaries = route.stepBoundaries ?? []
  if (!steps.length) return [{ color: DEFAULT_COLOR, coords: path.map(toLngLat) }]
  return steps
    .map((step, i) => {
      const start = i === 0 ? 0 : (boundaries[i - 1] ?? 0)
      const end = i < boundaries.length ? boundaries[i] : path.length - 1
      return {
        color: MODE_COLORS[step.mode] ?? DEFAULT_COLOR,
        coords: path.slice(start, end + 1).map(toLngLat),
      }
    })
    .filter((line) => line.coords.length >= 2)
}

/**
 * The route drawn on a map, like the app's preview: each step in its mode's
 * color, start (green) and end (red) pins, and designated stops.
 */
export function RoutePreviewMap({ route }: { route: RouteItem }) {
  const container = useRef<HTMLDivElement>(null)
  const hasLine = (route.pathPoints ?? []).length >= 2

  useEffect(() => {
    const element = container.current
    const path = route.pathPoints ?? []
    if (!element || path.length < 2) return
    const bounds = new maplibregl.LngLatBounds()
    for (const p of path) bounds.extend(toLngLat(p))

    const map = new maplibregl.Map({
      container: element,
      style: STYLE_URL,
      bounds,
      fitBoundsOptions: { padding: 40, maxZoom: 16 },
      attributionControl: { compact: true },
      dragRotate: false,
    })
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    map.on('load', () => {
      // The dialog may still have been opening when the map measured itself.
      map.resize()
      map.fitBounds(bounds, { padding: 40, maxZoom: 16, duration: 0 })
      map.addSource('route', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: stepLines(route).map((line) => ({
            type: 'Feature',
            properties: { color: line.color },
            geometry: { type: 'LineString', coordinates: line.coords },
          })),
        },
      })
      const lineLayout = { 'line-join': 'round', 'line-cap': 'round' } as const
      map.addLayer({
        id: 'route-edge',
        type: 'line',
        source: 'route',
        layout: lineLayout,
        paint: { 'line-color': 'rgba(0,0,0,0.5)', 'line-width': 8 },
      })
      map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: lineLayout,
        paint: { 'line-color': ['get', 'color'], 'line-width': 6 },
      })

      const stops = (route.steps ?? []).flatMap((step) => step.stops ?? [])
      map.addSource('stops', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: stops.map((stop) => ({
            type: 'Feature',
            properties: { name: stop.name ?? '' },
            geometry: { type: 'Point', coordinates: toLngLat(stop) },
          })),
        },
      })
      map.addLayer({
        id: 'stops',
        type: 'circle',
        source: 'stops',
        paint: {
          'circle-radius': 5,
          'circle-color': '#ffffff',
          'circle-stroke-color': '#0B8FD6',
          'circle-stroke-width': 3,
        },
      })
    })

    // A stop's name on hover, like the app's tooltip.
    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false })
    map.on('mouseenter', 'stops', (e) => {
      const feature = e.features?.[0]
      const name = feature?.properties?.name
      if (!feature || !name) return
      map.getCanvas().style.cursor = 'pointer'
      popup
        .setLngLat((feature.geometry as { coordinates: [number, number] }).coordinates)
        .setText(String(name))
        .addTo(map)
    })
    map.on('mouseleave', 'stops', () => {
      map.getCanvas().style.cursor = ''
      popup.remove()
    })

    new maplibregl.Marker({ color: '#16a34a' }).setLngLat(toLngLat(path[0])).addTo(map)
    new maplibregl.Marker({ color: '#dc2626' }).setLngLat(toLngLat(path[path.length - 1])).addTo(map)

    return () => map.remove()
  }, [route])

  if (!hasLine) {
    return <div className="route-preview-map route-preview-map-empty">No drawn line for this route</div>
  }
  return <div ref={container} className="route-preview-map" />
}
