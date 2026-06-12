import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TripService } from '../../core/services/trip';
import { FriendService } from '../../core/services/friends';
import { StopsService } from '../../core/services/stop';
import { TripOut } from '../../shared/models/trip';
import { StopOut } from '../../shared/models/stop';
import { FriendData } from '../../shared/models/friends';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TripStopInputComponent, TripStop } from '../../shared/components/trip-stop-input/trip-stop-input.component';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { of } from 'rxjs';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

interface ResolvedPlace {
  label: string;
  lat: number;
  lon: number;
}

type View = 'list' | 'detail' | 'create';

@Component({
  selector: 'app-trip-sidebar',
  templateUrl: './trip-sidebar.html',
  styleUrls: ['./trip-sidebar.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    ProgressSpinnerModule,
    MessageModule,
    ToggleSwitchModule,
    TripStopInputComponent,
    DragDropModule,
  ]
})
export class TripSidebarComponent implements OnInit, OnChanges {

  @Input() friend?: FriendData;
  @Input() activeTripId?: number | null;

  @Output() closed = new EventEmitter<void>();
  @Output() tripCreated = new EventEmitter<TripOut>();
  @Output() tripSelected = new EventEmitter<number>();
  @Output() tripObjectSelected = new EventEmitter<TripOut>();
  @Output() stopSelected = new EventEmitter<any>();
  @Output() stopAdded = new EventEmitter<{ lat: number; lon: number; title: string }>();
  @Output() backToList = new EventEmitter<void>();
  @Output() stopsReordered = new EventEmitter<StopOut[]>();
  view: View = 'list';

  // ── list ─────────────────────────────────────────────────────
  trips: TripOut[] = [];
  tripsLoading = false;
  tripsError = '';

  // ── detail ───────────────────────────────────────────────────
  activeTrip?: TripOut;
  detailStops: StopOut[] = [];
  detailLoading = false;
  detailError = '';

  // single stop search
  stopQuery = '';
  stopSuggestions: NominatimResult[] = [];
  stopSearchLoading = false;
  stopShowDropdown = false;
  resolvedPlace: ResolvedPlace | null = null;
  addStopLoading = false;
  addStopError = '';
  private stopSearch$ = new Subject<string>();

  // ── create ───────────────────────────────────────────────────
  createForm: FormGroup;
  createLoading = false;
  createError = '';
  tripStops: TripStop[] = [];

  privacyOptions = [
    { value: 'public', label: 'Public', color: '#27A168' },
    { value: 'friends_only', label: 'Friends', color: '#178FD8' },
    { value: 'private', label: 'Private', color: '#888780' },
  ];

  selectedTripId?: number;

  // Mobile drag-to-dismiss properties
  private startY = 0;
  private isDragging = false;
  translateY = 'translateY(0px)';
  transition = 'none';

