import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps } from "@/components/profile/GoogleMapLocationPicker";

type Props = {
  latitude?: number;
  longitude?: number;
  searching: boolean;
  className?: string;
};

export default function InPersonSearchMap({ latitude, longitude, searching, className = "" }: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [mapError, setMapError] = useState("");
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMapError("إحداثيات عنوان الزيارة غير متوفرة.");
      return;
    }
    if (!apiKey) {
      setMapError("تعذر تحميل الخريطة، لكن ستظل المسافات ظاهرة في نتائج المعلمين.");
      return;
    }

    let active = true;
    setMapError("");
    void loadGoogleMaps(apiKey).then(() => {
      if (!active || !elementRef.current) return;
      const maps = (window as any).google.maps;
      const center = { lat: latitude as number, lng: longitude as number };
      mapRef.current = new maps.Map(elementRef.current, {
        center,
        zoom: 13,
        disableDefaultUI: true,
        clickableIcons: false,
        keyboardShortcuts: false,
        gestureHandling: "cooperative",
        styles: [
          { featureType: "poi", stylers: [{ visibility: "off" }] },
          { featureType: "transit", stylers: [{ visibility: "off" }] },
          { featureType: "landscape", stylers: [{ color: "#edf4ef" }] },
          { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] },
          { featureType: "water", stylers: [{ color: "#dcecf0" }] },
        ],
      });
      markerRef.current = new maps.Marker({
        map: mapRef.current,
        position: center,
        title: "عنوان الزيارة",
        animation: maps.Animation.DROP,
      });
    }).catch(() => {
      if (active) setMapError("تعذر تحميل الخريطة، لكن ستظل المسافات ظاهرة في نتائج المعلمين.");
    });

    return () => {
      active = false;
      markerRef.current?.setMap(null);
      mapRef.current = null;
    };
  }, [apiKey, latitude, longitude]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return;
    map.panTo({ lat: latitude, lng: longitude });
    map.setZoom(searching ? 15 : 13);
    if (markerRef.current) {
      markerRef.current.setAnimation(searching ? (window as any).google.maps.Animation.BOUNCE : null);
    }
  }, [searching, latitude, longitude]);

  return (
    <div className={`overflow-hidden bg-[#eaf3ef] ${className}`} aria-label="خريطة عنوان الزيارة">
      <div ref={elementRef} className={`h-full w-full transition-transform duration-700 ${searching ? "scale-[1.02]" : ""}`} />
      {mapError && (
        <div className="absolute inset-0 grid place-items-center bg-[#eaf3ef] p-5 text-center text-xs text-muted-foreground" role="status">
          <div className="max-w-56 rounded-xl border border-white bg-white/90 p-3 shadow-sm">{mapError}</div>
        </div>
      )}
    </div>
  );
}
