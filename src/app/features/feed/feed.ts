import { Component, OnInit, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { AuthService } from '../../core/services/auth';
import { FeedService, FeedPost } from '../../core/services/feed';
import { TripService } from '../../core/services/trip';
import { StopsService } from '../../core/services/stop';
import { TripStopInputComponent, TripStop } from '../../shared/components/trip-stop-input/trip-stop-input.component';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { CarouselModule } from 'primeng/carousel';
import { SuggestionsService } from '../../core/services/suggestions';
import { SuggestionUser } from '../../shared/models/user';
import { forkJoin, of, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    BottomNavComponent,
    DialogModule,
    InputTextModule,
    TextareaModule,
    ButtonModule,
    CarouselModule,
    TripStopInputComponent
  ],
  templateUrl: './feed.html',
  styleUrl: './feed.scss'
})
export class FeedComponent implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private feedService = inject(FeedService);
  private tripService = inject(TripService);
  private stopsService = inject(StopsService);
  private suggestionsService = inject(SuggestionsService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);
  private ngZone = inject(NgZone);

  posts: FeedPost[] = [];

  activeView: 'timeline' | 'map' = 'timeline';
  private feedMap!: L.Map;
  private mapInitialized = false;
  private markers: L.Marker[] = [];
  private geocodeCache = new Map<string, { lat: number; lon: number }>();
  private geocodedPostsList: Array<{ post: FeedPost; coords: { lat: number; lon: number } }> = [];

  showPostDetailModal = false;
  selectedPostForModal: FeedPost | null = null;

  currentUser: any = null;
  currentUserInitials = '';

  suggestions: SuggestionUser[] = [];
  suggestionsLoading = false;

  // Create post modal state
  showCreateModal = false;
  newDescription = '';
  newLocation = '';
  newImageUrlsBase64: string[] = [];
  selectedImages: File[] = [];
  imageError = '';



  // Trip Form Properties
  createForm!: FormGroup;
  tripStops: TripStop[] = [];
  privacyOptions = [
    { value: 'public', label: 'Public', color: '#27A168' },
    { value: 'friends_only', label: 'Friends', color: '#178FD8' },
    { value: 'private', label: 'Private', color: '#888780' },
  ];

  // Store active comment input text per post ID
  commentInputs: { [postId: number]: string } = {};

  // For showing a brief heart animation overlay when double clicked
  heartOverlayPostId: number | null = null;

  // Emoji picker state
  activeEmojiPickerPostId: number | null = null;
  popularEmojis = ['😀', '✈️', '🌍', '🏖️', '📸', '😍', '❤️', '🔥', '🙌', '✨', '🍕', '🗺️', '🥳', '😎', '👍', '👏', '🌟', '🍹', '🚗', '🏔️'];

  ngOnInit() {
    this.loadGeocodeCache();
    this.createForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(2)]],
      privacy: ['public'],
      include_home_city: [false],
    });

    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.currentUser = user;
        this.currentUserInitials = (user.firstname?.[0] ?? '') + (user.lastname?.[0] ?? '');
      }

    });

    this.feedService.getPosts().subscribe(posts => {
      this.posts = posts;
      this.cdr.detectChanges();
      if (this.activeView === 'map') {
        this.initMap();
      }
    });

    this.suggestionsLoading = true;
    this.suggestionsService.getSuggestions().subscribe({
      next: (data) => {
        this.suggestions = data;
        if (data && data.length > 0) {
          this.suggestionsLoading = false;
        }
        this.cdr.detectChanges();
      },
      error: () => {
        this.suggestionsLoading = false;
        this.cdr.detectChanges();
      }
    });
    this.suggestionsService.loadSuggestions();

    // Explicitly load feed posts when visiting feed page
    this.loadFeed();
  }

  loadFeed(): void {
    this.feedService.loadPosts();
  }
  connect(userId: number): void {
    // TODO: wire to friendshipService.sendRequest() once implemented
    this.suggestionsService.removeSuggestion(userId);
  }

  getFullName(user: SuggestionUser): string {
    return `${user.firstname} ${user.lastname}`;
  }

  getDisplayName(user: any): string {
    if (!user) return 'Traveler';
    return `${user.firstname} ${user.lastname}`;
  }

  getAvatarInitials(name: string): string {
    if (!name) return 'TR';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }

  onNavTabChanged(tab: NavTab): void {
    if (tab === 'feed') {
      return;
    }
    if (tab === 'profile') {
      this.router.navigate(['/profile']);
      return;
    }
    // Redirect back to map dashboard with the tab selector
    this.router.navigate(['/map'], { queryParams: { tab } });
  }

  toggleLike(post: FeedPost): void {
    const originalHasLiked = post.hasLiked;
    const originalLikesCount = post.likesCount;

    // Optimistically update UI
    post.hasLiked = !post.hasLiked;
    post.likesCount = post.hasLiked ? post.likesCount + 1 : post.likesCount - 1;
    this.cdr.detectChanges();

    const request$ = originalHasLiked
      ? this.feedService.unlikePost(post.id)
      : this.feedService.likePost(post.id);

    request$.subscribe({
      error: (err) => {
        // Rollback on error
        console.error('Failed to update like status', err);
        post.hasLiked = originalHasLiked;
        post.likesCount = originalLikesCount;
        this.cdr.detectChanges();
      }
    });
  }

  onImageDoubleClicked(post: FeedPost): void {
    if (!post.hasLiked) {
      this.toggleLike(post);
    }
    // Show heart pop animation
    this.heartOverlayPostId = post.id;
    setTimeout(() => {
      if (this.heartOverlayPostId === post.id) {
        this.heartOverlayPostId = null;
      }
    }, 800);
  }

  /**
   * Prompt user for confirmation and delete the post via FeedService.
   */
  confirmDelete(post: FeedPost): void {
    if (!confirm('Are you sure you want to delete this post?')) {
      return;
    }
    this.feedService.deletePost(post.id).subscribe({
      next: () => {
        // Refresh feed after deletion
        this.loadFeed();
      },
      error: (err) => {
        console.error('Failed to delete post', err);
      }
    });
  }

  submitComment(post: FeedPost): void {
    const text = this.commentInputs[post.id];
    if (!text || !text.trim()) return;

    // Optimistically add to comments array
    const userFullName = this.getDisplayName(this.currentUser);
    const newComment = {
      username: userFullName,
      text: text,
      createdAt: 'Just now'
    };
    post.comments = [...post.comments, newComment];
    this.commentInputs[post.id] = '';
    this.cdr.detectChanges();

    this.feedService.addComment(post.id, text).subscribe({
      next: (res) => {
        // Backend successfully created the comment
      },
      error: (err) => {
        console.error('Failed to submit comment', err);
        // Rollback on error
        post.comments = post.comments.filter(c => c !== newComment);
        this.commentInputs[post.id] = text;
        this.cdr.detectChanges();
      }
    });
  }

  toggleEmojiPicker(postId: number): void {
    if (this.activeEmojiPickerPostId === postId) {
      this.activeEmojiPickerPostId = null;
    } else {
      this.activeEmojiPickerPostId = postId;
    }
  }

  addEmoji(postId: number, emoji: string): void {
    this.commentInputs[postId] = (this.commentInputs[postId] || '') + emoji;
    this.activeEmojiPickerPostId = null;
  }

  triggerImageUpload(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  onFileSelected(event: any): void {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    this.imageError = '';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (!file.type.startsWith('image/')) {
        this.imageError = 'Please select valid image files only.';
        continue;
      }

      if (file.size > 5 * 1024 * 1024) { // 5MB limit
        this.imageError = 'Images must be under 5MB.';
        continue;
      }

      this.selectedImages.push(file);

      const reader = new FileReader();
      reader.onload = () => {
        this.newImageUrlsBase64.push(reader.result as string);
      };
      reader.onerror = () => {
        this.imageError = 'Error reading file.';
      };
      reader.readAsDataURL(file);
    }
  }

  removeUploadedImage(index: number): void {
    this.newImageUrlsBase64.splice(index, 1);
    this.selectedImages.splice(index, 1);
  }

  onStopsChange(stops: TripStop[]): void {
    this.tripStops = stops;
  }

  setPrivacy(value: string): void {
    this.createForm.get('privacy')!.setValue(value);
  }

  get selectedPrivacy(): string {
    return this.createForm.get('privacy')!.value;
  }

  openCreateModal(): void {
    this.showCreateModal = true;
    this.newDescription = '';
    this.newLocation = '';
    this.newImageUrlsBase64 = [];
    this.selectedImages = [];
    this.imageError = '';
    this.tripStops = [];
    this.createForm?.reset({ title: '', privacy: 'public', include_home_city: false });
  }

  hasAnyStopPhotos(): boolean {
    return this.selectedImages.length > 0;
  }

  submitPost(): void {
    if (this.tripStops.length < 2) {
      this.imageError = 'Please select both from and to cities.';
      return;
    }
    if (this.createForm.invalid) {
      this.imageError = 'Trip Title is required (min 2 chars).';
      return;
    }

    const payload = {
      ...this.createForm.value,
      stops: [
        {
          label: this.tripStops[0].label,
          lat: this.tripStops[0].lat,
          lon: this.tripStops[0].lon,
          order: 0,
        },
        {
          label: this.tripStops[1].label,
          lat: this.tripStops[1].lat,
          lon: this.tripStops[1].lon,
          order: 1,
        }
      ],
    };

    this.tripService.createTrip(payload).subscribe({
      next: (tripRes) => {
        if (tripRes.status_code === 201 && tripRes.id) {
          if (this.selectedImages.length > 0) {
            // Trip created successfully! Retrieve stops from backend to get their database IDs
            this.stopsService.getTripStops(tripRes.id).subscribe({
              next: (stopsRes) => {
                const backendStops = stopsRes.stops || [];
                const destinationStop = backendStops[1] || backendStops.find(bs => bs.title === this.tripStops[1].label);
                if (destinationStop && destinationStop.id) {
                  const stopDescription = this.newDescription.trim() || tripRes.title || 'Trip destination';
                  this.feedService.createStopPost(destinationStop.id, stopDescription, this.selectedImages).subscribe({
                    next: () => {
                      this.showCreateModal = false;
                      this.loadFeed();
                    },
                    error: (err) => {
                      console.error(err);
                      this.imageError = 'Failed to create feed post. Please try again.';
                    }
                  });
                } else {
                  this.showCreateModal = false;
                  this.loadFeed();
                }
              },
              error: (err) => {
                console.error(err);
                this.imageError = 'Failed to retrieve trip stops. Please try again.';
              }
            });
          } else {
            // No photos selected: just close modal and load feed
            this.showCreateModal = false;
            this.loadFeed();
          }
        } else {
          this.imageError = tripRes.message || 'Failed to create trip.';
        }
      },
      error: () => {
        this.imageError = 'Something went wrong while creating the trip. Try again.';
      }
    });
  }

  setActiveView(view: 'timeline' | 'map'): void {
    this.activeView = view;
    if (view === 'map') {
      setTimeout(() => {
        this.initMap();
      }, 50);
    }
  }

  private initMap(): void {
    if (!this.mapInitialized) {
      this.feedMap = L.map('feed-map', {
        zoomAnimation: true,
        fadeAnimation: true,
        minZoom: 2,
        markerZoomAnimation: true,
      }).setView([20, 0], 2);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
      }).addTo(this.feedMap);

      this.mapInitialized = true;
    }

    // Clear existing markers
    this.markers.forEach(m => this.feedMap.removeLayer(m));
    this.markers = [];
    this.geocodedPostsList = [];

    // Load and place markers for all feed posts
    let delay = 0;
    this.posts.forEach((post) => {
      // Prioritize using pre-resolved lat/long coordinates from backend
      if (post.lat !== undefined && post.lat !== null && post.long !== undefined && post.long !== null) {
        const coords = { lat: post.lat, lon: post.long };
        this.geocodedPostsList.push({ post, coords });
        this.redrawMarkers();
        return;
      }

      const location = post.location;
      if (!location) return;

      if (this.geocodeCache.has(location)) {
        // Cached - place immediately
        const coords = this.geocodeCache.get(location)!;
        this.geocodedPostsList.push({ post, coords });
        this.redrawMarkers();
      } else {
        // Not cached - queue with a delay
        setTimeout(() => {
          if (this.activeView !== 'map' || !this.mapInitialized) return;

          this.geocodeLocation(location).subscribe(coords => {
            if (coords) {
              this.geocodedPostsList.push({ post, coords });
              this.redrawMarkers();
            }
          });
        }, delay);
        delay += 1200; // Increment delay by 1.2s to satisfy Nominatim 1 request/sec rate limit
      }
    });

    // Invalidate size to ensure it renders correctly
    setTimeout(() => {
      this.feedMap.invalidateSize();
    }, 100);
  }

  private redrawMarkers(): void {
    // Clear existing markers from map
    this.markers.forEach(m => this.feedMap.removeLayer(m));
    this.markers = [];

    // Group posts that are very close to each other
    const groups: Array<Array<{ post: FeedPost; coords: { lat: number; lon: number } }>> = [];

    this.geocodedPostsList.forEach((item) => {
      let grouped = false;
      for (const group of groups) {
        const first = group[0];
        const dist = this.feedMap.distance(
          [item.coords.lat, item.coords.lon],
          [first.coords.lat, first.coords.lon]
        );
        // If they are closer than 15km, group them to spiderfy
        if (dist < 15000) {
          group.push(item);
          grouped = true;
          break;
        }
      }
      if (!grouped) {
        groups.push([item]);
      }
    });

    // Render each group
    groups.forEach((group) => {
      const N = group.length;
      if (N === 1) {
        const { post, coords } = group[0];
        this.placePostMarkerAtCoords(post, coords.lat, coords.lon);
      } else {
        const centerLat = group.reduce((sum, item) => sum + item.coords.lat, 0) / N;
        const centerLon = group.reduce((sum, item) => sum + item.coords.lon, 0) / N;

        // Spread markers in a circle around the center (0.08 degree radius spacing)
        const radius = 0.08;

        group.forEach((item, i) => {
          const angle = (2 * Math.PI * i) / N;
          const offsetLat = Math.sin(angle) * radius;
          const offsetLon = (Math.cos(angle) * radius) / Math.cos((centerLat * Math.PI) / 180);

          this.placePostMarkerAtCoords(item.post, centerLat + offsetLat, centerLon + offsetLon);
        });
      }
    });
  }

  private placePostMarkerAtCoords(post: FeedPost, lat: number, lon: number): void {
    const colors = ['#f43f5e', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#14b8a6', '#3b82f6'];
    const color = colors[post.id % colors.length];

    // Generate initials fallback if avatar is not present
    const initials = (post.authorName || 'TR').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    const avatarHtml = post.authorAvatar
      ? `<img src="${post.authorAvatar}" style="width: 100%; height: 100%; object-fit: cover;" />`
      : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 600; font-size: 14px;">${initials}</div>`;

    const icon = L.divIcon({
      className: '',
      html: `
        <div class="friend-pin">
          <div class="friend-pin__avatar" style="background: ${color}; border-color: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1.5px ${color}; overflow: hidden; display: flex; align-items: center; justify-content: center;">
            ${avatarHtml}
          </div>
          <div class="friend-pin__tail" style="border-top-color: ${color};"></div>
          <div class="friend-pin__label" style="background: ${color};">${post.authorName}</div>
        </div>
      `,
      iconSize: [90, 72],
      iconAnchor: [45, 50],
      popupAnchor: [0, -72],
    });

    const marker = L.marker([lat, lon], { icon }).addTo(this.feedMap);

    marker.bindTooltip(`${post.location} · ${post.createdAt}`, {
      direction: 'top',
      offset: [0, -60],
      className: 'friend-stop-tooltip'
    });

    marker.on('click', () => {
      this.ngZone.run(() => {
        this.selectedPostForModal = post;
        this.showPostDetailModal = true;
        this.cdr.detectChanges();
      });
    });

    this.markers.push(marker);
  }

  private loadGeocodeCache(): void {
    try {
      const saved = localStorage.getItem('geocode_cache');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(key => {
          this.geocodeCache.set(key, parsed[key]);
        });
      }
    } catch (e) {
      console.error('Failed to load geocode cache', e);
    }
  }

  private saveGeocodeCache(): void {
    try {
      const obj: { [key: string]: { lat: number; lon: number } } = {};
      this.geocodeCache.forEach((value, key) => {
        obj[key] = value;
      });
      localStorage.setItem('geocode_cache', JSON.stringify(obj));
    } catch (e) {
      console.error('Failed to save geocode cache', e);
    }
  }

  geocodeLocation(locationName: string): Observable<{ lat: number; lon: number } | null> {
    if (this.geocodeCache.has(locationName)) {
      return of(this.geocodeCache.get(locationName)!);
    }

    return this.http.get<any[]>('https://nominatim.openstreetmap.org/search', {
      params: {
        q: locationName,
        format: 'json',
        limit: '1'
      }
    }).pipe(
      map(results => {
        if (results && results.length > 0) {
          const coords = { lat: parseFloat(results[0].lat), lon: parseFloat(results[0].lon) };
          this.geocodeCache.set(locationName, coords);
          this.saveGeocodeCache();
          return coords;
        }
        return null;
      }),
      catchError(() => of(null))
    );
  }
}
