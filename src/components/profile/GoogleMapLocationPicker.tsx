import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin } from "lucide-react";
import { toast } from "sonner";

export interface MapLocation {
  latitude: number;
  longitude: number;
  formattedAddress: string;
  country: string;
  countryCode: string;
  city: string;
  street: string;
}

interface Props {
  value?: Partial<MapLocation> | null;
  onChange: (location: MapLocation | null) => void;
  height?: number;
  searchPlaceholder?: string;
  instruction?: string;
}

let mapsLoader: Promise<void> | undefined;

export function loadGoogleMaps(apiKey: string) {
  if ((window as any).google?.maps) return Promise.resolve();
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
  const city = ["locality", "postal_town", "administrative_area_level_2", "administrative_area_level_1"]
    .map((type) => parts.find((part: any) => part.types.includes(type))?.long_name)
    .find(Boolean) ?? "";
  return {
    latitude: lat,
    longitude: lng,
    formattedAddress: result?.formatted_address ?? "",
    country: get("country"),
    countryCode: parts.find((part: any) => part.types.includes("country"))?.short_name ?? "",
    city,
    street: [get("route"), get("street_number")].filter(Boolean).join(" "),
  };
}

function locationFromPlace(place: any, lat: number, lng: number): MapLocation {
  const addressComponents = (place.addressComponents ?? []).map((part: any) => ({
    long_name: part.longText ?? part.long_name ?? "",
    short_name: part.shortText ?? part.short_name ?? "",
    types: part.types ?? [],
  }));
  return locationFromResult({
    address_components: addressComponents,
    formatted_address: place.formattedAddress ?? "",
  }, lat, lng);
}

