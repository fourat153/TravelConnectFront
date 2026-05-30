import {
  Component,
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
} from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';

export interface TripStop {
  id: string;
  label: string;
  lat: number;
  lon: number;
}

interface StopRow {
  id: string;
  query: string;
  resolved: TripStop | null;
  suggestions: NominatimResult[];
  showDropdown: boolean;
  loading: boolean;
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
  @Output() stopsChange = new EventEmitter<TripStop[]>();

  readonly MAX_STOPS = 30;
  readonly MIN_STOPS = 2;

  rows: StopRow[] = [
    this.makeRow(),
    this.makeRow(),
  ];

  private searchSubjects = new Map<string, Subject<string>>();

  constructor(private http: HttpClient) {}


  private makeRow(): StopRow {
    return {
      id: crypto.randomUUID(),
      query: '',
      resolved: null,
      suggestions: [],
      showDropdown: false,
      loading: false,
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
    return this.rows.length < this.MAX_STOPS;
  }

  get showSwap(): boolean {
    return this.rows.length === 2;
  }

  onInput(row: StopRow): void {
    row.resolved = null;

    if (!this.searchSubjects.has(row.id)) {
      const subject = new Subject<string>();
      this.searchSubjects.set(row.id, subject);

      subject
        .pipe(
          debounceTime(300),
          distinctUntilChanged(),
          switchMap((q) => {
            if (q.trim().length < 2) {
              row.suggestions = [];
              row.showDropdown = false;
              return of([]);
            }
            row.loading = true;
            return this.http
              .get<NominatimResult[]>(
                `https://nominatim.openstreetmap.org/search`,
                {
                  params: {
                    q,
                    format: 'json',
                    limit: '5',
                    addressdetails: '1',
                  },
                  headers: { Accept: 'application/json' },
                }
              )
              .pipe(catchError(() => of([])));
          })
        )
        .subscribe((results: NominatimResult[]) => {
          row.loading = false;
          row.suggestions = results;
          row.showDropdown = results.length > 0;
        });
    }

    this.searchSubjects.get(row.id)!.next(row.query);
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
    if (this.rows.length <= this.MIN_STOPS) return;
    const row = this.rows[index];
    this.searchSubjects.get(row.id)?.complete();
    this.searchSubjects.delete(row.id);
    this.rows.splice(index, 1);
    this.emit();
  }

  swap(): void {
    const [a, b] = [this.rows[0], this.rows[1]];
    [this.rows[0].query, this.rows[1].query] = [b.query, a.query];
    [this.rows[0].resolved, this.rows[1].resolved] = [b.resolved, a.resolved];
    this.emit();
  }

  // ── drag & drop ──────────────────────────────────────────────

  drop(event: CdkDragDrop<StopRow[]>): void {
    moveItemInArray(this.rows, event.previousIndex, event.currentIndex);
    this.emit();
  }

  // ── emit resolved stops ──────────────────────────────────────

  private emit(): void {
    const resolved = this.rows
      .filter((r) => r.resolved !== null)
      .map((r) => r.resolved!);
    this.stopsChange.emit(resolved);
  }

  // ── cleanup ──────────────────────────────────────────────────

  ngOnDestroy(): void {
    this.searchSubjects.forEach((s) => s.complete());
  }
}