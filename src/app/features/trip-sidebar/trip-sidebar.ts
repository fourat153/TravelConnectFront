import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { TripService } from '../../core/services/trip';
import { FriendService } from '../../core/services/friends';
import { StopsService } from '../../core/services/stop';
import { PostService } from '../../core/services/post';
import { TripOut, TripCreate } from '../../shared/models/trip';
import { StopOut, StopCreate } from '../../shared/models/stop';
import { FriendData } from '../../shared/models/friends';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TripStopInputComponent, TripStop } from '../../shared/components/trip-stop-input/trip-stop-input.component';
import { Subject, forkJoin } from 'rxjs';
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

  // Array of posts to create during stop creation
  stopPosts: {
    description: string;
    photos: File[];
    photoPreviews: string[];
    videos: File[];
    videoPreviews: string[];
  }[] = [];

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
          'https://api.mapbox.com/search/geocode/v6/forward',
          {
            params: {
              q: query,
              limit: '5',
              access_token: environment.mapboxToken
            }
          }
        ).pipe(
          map((mapboxRes: any) => {
            const features = mapboxRes?.features || [];
            const results = features.map((f: any, idx: number) => {
              return {
                place_id: f.id || idx,
                display_name: f.properties?.full_address || f.properties?.name || '',
                lat: f.geometry?.coordinates[1]?.toString() || '0',
                lon: f.geometry?.coordinates[0]?.toString() || '0'
              };
            });
            this.suggestionCache.set(cacheKey, results);
            return results;
          }),
          catchError(() => of([]))
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
    this.stopPosts = [{ description: '', photos: [], photoPreviews: [], videos: [], videoPreviews: [] }];
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
    this.stopPosts.forEach(p => p.videoPreviews.forEach(url => URL.revokeObjectURL(url)));
    this.stopPosts = [];
  }

  addStopPostField(): void {
    this.stopPosts.push({ description: '', photos: [], photoPreviews: [], videos: [], videoPreviews: [] });
    this.cdr.markForCheck();
  }

  removeStopPostField(index: number): void {
    if (this.stopPosts.length <= 1) return; // Keep at least one
    const post = this.stopPosts[index];
    if (post) {
      post.videoPreviews.forEach(url => URL.revokeObjectURL(url));
      this.stopPosts.splice(index, 1);
    }
    this.cdr.markForCheck();
  }

  onStopPostFilesSelected(event: any, postIndex: number): void {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const post = this.stopPosts[postIndex];
    if (!post) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      post.photos.push(file);
      const reader = new FileReader();
      reader.onload = () => {
        post.photoPreviews.push(reader.result as string);
        this.cdr.markForCheck();
      };
      reader.readAsDataURL(file);
    }
  }

  removeStopPostPhoto(postIndex: number, imgIndex: number): void {
    const post = this.stopPosts[postIndex];
    if (post) {
      post.photos.splice(imgIndex, 1);
      post.photoPreviews.splice(imgIndex, 1);
    }
  }

  onStopPostVideoSelected(event: any, postIndex: number): void {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    const post = this.stopPosts[postIndex];
    if (!post) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('video/')) continue;

      // 50MB limit
      if (file.size > 50 * 1024 * 1024) {
        this.addStopError = 'Videos must be under 50MB.';
        continue;
      }

      post.videos.push(file);
      const url = URL.createObjectURL(file);
      post.videoPreviews.push(url);
    }
    this.cdr.markForCheck();
  }

  removeStopPostVideo(postIndex: number, vidIndex: number): void {
    const post = this.stopPosts[postIndex];
    if (post && post.videoPreviews[vidIndex]) {
      URL.revokeObjectURL(post.videoPreviews[vidIndex]);
      post.videos.splice(vidIndex, 1);
      post.videoPreviews.splice(vidIndex, 1);
    }
  }

  addStop(): void {
    if (!this.resolvedPlace || !this.activeTrip || this.addStopLoading) return;

    this.addStopLoading = true;
    this.addStopError = '';

    const payload: StopCreate = {
      lat: this.resolvedPlace.lat,
      long: this.resolvedPlace.lon,
      title: this.resolvedPlace.label,
      description: '',
      order: Math.max(1, this.detailStops.length - 1)
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
                const stops = getRes.stops ?? [];
                console.log('Stops loaded from db:', JSON.stringify(stops));
                this.detailStops = stops;
                this.stopsReordered.emit(this.detailStops);
                this.clearStopInput();
                this.addStopLoading = false;
                this.cdr.markForCheck();
              },
              error: (err) => {
                console.error('Failed to load stops:', err);
                this.addStopError = 'Failed to reload stops list.';
                this.addStopLoading = false;
                this.cdr.markForCheck();
              }
            });
          };

          // 2. Create posts for each activity post that has some details
          const validPosts = this.stopPosts.filter(p => p.description.trim().length > 0 || p.photos.length > 0 || p.videos.length > 0);

          if (validPosts.length > 0) {
            const uploadObservables = validPosts.map(p =>
              this.postService.createPost(stopId, p.description, p.photos, p.videos)
            );

            forkJoin(uploadObservables).subscribe({
              next: () => {
                finalizeStopAddition();
              },
              error: (err: any) => {
                console.error('Failed to create posts', err);
                this.addStopError = 'Stop added, but failed to upload some post details.';
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

    const minIndex = 1;
    const maxIndex = this.detailStops.length - 2;

    if (maxIndex < minIndex) return; // Not enough stops to reorder

    // Constrain the drop index to be within the allowed range
    let targetIndex = event.currentIndex;
    if (targetIndex < minIndex) {
      targetIndex = minIndex;
    } else if (targetIndex > maxIndex) {
      targetIndex = maxIndex;
    }

    if (event.previousIndex !== targetIndex) {
      moveItemInArray(this.detailStops, event.previousIndex, targetIndex);
      this.stopsReordered.emit(this.detailStops);

      const stopIds = this.detailStops.map(s => s.id);
      this.stopsService.reorderStops(this.activeTrip.id, stopIds).subscribe({
        error: (err) => console.error('Failed to persist stop order', err)
      });
    }
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

    const payload: TripCreate = {
      title: this.createForm.value.title,
      privacy: this.createForm.value.privacy,
      from_city: {
        label: this.tripStops[0].label,
        lat: this.tripStops[0].lat,
        lon: this.tripStops[0].lon,
      },
      to_city: {
        label: this.tripStops[1].label,
        lat: this.tripStops[1].lat,
        lon: this.tripStops[1].lon,
      }
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