export default function GoogleMapLocationPicker({
  value,
  onChange,
  height = 280,
  searchPlaceholder = "ابحث عن مدينة أو عنوان",
  instruction = "اختر المدينة أو العنوان من الاقتراحات، ثم حرّك العلامة لتحديد الموقع بدقة.",
}: Props) {
  const mapElement = useRef<HTMLDivElement>(null);
  const autocompleteContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState(value?.formattedAddress ?? "");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  useEffect(() => {
    let alive = true;
    if (!apiKey) {
      setError("إعداد خرائط Google غير متوفر في نسخة الموقع الحالية.");
      return;
    }
    loadGoogleMaps(apiKey).then(() => {
      if (!alive || !mapElement.current) return;
      const maps = (window as any).google.maps;
      const center = {
        lat: value?.latitude ?? 24.7136,
        lng: value?.longitude ?? 46.6753,
      };
      mapRef.current = new maps.Map(mapElement.current, {
        center,
        zoom: value?.latitude != null ? 16 : 11,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        clickableIcons: false,
      });
      markerRef.current = new maps.Marker({
        map: mapRef.current,
        position: value?.latitude != null ? center : null,
        draggable: true,
      });
      geocoderRef.current = new maps.Geocoder();
      const resolvePoint = (lat: number, lng: number) => {
        geocoderRef.current.geocode({ location: { lat, lng } }, (results: any[], status: string) => {
          if (status !== "OK" || !results?.[0]) {
            toast.error("تعذر تحديد عنوان هذا الموقع. يمكنك البحث عن العنوان أو تحريك العلامة.");
            return;
          }
          const location = locationFromResult(results[0], lat, lng);
          if (location.countryCode !== "SA") {
            onChange(null);
            toast.error("اختر موقعاً داخل المملكة العربية السعودية.");
            return;
          }
          setSearch(location.formattedAddress);
          setSearchResults([]);
          onChange(location);
        });
      };
      mapRef.current.addListener("click", (event: any) => {
        const point = { lat: event.latLng.lat(), lng: event.latLng.lng() };
        markerRef.current.setPosition(point);
        resolvePoint(point.lat, point.lng);
      });
      markerRef.current.addListener("dragend", (event: any) => resolvePoint(event.latLng.lat(), event.latLng.lng()));
      const autocomplete = new maps.places.PlaceAutocompleteElement({
        includedRegionCodes: ["sa"],
      });
      autocomplete.placeholder = searchPlaceholder;
      autocomplete.setAttribute("aria-label", searchPlaceholder);
      autocomplete.value = value?.formattedAddress ?? "";
      autocomplete.setAttribute("dir", "rtl");
      autocomplete.style.width = "100%";
      autocomplete.style.minHeight = "40px";
      autocomplete.style.border = "1px solid hsl(var(--border))";
      autocomplete.style.borderRadius = "0.5rem";
      autocomplete.style.background = "hsl(var(--background))";
      autocomplete.addEventListener("input", () => {
        setSearch(autocomplete.value);
        setSearchResults([]);
        onChange(null);
      });
      autocomplete.addEventListener("gmp-select", async (event: any) => {
        setSearching(true);
        try {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({
            fields: ["addressComponents", "formattedAddress", "location", "types", "viewport"],
          });
          if (!place.location) {
            toast.error("تعذر تحديد إحداثيات نتيجة البحث.");
            return;
          }
          const point = { lat: place.location.lat(), lng: place.location.lng() };
          mapRef.current.setCenter(point);
          mapRef.current.setZoom(place.types?.includes("locality") ? 11 : 16);
          markerRef.current.setPosition(point);
          const location = locationFromPlace(place, point.lat, point.lng);
          if (location.countryCode !== "SA") {
            onChange(null);
            toast.error("اختر موقعاً داخل المملكة العربية السعودية.");
            return;
          }
          setSearch(location.formattedAddress);
          autocomplete.value = location.formattedAddress;
          setSearchResults([]);
          onChange(location);
        } catch {
          toast.error("تعذر تحميل بيانات المكان. تحقق من تفعيل Places API (New) ثم أعد المحاولة.");
        } finally {
          setSearching(false);
        }
      });
      autocompleteContainer.current?.replaceChildren(autocomplete);
      setReady(true);
    }).catch((err: Error) => alive && setError(err.message));
    return () => { alive = false; };
  }, [apiKey]);

  const selectGeocodedResult = (result: any) => {
    const point = result.geometry?.location;
    if (!point) {
      toast.error("تعذر تحديد إحداثيات نتيجة البحث.");
      return;
    }
    const latitude = typeof point.lat === "function" ? point.lat() : point.lat;
    const longitude = typeof point.lng === "function" ? point.lng() : point.lng;
    const location = locationFromResult(result, latitude, longitude);
    if (location.countryCode !== "SA") {
      onChange(null);
      toast.error("اختر موقعاً داخل المملكة العربية السعودية.");
      return;
    }
    mapRef.current?.setCenter({ lat: latitude, lng: longitude });
    mapRef.current?.setZoom(result.types?.includes("locality") ? 11 : 16);
    markerRef.current?.setPosition({ lat: latitude, lng: longitude });
    setSearch(location.formattedAddress);
    setSearchResults([]);
    onChange(location);
  };

  const searchOnMap = () => {
    const query = search.trim();
    if (!query) return toast.error("اكتب اسم المدينة أو العنوان أولاً.");
    if (!geocoderRef.current) return toast.error("الخريطة لم تجهز للبحث بعد.");
    setSearching(true);
    geocoderRef.current.geocode(
      { address: query, componentRestrictions: { country: "SA" } },
      (results: any[], status: string) => {
        setSearching(false);
        const saudiResults = (results || []).filter((result) => {
          const country = result.address_components?.find((part: any) => part.types.includes("country"));
          return country?.short_name === "SA";
        });
        if (status !== "OK" || saudiResults.length === 0) {
          setSearchResults([]);
          toast.error("لم نعثر على مدينة أو عنوان بهذا الاسم داخل السعودية.");
          return;
        }
        if (saudiResults.length === 1) {
          selectGeocodedResult(saudiResults[0]);
        } else {
          setSearchResults(saudiResults.slice(0, 5));
        }
      },
    );
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) return toast.error("ميزة تحديد الموقع غير متاحة في هذا المتصفح.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        geocoderRef.current?.geocode({ location: point }, (results: any[], status: string) => {
          if (status === "OK" && results?.[0]) {
            const location = locationFromResult(results[0], point.lat, point.lng);
            if (location.countryCode !== "SA") {
              onChange(null);
              toast.error("لم يتم تحديد موقع داخل المملكة العربية السعودية.");
              return;
            }
            mapRef.current?.setCenter(point);
            mapRef.current?.setZoom(16);
            markerRef.current?.setPosition(point);
            setSearch(location.formattedAddress);
            setSearchResults([]);
            onChange(location);
          } else toast.error("تعذر قراءة عنوان موقعك.");
        });
      },
      (error: GeolocationPositionError) => {
        if (error.code === error.PERMISSION_DENIED) {
          toast.error("تم رفض إذن الموقع. اسمح للموقع من إعدادات المتصفح، أو ابحث عن العنوان يدوياً.");
        } else if (error.code === error.TIMEOUT) {
          toast.error("انتهت مهلة تحديد الموقع. حاول مرة أخرى أو ابحث عن العنوان يدوياً.");
        } else {
          toast.error("تعذر تحديد موقعك. ابحث عن العنوان يدوياً أو حرّك العلامة على الخريطة.");
        }
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 0 },
    );
  };

  return (
    <div className="space-y-2">
      <div ref={autocompleteContainer} />
      <Button type="button" variant="outline" size="sm" disabled={!ready || searching || !search.trim()} onClick={searchOnMap}>
        {searching ? "جارٍ البحث في الخريطة…" : "ابحث بالخريطة"}
      </Button>
      {searchResults.length > 0 && (
        <ul className="overflow-hidden rounded-md border bg-background shadow-sm" aria-label="نتائج المدن والعناوين">
          {searchResults.map((result, index) => (
            <li key={`${result.place_id || result.formatted_address}-${index}`}>
              <button
                type="button"
                className="w-full px-3 py-2 text-right text-sm hover:bg-muted"
                onClick={() => selectGeocodedResult(result)}
              >
                {result.formatted_address}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{error}</div>
      ) : (
        <div className="relative overflow-hidden rounded-lg border bg-muted">
          {!ready && <div className="absolute inset-0 z-10 grid place-items-center text-sm text-muted-foreground">جارٍ تحميل الخريطة…</div>}
          <div ref={mapElement} style={{ height }} aria-label="خريطة اختيار الموقع" />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{instruction}</p>
        <Button type="button" variant="outline" size="sm" onClick={useCurrentLocation}><MapPin className="ml-2 h-4 w-4" />استخدم موقعي</Button>
      </div>
    </div>
  );
}
