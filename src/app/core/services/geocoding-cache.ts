import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

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

  searchAddress(query: string): Observable<NominatimResult[]> {
    const trimmed = query.trim().toLowerCase();
    if (this.suggestionCache.has(trimmed)) {
      return new Observable((observer) => {
        observer.next(this.suggestionCache.get(trimmed)!);
        observer.complete();
      });
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    return this.http.get<NominatimResult[]>(url).pipe(
      map((results) => {
        this.suggestionCache.set(trimmed, results);
        return results;
      })
    );
  }

  getCached(query: string): NominatimResult[] | undefined {
    return this.suggestionCache.get(query.trim().toLowerCase());
  }

  setCache(query: string, results: NominatimResult[]): void {
    this.suggestionCache.set(query.trim().toLowerCase(), results);
  }
}
