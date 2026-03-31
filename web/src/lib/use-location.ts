'use client';

import { useState, useEffect, useCallback } from 'react';
import { zonesApi, type NearestZone } from './api';

interface LocationState {
  lat: number | null;
  lng: number | null;
  nearestZone: NearestZone | null;
  selectedCity: string | null;
  selectedZoneId: string | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
}

const LOCATION_STORAGE_KEY = 'handy_user_location';

function getSavedLocation(): {
  selectedCity?: string;
  selectedZoneId?: string;
  selectedZoneName?: string;
} | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LOCATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLocation(data: {
  selectedCity?: string;
  selectedZoneId?: string;
  selectedZoneName?: string;
}) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCATION_STORAGE_KEY, JSON.stringify(data));
}

export function useLocation() {
  const saved = getSavedLocation();

  const [state, setState] = useState<LocationState>({
    lat: null,
    lng: null,
    nearestZone: null,
    selectedCity: saved?.selectedCity || null,
    selectedZoneId: saved?.selectedZoneId || null,
    loading: false,
    error: null,
    permissionDenied: false,
  });

  // Request GPS position and find nearest zone
  const detectLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'Tu navegador no soporta geolocalización' }));
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 5 * 60 * 1000, // Cache for 5 minutes
        });
      });

      const { latitude: lat, longitude: lng } = position.coords;

      // Find nearest zone from API
      const nearest = await zonesApi.findNearest(lat, lng);

      setState((s) => ({
        ...s,
        lat,
        lng,
        nearestZone: nearest,
        selectedCity: nearest?.city || s.selectedCity,
        selectedZoneId: nearest?.id || s.selectedZoneId,
        loading: false,
        permissionDenied: false,
      }));

      if (nearest) {
        saveLocation({
          selectedCity: nearest.city,
          selectedZoneId: nearest.id,
          selectedZoneName: nearest.name,
        });
      }
    } catch (err: any) {
      const isDenied = err?.code === 1; // PERMISSION_DENIED
      setState((s) => ({
        ...s,
        loading: false,
        error: isDenied
          ? 'Permiso de ubicación denegado'
          : 'No se pudo detectar tu ubicación',
        permissionDenied: isDenied,
      }));
    }
  }, []);

  // Set city manually
  const setCity = useCallback((city: string) => {
    setState((s) => ({
      ...s,
      selectedCity: city,
      selectedZoneId: null, // Reset zone when city changes
    }));
    saveLocation({ selectedCity: city });
  }, []);

  // Set zone manually
  const setZone = useCallback((zoneId: string, zoneName?: string, city?: string) => {
    setState((s) => ({
      ...s,
      selectedZoneId: zoneId,
      selectedCity: city || s.selectedCity,
    }));
    saveLocation({
      selectedCity: city,
      selectedZoneId: zoneId,
      selectedZoneName: zoneName,
    });
  }, []);

  // Clear location filter
  const clearLocation = useCallback(() => {
    setState((s) => ({
      ...s,
      selectedCity: null,
      selectedZoneId: null,
      nearestZone: null,
    }));
    if (typeof window !== 'undefined') {
      localStorage.removeItem(LOCATION_STORAGE_KEY);
    }
  }, []);

  return {
    ...state,
    detectLocation,
    setCity,
    setZone,
    clearLocation,
  };
}

