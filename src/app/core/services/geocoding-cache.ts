import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

@Injectable({
  providedIn: 'root'
})
export class GeocodingCacheService {
  private http = inject(HttpClient);
  private suggestionCache = new Map<string, NominatimResult[]>();

  getCached(query: string): NominatimResult[] | undefined {
    return this.suggestionCache.get(query.trim().toLowerCase());
  }

  setCache(query: string, results: NominatimResult[]): void {
    this.suggestionCache.set(query.trim().toLowerCase(), results);
  }
}
