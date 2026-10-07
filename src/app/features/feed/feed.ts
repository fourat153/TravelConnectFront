import { Component, OnInit, inject, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, FormControl, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { AuthService } from '../../core/services/auth';
import { FirebaseMessagingService } from '../../core/services/firebase-messaging';
import { FeedService, FeedPost, PostComment } from '../../core/services/feed';
import { TripService } from '../../core/services/trip';
import { TripCreate } from '../../shared/models/trip';
import { StopsService } from '../../core/services/stop';
import { TripStopInputComponent, TripStop } from '../../shared/components/trip-stop-input/trip-stop-input.component';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { CarouselModule } from 'primeng/carousel';

import { forkJoin, of, Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { HttpClient } from '@angular/common/http';
import mapboxgl from 'mapbox-gl';
import { environment } from '../../../environments/environment';
import { POPULAR_EMOJIS } from '../../shared/constants/emojis';
import { PostCommentsComponent } from '../../shared/components/post-comments/post-comments';

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
    TripStopInputComponent,
    PostCommentsComponent
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

  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);
  private http = inject(HttpClient);
  private ngZone = inject(NgZone);
  private firebaseMessagingService = inject(FirebaseMessagingService);

  posts: FeedPost[] = [];

  activeView: 'timeline' | 'map' = 'timeline';
  mapSearchControl = new FormControl('');
  private feedMap!: mapboxgl.Map;
  private mapInitialized = false;
  private markers: mapboxgl.Marker[] = [];
  private geocodeCache = new Map<string, { lat: number; lon: number }>();
  private geocodedPostsList: Array<{ post: FeedPost; coords: { lat: number; lon: number } }> = [];

  showPostDetailModal = false;
  selectedPostForModal: FeedPost | null = null;

  get selectedPostTripId(): number | null {
    const post = this.selectedPostForModal as (FeedPost & { trip_id?: number }) | null;
    return post?.tripId ?? post?.trip_id ?? null;
  }

  viewSelectedPostTrip(): void {
    const tripId = this.selectedPostTripId;
    if (!tripId) return;

    const ownerId = this.selectedPostForModal?.authorId ?? (this.selectedPostForModal as any)?.author_id;
    const ownerName = this.selectedPostForModal?.authorName || '';
    const ownerProfilePicture = this.selectedPostForModal?.authorAvatar || (this.selectedPostForModal as any)?.author_avatar || (this.selectedPostForModal as any)?.profile_picture || '';

    this.showPostDetailModal = false;
    this.router.navigate(['/map'], {
      queryParams: {
        tripId,
        ownerId: ownerId ?? null,
        ownerName: ownerName || null,
        ownerProfilePicture: ownerProfilePicture || null
      }
    });
  }

  currentUser: any = null;
  currentUserInitials = '';



  // Create post modal state
  showCreateModal = false;
  newDescription = '';
  newLocation = '';
  newImageUrlsBase64: string[] = [];
  selectedImages: File[] = [];
  imageError = '';

  // Comment / Emoji Picker state
  commentInputs: { [postId: number]: string } = {};
  activeReplyComment: { [postId: number]: PostComment | null } = {};
  activeEmojiPickerPostId: number | null = null;
  popularEmojis = POPULAR_EMOJIS;
  heartOverlayPostId: number | null = null;

  selectedVideo: File | null = null;
  videoPreviewUrl: string | null = null;

  createForm!: FormGroup;
  tripStops: TripStop[] = [];
  privacyOptions = [
    { value: 'public', label: 'Public', color: '#27A168' },
    { value: 'friends_only', label: 'Friends', color: '#178FD8' },
    { value: 'private', label: 'Private', color: '#888780' },
  ];

  ngOnInit() {
    this.createForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(2)]],
      privacy: ['public'],
      include_home_city: [false],
    });

    // Firebase Messaging service token retrieval and registration
    this.firebaseMessagingService.getFCMToken().then(token => {
      if (token) {
        this.firebaseMessagingService.registerToken(token).subscribe({
          next: () => {},
          error: () => {}
        });
      }
    }).catch(() => {});

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

    this.mapSearchControl.valueChanges.subscribe(query => {
      const term = query?.trim() || '';
      if (!term) {
        this.redrawMarkers();
        return;
      }

      const lowerTerm = term.toLowerCase();
      this.markers.forEach(marker => {
        const authorName = ((marker as any).authorName || '').toLowerCase();
        marker.getElement().style.display = authorName.includes(lowerTerm) ? 'block' : 'none';
      });
    });

    this.loadFeed();
  }

  loadFeed(): void {
    this.feedService.loadPosts();
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

    this.router.navigate(['/map'], { queryParams: { tab } });
  }

  toggleLike(post: FeedPost): void {
    const originalHasLiked = post.hasLiked;
    const originalLikesCount = post.likesCount;

    post.hasLiked = !post.hasLiked;
    post.likesCount = post.hasLiked ? post.likesCount + 1 : post.likesCount - 1;
    this.cdr.detectChanges();

    const request$ = originalHasLiked
      ? this.feedService.unlikePost(post.id)
      : this.feedService.likePost(post.id);

    request$.subscribe({
      error: () => {
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
    this.heartOverlayPostId = post.id;
    setTimeout(() => {
      if (this.heartOverlayPostId === post.id) {
        this.heartOverlayPostId = null;
      }
    }, 800);
  }

  confirmDelete(post: FeedPost): void {
    if (!confirm('Are you sure you want to delete this post?')) {
      return;
    }
    this.feedService.deletePost(post.id).subscribe({
      next: () => {
        this.loadFeed();
      },
      error: () => {}
    });
  }

  replyToComment(post: FeedPost, comment: PostComment, inputElem?: HTMLInputElement): void {
    this.activeReplyComment[post.id] = comment;
    if (inputElem) {
      setTimeout(() => inputElem.focus(), 50);
    }
  }

  cancelReply(postId: number): void {
    this.activeReplyComment[postId] = null;
  }

  submitComment(post: FeedPost): void {
    const text = this.commentInputs[post.id];
    if (!text || !text.trim()) return;

    const replyTarget = this.activeReplyComment[post.id];
    const parentId = replyTarget?.id ?? null;
    const userFullName = this.getDisplayName(this.currentUser);

    const newComment: PostComment = {
      username: userFullName,
      text: text,
      createdAt: 'Just now',
      parentId: parentId,
      replyToUsername: replyTarget?.username
    };

    post.comments = [...post.comments, newComment];
    this.commentInputs[post.id] = '';
    this.activeReplyComment[post.id] = null;
    this.cdr.detectChanges();

    this.feedService.addComment(post.id, text, parentId).subscribe({
      next: (res) => {
        if (res && res.id) {
          newComment.id = res.id;
        }
      },
      error: () => {
        post.comments = post.comments.filter(c => c !== newComment);
        this.commentInputs[post.id] = text;
        this.activeReplyComment[post.id] = replyTarget ?? null;
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

      if (file.size > 5 * 1024 * 1024) { 
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
    this.cdr.markForCheck();
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
    this.selectedVideo = null;
    this.videoPreviewUrl = null;
    this.tripStops = [];
    this.createForm?.reset({ title: '', privacy: 'public', include_home_city: false });
  }

  hasAnyStopPhotos(): boolean {
    return this.selectedImages.length > 0;
  }

  onVideoSelected(event: any): void {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      this.imageError = 'Please select a valid video file.';
      return;
    }

    if (file.size > 50 * 1024 * 1024) { 
      this.imageError = 'Video must be under 50MB.';
      return;
    }

    this.imageError = '';
    this.selectedVideo = file;
    this.videoPreviewUrl = URL.createObjectURL(file);
  }

  removeVideo(): void {
    if (this.videoPreviewUrl) {
      URL.revokeObjectURL(this.videoPreviewUrl);
    }
    this.selectedVideo = null;
    this.videoPreviewUrl = null;
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
      next: (tripRes) => {
        if (tripRes.status_code === 201 && tripRes.id) {
          this.showCreateModal = false;
          this.cdr.markForCheck();
          this.loadFeed();
        } else {
          this.imageError = tripRes.message || 'Failed to create trip.';
          this.cdr.markForCheck();
        }
      },
      error: () => {
        this.imageError = 'Something went wrong while creating the trip. Try again.';
        this.cdr.markForCheck();
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
      mapboxgl.accessToken = environment.mapboxToken;

      this.feedMap = new mapboxgl.Map({
        container: 'feed-map',
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [0, 20],
        zoom: 2,
        minZoom: 2
      });

      this.mapInitialized = true;
    }

    this.markers.forEach(m => m.remove());
    this.markers = [];
    this.geocodedPostsList = [];

    let delay = 0;
    this.posts.forEach((post) => {
      if (post.lat !== undefined && post.lat !== null && post.long !== undefined && post.long !== null) {
        const coords = { lat: post.lat, lon: post.long };
        this.geocodedPostsList.push({ post, coords });
        this.redrawMarkers();
        return;
      }

      const location = post.location;
      if (!location) return;

      if (this.geocodeCache.has(location)) {
        const coords = this.geocodeCache.get(location)!;
        this.geocodedPostsList.push({ post, coords });
        this.redrawMarkers();
      } else {
        setTimeout(() => {
          if (this.activeView !== 'map' || !this.mapInitialized) return;

          this.geocodeLocation(location).subscribe((coords: { lat: number; lon: number } | null) => {
            if (coords) {
              this.geocodedPostsList.push({ post, coords });
              this.redrawMarkers();
            }
          });
        }, delay);
        delay += 50;
      }
    });

    setTimeout(() => {
      this.feedMap.resize();
    }, 100);
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private redrawMarkers(): void {
    this.markers.forEach(m => m.remove());
    this.markers = [];

    const groups: Array<Array<{ post: FeedPost; coords: { lat: number; lon: number } }>> = [];

    this.geocodedPostsList.forEach((item) => {
      let grouped = false;
      for (const group of groups) {
        const first = group[0];
        const dist = this.calculateDistance(
          item.coords.lat,
          item.coords.lon,
          first.coords.lat,
          first.coords.lon
        );
        if (dist < 15) {
          group.push(item);
          grouped = true;
          break;
        }
      }
      if (!grouped) {
        groups.push([item]);
      }
    });

    groups.forEach((group) => {
      const N = group.length;
      if (N === 1) {
        const { post, coords } = group[0];
        this.placePostMarkerAtCoords(post, coords.lat, coords.lon);
      } else {
        const centerLat = group.reduce((sum, item) => sum + item.coords.lat, 0) / N;
        const centerLon = group.reduce((sum, item) => sum + item.coords.lon, 0) / N;

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
    const initials = (post.authorName || 'TR').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    const avatarHtml = post.authorAvatar
      ? `<img src="${post.authorAvatar}" alt="" style="width: 100%; height: 100%; object-fit: cover;" />`
      : `<span style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #374151; font-weight: 700; font-size: 0.8rem;">${initials}</span>`;

    const el = document.createElement('div');
    el.style.width = '42px';
    el.style.height = '42px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#e5e7eb';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.25)';
    el.style.overflow = 'hidden';
    el.style.cursor = 'pointer';
    el.innerHTML = avatarHtml;

    const popup = new mapboxgl.Popup({ offset: 30, closeButton: false }).setText(`${post.location} · ${post.createdAt}`);

    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([lon, lat])
      .setPopup(popup)
      .addTo(this.feedMap);

    (marker as any).authorName = post.authorName;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ngZone.run(() => {
        this.selectedPostForModal = post;
        this.showPostDetailModal = true;
        this.cdr.detectChanges();
      });
    });

    this.markers.push(marker);
  }

  geocodeLocation(locationName: string): Observable<{ lat: number; lon: number } | null> {
    if (this.geocodeCache.has(locationName)) {
      return of(this.geocodeCache.get(locationName)!);
    }

    return this.http.get<any>('https://api.mapbox.com/search/geocode/v6/forward', {
      params: {
        q: locationName,
        limit: '1',
        access_token: environment.mapboxToken
      }
    }).pipe(
      map(data => {
        const features = data?.features || [];
        if (features.length > 0) {
          const f = features[0];
          const coords = { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] };
          this.geocodeCache.set(locationName, coords);
          return coords;
        }
        return null;
      }),
      catchError(() => of(null))
    );
  }

  viewProfile(userId?: number): void {
    if (userId) {
      this.showPostDetailModal = false;
      this.router.navigate(['/profile', userId]);
    }
  }
}
