declare namespace google.maps {
  class Geocoder {
    geocode(
      request: { placeId?: string; location?: { lat: number; lng: number } },
      callback: (
        results: Array<{
          formatted_address: string;
          geometry: { location: { lat(): number; lng(): number } };
        }> | null,
        status: string,
      ) => void,
    ): void;
  }

  namespace places {
    class AutocompleteService {
      getPlacePredictions(
        request: {
          input: string;
          componentRestrictions?: { country: string };
        },
        callback: (predictions: AutocompletePrediction[] | null) => void,
      ): void;
    }

    interface AutocompletePrediction {
      place_id: string;
      description: string;
      structured_formatting?: {
        main_text: string;
        secondary_text: string;
      };
    }
  }
}

interface Window {
  google?: typeof google;
}
