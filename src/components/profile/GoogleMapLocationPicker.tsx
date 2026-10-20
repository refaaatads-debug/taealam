import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPin, Search } from "lucide-react";
import { toast } from "sonner";

export interface MapLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  country: string;
  city: string;
  street: string;
}

interface Props {
  value?: Partial<MapLocation> | null;
  onChange: (location: MapLocation) => void;
  height?: number;
}

let mapsLoader: Promise<void> | undefined;

function loadGoogleMaps(apiKey: string) {
  if (window.google?.maps) return Promise.resolve();
  if (!mapsLoader) {
    mapsLoader = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>("script[data-google-maps]");
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("تعذر تحميل خرائط Google")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.dataset.googleMaps = "true";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=ar&region=SA`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("تعذر تحميل خرائط Google"));
      document.head.appendChild(script);
    });
  }
  return mapsLoader;
}

function locationFromResult(result: any, lat: number, lng: number): MapLocation {
  const parts = result?.address_components ?? [];
  const get = (...types: string[]) => parts.find((part: any) => types.some(type => part.types.includes(type)))?.long_name ?? "";
  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: result?.formatted_address ?? "",
    country: get("country"),
    city: get("locality", "postal_town", "administrative_area_level_2"),
    street: [get("route"), get("street_number")].filter(Boolean).join(" "),
  };
}

export default function GoogleMapLocationPicker({ value, onChange, height = 280 }: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const searchElement = useRef<HTMLInputElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(value?.formattedAddress ?? "");
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    let alive = true;
    if (!apiKey) {
      setError("إعداد خرائط Google غير متوفر في نسخة الموقع الحالية.");
      return;
    }
    loadGoogleMaps(apiKey).then(() => {
      if (!alive || !mapElement.current) return;
      const center = {
        lat: value?.latitude ?? 24.7136,
        lng: value?.longitude ?? 46.6753,
      };
      mapRef.current = new window.google.maps.Map(mapElement.current, {
        center,
        zoom: value?.latitude != null ? 16 : 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      markerRef.current = new window.google.maps.Marker({
        map: mapRef.current,
        position: value?.latitude != null ? center : null,
        draggable: true,
      });
      geocoderRef.current = new window.google.maps.Geocoder();
      const resolvePoint = (lat: number, lng: number) => {
        geocoderRef.current.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
          if (status !== "OK" || !results?.[0]) {
            toast.error("تعذر تحديد عنوان هذا الموقع. يمكنك البحث عن العنوان أو تحريك العلامة.");
            return;
          }
          const location = locationFromResult(results[0], lat, lng);
          setSearch(location.formattedAddress);
          onChange(location);
        });
      };
      mapRef.current.addListener("click", (event: any) => {
        const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        markerRef.current.setPosition(point);
        resolvePoint(point.lat, point.lng);
      });
      markerRef.current.addListener("dragend", (event: any) => resolvePoint(event.latLng.lat(), event.latLng.lng()));
      const autocomplete = new window.google.maps.places.Autocomplete(searchElement.current, {
        fields: ["address_components", "formatted_address", "geometry"],
        types: ["address"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) {
          toast.error("اختر عنواناً من نتائج البحث.");
          return;
        }
        const point = { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() };
        mapRef.current.setCenter(point);
        mapRef.current.setZoom(16);
        markerRef.current.setPosition(point);
        const location = locationFromResult(place, point.lat, point.lng);
        setSearch(location.formattedAddress);
        onChange(location);
      });
      setReady(true);
    }).catch((err: Error) => alive && setError(err.message));
    return () => { alive = false; };
  }, [apiKey]);

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error("ميزة تحديد الموقع غير متاحة في هذا المتصفح.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        mapRef.current?.setCenter(point);
        mapRef.current?.setZoom(16);
        markerRef.current?.setPosition(point);
        geocoderRef.current?.geocode({ location: point }, (results: any[], status: string) => {
          if (status === "OK" && results?.[0]) {
            const location = locationFromResult(results[0], point.lat, point.lng);
            setSearch(location.formattedAddress);
            onChange(location);
          } else toast.error("تعذر قراءة عنوان موقعك.");
        });
      },
      () => toast.error("لم نتمكن من تحديد الموقع. يمكنك البحث عن عنوان أو وضع العلامة يدوياً."),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  return (
    <div className="space-y-2">
      <label className="relative block">
        <Search className="absolute right-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input ref={searchElement} value={search} onChange={event => setSearch(event.target.value)} placeholder="ابحث عن عنوان أو معلم" className="pr-9" aria-label="البحث عن عنوان على الخريطة" />
      </label>
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div>
      ) : (
        <div className="relative overflow-hidden rounded-lg border bg-muted">
          {!ready && <div className="absolute inset-0 z-10 grid place-items-center text-sm text-muted-foreground">جارٍ تحميل الخريطة…</div>}
          <div ref={mapElement} style={{ height }} aria-label="خريطة اختيار الموقع" />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">ابحث عن العنوان أو حرّك العلامة لتحديد الموقع بدقة.</p>
        <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation}><MapPin className="ml-2 h-4 w-4" />استخدم موقعي</Button>
      </div>
    </div>
  );
}
