import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { TripService } from '../../core/services/trip';
import { FriendService } from '../../core/services/friends';
import { StopsService } from '../../core/services/stop';
import { PostService } from '../../core/services/post';
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
import { debounceTime, distinctUntilChanged, switchMap, catchError, map } from 'rxjs/operators';
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
  private suggestionCache = new Map<string, NominatimResult[]>();

  // photos and description for new stop
  stopPhotos: File[] = [];
  stopPhotoPreviews: string[] = [];
  stopDescription = '';

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

  viewFriendProfile(): void {
    if (this.friend) {
      this.router.navigate(['/profile', this.friend.friend_id]);
    }
  }

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private friendService: FriendService,
    private stopsService: StopsService,
    private postService: PostService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {
    this.createForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(2)]],
      privacy: ['public'],
      include_home_city: [false],
    });

    // wire up search for single stop input using Photon with Nominatim fallback & caching
    this.stopSearch$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap((q) => {
        const query = q.trim();
        if (query.length < 2) {
          this.stopSuggestions = [];
          this.stopShowDropdown = false;
          this.stopSearchLoading = false;
          return of([]);
        }

        const cacheKey = query.toLowerCase();
        if (this.suggestionCache.has(cacheKey)) {
          return of(this.suggestionCache.get(cacheKey)!);
        }

        this.stopSearchLoading = true;
        return this.http.get<any>(
          'https://photon.komoot.io/api/',
          { params: { q: query, limit: '5' } }
        ).pipe(
          map((photonRes: any) => {
            const features = photonRes?.features || [];
            const results = features.map((f: any, idx: number) => {
              const name = f.properties?.name || '';
              const city = f.properties?.city || '';
              const country = f.properties?.country || '';
              
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
            this.suggestionCache.set(cacheKey, results);
            return results;
          }),
          catchError(() => {
            // Fallback to Nominatim if Photon fails
            return this.http.get<NominatimResult[]>(
              'https://nominatim.openstreetmap.org/search',
              { params: { q: query, format: 'json', limit: '5', addressdetails: '1' } }
            ).pipe(
              map((nominatimRes: NominatimResult[]) => {
                this.suggestionCache.set(cacheKey, nominatimRes);
                return nominatimRes;
              }),
              catchError(() => of([]))
            );
          })
        );
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
    
    // Clear new stop photos & description
    this.stopPhotos = [];
    this.stopPhotoPreviews = [];
    this.stopDescription = '';
  }

  onStopFilesSelected(event: any): void {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      this.stopPhotos.push(file);
      const reader = new FileReader();
      reader.onload = () => {
        this.stopPhotoPreviews.push(reader.result as string);
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);
    }
  }

  removeStopPhoto(index: number): void {
    this.stopPhotos.splice(index, 1);
    this.stopPhotoPreviews.splice(index, 1);
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

    // 1. Create the stop on the backend
    this.stopsService.createStop(payload, this.activeTrip.id).subscribe({
      next: (createRes: any) => {
        if (createRes.status_code === 201) {
          const stopId = createRes.id;

          const finalizeStopAddition = () => {
            // 2. Fetch all stops to ensure we have the complete, official list from the db
            this.stopsService.getTripStops(this.activeTrip!.id).subscribe({
              next: (getRes: any) => {
                let stops = getRes.stops ?? [];
                
                console.log('Stops loaded from db:', JSON.stringify(stops));

                if (stops.length >= 3) {
                  // The newly created stop is appended at the end of the database results.
                  // We want to insert it between the first stop (From) and the last stop (To).
                  const newStop = stops.pop(); // Remove the newly added stop from the end
                  if (newStop) {
                    // Insert it right before the last stop (which is now the last element in the array)
                    stops.splice(stops.length - 1, 0, newStop);
                    console.log('Stops after shifting newStop:', JSON.stringify(stops));
                  }
                }

                // Update the order properties of all stops to match their new array position (0-indexed)
                stops.forEach((s: any, idx: number) => {
                  s.order = idx;
                });

                // 3. Persist the new sequence to the backend
                const stopIds = stops.map((s: any) => s.id);
                console.log('Sending stopIds to reorderStops:', stopIds);
                this.stopsService.reorderStops(this.activeTrip!.id, stopIds).subscribe({
                  next: (reorderRes) => {
                    console.log('reorderStops response:', reorderRes);
                    this.detailStops = stops;
                    this.stopsReordered.emit(this.detailStops);
                    this.clearStopInput();
                    this.addStopLoading = false;
                    this.cdr.markForCheck();
                  },
                  error: (err) => {
                    console.error('Failed to persist stop order after adding', err);
                    this.addStopError = 'Could not update stop order.';
                    this.addStopLoading = false;
                    this.cdr.markForCheck();
                  }
                });
              },
              error: (err) => {
                console.error('Failed to load stops:', err);
                this.addStopError = 'Failed to reload stops list.';
                this.addStopLoading = false;
                this.cdr.markForCheck();
              }
            });
          };

          // 2. If there are photos or a description, create a post for this stop
          if (this.stopPhotos.length > 0 || this.stopDescription.trim().length > 0) {
            this.postService.createPost(stopId, this.stopDescription, this.stopPhotos).subscribe({
              next: () => {
                finalizeStopAddition();
              },
              error: (err) => {
                console.error('Failed to create post', err);
                this.addStopError = 'Stop added, but failed to upload photos/description.';
                finalizeStopAddition();
              }
            });
          } else {
            finalizeStopAddition();
          }
        } else {
          this.addStopError = createRes.message ?? 'Failed to add stop.';
          this.addStopLoading = false;
          this.cdr.markForCheck();
        }
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
    if (!this.activeTrip) return;
    moveItemInArray(this.detailStops, event.previousIndex, event.currentIndex);
    this.stopsReordered.emit(this.detailStops);

    const stopIds = this.detailStops.map(s => s.id);
    this.stopsService.reorderStops(this.activeTrip.id, stopIds).subscribe({
      error: (err) => console.error('Failed to persist stop order', err)
    });
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