  get isFriendMode(): boolean { return !!this.friend; }
  get headerTitle(): string { return this.isFriendMode ? this.friend!.username : 'My Trips'; }
  get headerSubtitle(): string {
    return this.isFriendMode ? 'Public trips' : 'Select a trip or create a new one';
  }

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private friendService: FriendService,
    private stopsService: StopsService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) {
    this.createForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(2)]],
      privacy: ['public'],
      include_home_city: [false],
    });

    // wire up nominatim search for single stop input
    this.stopSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((q) => {
        if (q.trim().length < 2) {
          this.stopSuggestions = [];
          this.stopShowDropdown = false;
          this.stopSearchLoading = false;
          return of([]);
        }
        this.stopSearchLoading = true;
        return this.http.get<NominatimResult[]>(
          'https://nominatim.openstreetmap.org/search',
          { params: { q, format: 'json', limit: '5', addressdetails: '1' } }
        ).pipe(catchError(() => of([])));
      })
    ).subscribe((results: NominatimResult[]) => {
      this.stopSearchLoading = false;
      this.stopSuggestions = results;
      this.stopShowDropdown = results.length > 0;
      this.cdr.markForCheck();
    });
  }

  ngOnInit(): void { this.loadTrips(); }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['friend'] && !changes['friend'].firstChange) {
      this.view = 'list';
      this.selectedTripId = undefined;
      this.activeTrip = undefined;
      this.loadTrips();
    }
    if (changes['activeTripId']) {
      if (this.activeTripId) {
        this.selectedTripId = this.activeTripId;
        const foundTrip = this.trips.find(t => t.id === this.activeTripId);
        if (foundTrip) {
          this.activeTrip = foundTrip;
        } else {
          this.activeTrip = { id: this.activeTripId, title: 'Trip Details' } as TripOut;
        }
        this.openDetail(this.activeTripId);
      } else {
        this.view = 'list';
        this.selectedTripId = undefined;
        this.activeTrip = undefined;
      }
    }
  }

  // ── list ─────────────────────────────────────────────────────

  loadTrips(): void {
    this.tripsLoading = true;
    this.tripsError = '';
    this.trips = [];

    const request$ = this.isFriendMode
      ? this.friendService.getFriendTrips(this.friend!.friend_id)
      : this.tripService.getMyTrips();

    request$.subscribe({
      next: (res) => {
        this.trips = res.trips ?? [];
        this.tripsLoading = false;
        if (this.selectedTripId) {
          const foundTrip = this.trips.find(t => t.id === this.selectedTripId);
          if (foundTrip) {
            this.activeTrip = foundTrip;
          }
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.tripsError = 'Could not load trips.';
        this.tripsLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  selectTrip(trip: TripOut): void {
    this.activeTrip = trip;
    this.selectedTripId = trip.id;
    this.tripSelected.emit(trip.id);
    this.tripObjectSelected.emit(trip);
    this.openDetail(trip.id);
  }

  // ── detail ───────────────────────────────────────────────────

  openDetail(tripId: number): void {
    this.view = 'detail';
    this.detailStops = [];
    this.detailError = '';
    this.detailLoading = true;
    this.clearStopInput();

    this.stopsService.getTripStops(tripId).subscribe({
      next: (res: any) => {
        this.detailStops = res.stops ?? [];
        this.detailLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.detailError = 'Could not load stops.';
        this.detailLoading = false;
        this.cdr.markForCheck();
      }
    });
  }

  // ── single stop search ────────────────────────────────────────

  onStopInput(): void {
    this.resolvedPlace = null;
    this.stopSearch$.next(this.stopQuery);
  }

  selectStopSuggestion(s: NominatimResult): void {
    const parts = s.display_name.split(',');
    const label = parts.slice(0, 2).join(',').trim();

    this.resolvedPlace = { label, lat: parseFloat(s.lat), lon: parseFloat(s.lon) };
    this.stopQuery = label;
    this.stopSuggestions = [];
    this.stopShowDropdown = false;
  }

  hideStopDropdown(): void {
    setTimeout(() => { this.stopShowDropdown = false; }, 150);
  }

  clearStopInput(): void {
    this.stopQuery = '';
    this.resolvedPlace = null;
    this.stopSuggestions = [];
    this.stopShowDropdown = false;
    this.addStopError = '';
  }

  addStop(): void {
    if (!this.resolvedPlace || !this.activeTrip || this.addStopLoading) return;

    this.addStopLoading = true;
    this.addStopError = '';

    const payload = {
      lat: this.resolvedPlace.lat,
      long: this.resolvedPlace.lon,
      title: this.resolvedPlace.label,
      description: '',
    };

    this.stopsService.createStop(payload, this.activeTrip.id).subscribe({
      next: (res: any) => {
        this.addStopLoading = false;
        if (res.status_code === 201) {
          this.detailStops = [
            ...this.detailStops,
            {
              id: res.id,
              trip_id: this.activeTrip!.id,
              title: res.title,
              order: res.order,
              city: res.city,
            } as StopOut,
          ];
          this.stopAdded.emit({
            lat: this.resolvedPlace!.lat,
            lon: this.resolvedPlace!.lon,
            title: this.resolvedPlace!.label,
          });
          this.clearStopInput();
        } else {
          this.addStopError = res.message ?? 'Failed to add stop.';
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.addStopLoading = false;
        this.addStopError = 'Something went wrong. Try again.';
        this.cdr.markForCheck();
      }
    });
  }

  // ── create ───────────────────────────────────────────────────

  onStopsChange(stops: TripStop[]): void {
    this.tripStops = stops;
  }

  goToCreate(): void {
    this.view = 'create';
    this.tripStops = [];
    this.createForm.reset({ title: '', privacy: 'public', include_home_city: false });
    this.createError = '';
  }

  goToList(): void {
    this.view = 'list';
    this.activeTrip = undefined;
    this.loadTrips();
    this.backToList.emit();
  }

  close(): void { this.closed.emit(); }

  onTouchStart(event: TouchEvent): void {
    if (window.innerWidth > 768) return;
    this.startY = event.touches[0].clientY;
    this.isDragging = true;
    this.transition = 'none';
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.isDragging) return;
    const clientY = event.touches[0].clientY;
    const deltaY = clientY - this.startY;
    if (deltaY > 0) {
      this.translateY = `translateY(${deltaY}px)`;
    }
  }

  onTouchEnd(event: TouchEvent): void {
    if (!this.isDragging) return;
    this.isDragging = false;
    const clientY = event.changedTouches[0].clientY;
    const deltaY = clientY - this.startY;

    if (deltaY > 100) {
      this.close();
      setTimeout(() => {
        this.translateY = 'translateY(0px)';
        this.transition = 'none';
      }, 300);
    } else {
      this.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      this.translateY = 'translateY(0px)';
    }
  }

  onStopClick(stop: any): void {
    this.stopSelected.emit(stop);
  }

  onStopDrop(event: CdkDragDrop<StopOut[]>): void {
    moveItemInArray(this.detailStops, event.previousIndex, event.currentIndex);
    this.stopsReordered.emit(this.detailStops);
  }

  setPrivacy(value: string): void {
    this.createForm.get('privacy')!.setValue(value);
  }

  get selectedPrivacy(): string {
    return this.createForm.get('privacy')!.value;
  }

  submitCreate(): void {
    if (this.createForm.invalid || this.createLoading) return;
    this.createLoading = true;
    this.createError = '';

    const payload = {
      ...this.createForm.value,
      stops: this.tripStops.map((stop, index) => ({
        label: stop.label,
        lat: stop.lat,
        lon: stop.lon,
        order: index,
      })),
    };

    this.tripService.createTrip(payload).subscribe({
      next: (res) => {
        this.createLoading = false;
        if (res.status_code === 201 && res.id) {
          const newTrip: TripOut = { id: res.id, title: res.title!, city: res.city, created_at: res.created_at };
          this.trips.unshift(newTrip);
          this.tripCreated.emit(newTrip);
          this.goToList();
        } else {
          this.createError = res.message;
        }
      },
      error: () => {
        this.createLoading = false;
        this.createError = 'Something went wrong. Try again.';
      }
    });
  }

}