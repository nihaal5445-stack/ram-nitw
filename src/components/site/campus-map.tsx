"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MessConfig } from "@/config/messes";
import type { CrowdRow } from "@/lib/crowd";
import { CAMPUS_CENTER } from "@/config/messes";

interface Props {
  messes: MessConfig[];
  selectedId: string | null;
  /** accessible label per mess id, e.g. "IFC-A, confirmed" */
  labels: Record<string, string>;
  onPinClick: (id: string) => void;
  /** live crowd per mess id; colours the pin green / amber / red */
  crowd?: Record<string, CrowdRow> | null;
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function CampusMap({ messes, selectedId, labels, onPinClick, crowd }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<Map<string, L.Marker>>(new Map());
  const onPin = useRef(onPinClick);
  useEffect(() => { onPin.current = onPinClick; }, [onPinClick]);

  // Create the map once.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, {
      center: [CAMPUS_CENTER.lat, CAMPUS_CENTER.lng],
      zoom: 16,
      scrollWheelZoom: false,
      dragging: !L.Browser.mobile, // keep one-finger scrolling usable on phones
    });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);

    for (const mess of messes) {
      const icon = L.divIcon({
        className: "",
        html: `<span class="mess-pin mess-pin--${mess.status}"></span>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });
      const marker = L.marker([mess.location.lat, mess.location.lng], {
        icon,
        alt: labels[mess.id],
        title: labels[mess.id],
        keyboard: true,
      }).addTo(m);
      marker.on("click", () => onPin.current(mess.id));
      markers.current.set(mess.id, marker);
    }
    const group = L.featureGroup([...markers.current.values()]);
    m.fitBounds(group.getBounds().pad(0.25));
    map.current = m;
    const markerStore = markers.current;
    return () => {
      m.remove();
      map.current = null;
      markerStore.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Colour pins by live crowd.
  useEffect(() => {
    markers.current.forEach((marker, id) => {
      const pin = marker.getElement()?.querySelector(".mess-pin");
      if (!pin) return;
      pin.classList.remove("mess-pin--crowd-low", "mess-pin--crowd-moderate", "mess-pin--crowd-busy");
      const r = crowd?.[id];
      if (r && r.level !== "closed") pin.classList.add(`mess-pin--crowd-${r.level}`);
      if (r) marker.getElement()?.setAttribute("title", `${labels[id]}, ${r.level === "closed" ? "closed" : r.pct + "% full"}`);
    });
  }, [crowd, labels]);

  // Reflect selection: highlight pin and pan to it.
  useEffect(() => {
    markers.current.forEach((marker, id) => {
      marker.getElement()?.classList.toggle("mess-pin-selected", id === selectedId);
    });
    const sel = selectedId ? markers.current.get(selectedId) : null;
    if (sel && map.current) {
      map.current.flyTo(sel.getLatLng(), Math.max(map.current.getZoom(), 17), {
        animate: !reduced(),
        duration: 0.8,
      });
    }
  }, [selectedId]);

  return <div ref={el} className="h-full w-full" role="application" aria-label="Campus map" />;
}
