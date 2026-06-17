import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  CdkDragDrop,
  DragDropModule,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Subject, of } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  catchError,
  map,
} from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';

export interface TripStop {
  id: string;
  label: string;
  lat: number;
  lon: number;
  photos?: File[];
  description?: string;
}

interface StopRow {
  id: string;
  query: string;
  resolved: TripStop | null;
  suggestions: NominatimResult[];
  showDropdown: boolean;
  loading: boolean;
  photos?: File[];
  photoPreviews?: string[];
  description?: string;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

@Component({
  selector: 'app-trip-stop-input',
  templateUrl: './trip-stop-input.component.html',
  styleUrls: ['./trip-stop-input.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, DragDropModule],
})
export class TripStopInputComponent implements OnDestroy {
  @Input() allowPhotos = false;
  @Input() maxStops = 30;
  @Input() minStops = 2;
  @Output() stopsChange = new EventEmitter<TripStop[]>();

  rows: StopRow[] = [
    this.makeRow(),
    this.makeRow(),
  ];

  private searchTimeouts = new Map<string, any>();
  private suggestionCache = new Map<string, NominatimResult[]>();

  constructor(private http: HttpClient) { }


  private makeRow(): StopRow {
    return {
      id: crypto.randomUUID(),
      query: '',
      resolved: null,
      suggestions: [],
      showDropdown: false,
      loading: false,
      photos: [],
      photoPreviews: [],
      description: '',
    };
  }

  isOrigin(index: number): boolean {
    return index === 0;
  }

  isDestination(index: number): boolean {
    return index === this.rows.length - 1;
  }

  isWaypoint(index: number): boolean {
    return !this.isOrigin(index) && !this.isDestination(index);
  }

  waypointLetter(index: number): string {
    return String.fromCharCode(65 + index - 1); // B, C, D …
  }

  get canAddStop(): boolean {
    return this.rows.length < this.maxStops;
  }

  get showSwap(): boolean {
    return this.rows.length === 2;
  }

  onInput(row: StopRow): void {
    row.resolved = null;

    // Clear any pending timeout for this row
    if (this.searchTimeouts.has(row.id)) {
      clearTimeout(this.searchTimeouts.get(row.id));
    }

    const q = row.query.trim().toLowerCase();

    if (q.length < 2) {
      row.suggestions = [];
      row.showDropdown = false;
      return;
    }

    // Return cached suggestions instantly if available
    if (this.suggestionCache.has(q)) {
      row.suggestions = this.suggestionCache.get(q)!;
      row.showDropdown = row.suggestions.length > 0;
      row.loading = false;
      return;
    }

    row.loading = true;

    // Call Photon API directly for fast, search-as-you-type suggestions with high limits
    const timeoutId = setTimeout(() => {
      this.http
        .get<any>(`https://photon.komoot.io/api/`, {
          params: {
            q: row.query,
            limit: '5'
          }
        })
        .pipe(
          map((photonRes: any) => {
            const features = photonRes?.features || [];
            return features.map((f: any, idx: number) => {
              const name = f.properties?.name || '';
              const city = f.properties?.city || '';
              const country = f.properties?.country || '';
              
              // Avoid repeating city/name if they are identical
              const uniqueParts: string[] = [];
              [name, city, country].forEach(p => {
                if (p && !uniqueParts.includes(p)) {
                  uniqueParts.push(p);
                }
              });
              
              return {
                place_id: idx,
                display_name: uniqueParts.join(', '),
                lat: f.geometry?.coordinates[1]?.toString() || '0',
                lon: f.geometry?.coordinates[0]?.toString() || '0'
              };
            });
          }),
          catchError(() => {
            // Fallback to Nominatim if Photon fails
            return this.http.get<NominatimResult[]>(`https://nominatim.openstreetmap.org/search`, {
              params: {
                q: row.query,
                format: 'json',
                limit: '5',
                addressdetails: '1'
              },
              headers: { Accept: 'application/json' }
            }).pipe(
              catchError(() => of([]))
            );
          })
        )
        .subscribe((results: NominatimResult[]) => {
          row.loading = false;
          row.suggestions = results;
          row.showDropdown = results.length > 0;
          this.suggestionCache.set(q, results);
        });
    }, 300); // 300ms debounce for extremely responsive autocomplete search

    this.searchTimeouts.set(row.id, timeoutId);
  }

  selectSuggestion(row: StopRow, suggestion: NominatimResult): void {
    const parts = suggestion.display_name.split(',');
    const label = parts.slice(0, 2).join(',').trim();

    row.resolved = {
      id: row.id,
      label,
      lat: parseFloat(suggestion.lat),
      lon: parseFloat(suggestion.lon),
    };
    row.query = label;
    row.suggestions = [];
    row.showDropdown = false;

    this.emit();
  }

  clearRow(row: StopRow): void {
    row.query = '';
    row.resolved = null;
    row.suggestions = [];
    row.showDropdown = false;
    row.photos = [];
    row.photoPreviews = [];
    row.description = '';
    this.emit();
  }

  hideDropdown(row: StopRow): void {
    setTimeout(() => {
      row.showDropdown = false;
    }, 150);
  }

  // ── add / remove / swap ──────────────────────────────────────

  addStop(): void {
    if (!this.canAddStop) return;
    // insert before the last (destination)
    const destination = this.rows.pop()!;
    this.rows.push(this.makeRow());
    this.rows.push(destination);
  }

  removeStop(index: number): void {
    if (this.rows.length <= this.minStops) return;
    const row = this.rows[index];
    if (this.searchTimeouts.has(row.id)) {
      clearTimeout(this.searchTimeouts.get(row.id));
      this.searchTimeouts.delete(row.id);
    }
    this.rows.splice(index, 1);
    this.emit();
  }

  swap(): void {
    const [a, b] = [this.rows[0], this.rows[1]];
    [this.rows[0].query, this.rows[1].query] = [b.query, a.query];
    [this.rows[0].resolved, this.rows[1].resolved] = [b.resolved, a.resolved];
    [this.rows[0].photos, this.rows[1].photos] = [b.photos || [], a.photos || []];
    [this.rows[0].photoPreviews, this.rows[1].photoPreviews] = [b.photoPreviews || [], a.photoPreviews || []];
    [this.rows[0].description, this.rows[1].description] = [b.description || '', a.description || ''];
    this.emit();
  }

  // ── drag & drop ──────────────────────────────────────────────

  drop(event: CdkDragDrop<StopRow[]>): void {
    moveItemInArray(this.rows, event.previousIndex, event.currentIndex);
    this.emit();
  }

  // ── stop photo actions ───────────────────────────────────────

  onStopFilesSelected(row: StopRow, event: any): void {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (!row.photos) row.photos = [];
    if (!row.photoPreviews) row.photoPreviews = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      row.photos.push(file);
      const reader = new FileReader();
      reader.onload = () => {
        row.photoPreviews!.push(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
    this.emit();
  }

  removeStopPhoto(row: StopRow, index: number): void {
    if (row.photos) row.photos.splice(index, 1);
    if (row.photoPreviews) row.photoPreviews.splice(index, 1);
    this.emit();
  }

  // ── emit resolved stops ──────────────────────────────────────

  emit(): void {
    const resolved = this.rows
      .filter((r) => r.resolved !== null)
      .map((r) => {
        if (r.resolved) {
          r.resolved.photos = r.photos || [];
          r.resolved.description = r.description || '';
        }
        return r.resolved!;
      });
    this.stopsChange.emit(resolved);
  }

  // ── cleanup ──────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.searchTimeouts.forEach((timeout) => clearTimeout(timeout));
  }
}