import { Component, AfterViewInit, NgZone, ChangeDetectorRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import mapboxgl from 'mapbox-gl';
import { Onboarding } from '../profile/onboarding/onboarding';
import { inject } from '@angular/core';
import { TripSidebarComponent } from '../trip-sidebar/trip-sidebar';
import { StopsService } from '../../core/services/stop';
import { Router, ActivatedRoute } from '@angular/router';

import { AutoCompleteModule } from 'primeng/autocomplete';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';

import { StopSheetComponent } from './stop-sheet/stop-sheet';
import { AuthService } from '../../core/services/auth';
import { filter, take, skip, forkJoin, of, map, switchMap, catchError, debounceTime, distinctUntilChanged } from 'rxjs';
import { OnboardingStatus } from '../../shared/enums/onboarding';
import { PrivacyType } from '../../shared/enums/PrivacyType';
import { OnboardingService } from '../../core/services/onboarding';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { FriendService } from '../../core/services/friends';
import { FriendData } from '../../shared/models/friends';
import { FeedPost, FeedService } from '../../core/services/feed';

import { environment } from '../../../environments/environment';

interface LatLng {
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-map',
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule, AutoCompleteModule, DialogModule,
    InputTextModule, TextareaModule, ButtonModule,
    Onboarding, TripSidebarComponent, StopSheetComponent,
    BottomNavComponent,
  ],
  templateUrl: './map.html',
  styleUrl: './map.scss',
})
export class Map implements AfterViewInit, OnInit {
  @ViewChild(TripSidebarComponent) tripSidebar?: TripSidebarComponent;
  private map!: mapboxgl.Map;
  private markers: mapboxgl.Marker[] = [];
  private activeRouteLayerId = 'trip-route-layer';
  private activeRouteSourceId = 'trip-route-source';
  private draggableMarker: mapboxgl.Marker | null = null;
  private friendPinMarkers: mapboxgl.Marker[] = [];
  private ngZone = inject(NgZone);

  searchControl = new FormControl('');
  private lastSearchedTerm = '';
  selectedStop: any = null;
  searchQuery = '';
  suggestions: any[] = [];
  showOnboarding = false;
  showStopPanel = false;
  pendingLatLng: { lat: number; lng: number } | null = null;
  stopTitle = '';
  stopDescription = '';
  isTripSidebarOpen = false;
  showProfileMenu = false;
  currentUser: any = null;

  private StopService = inject(StopsService);
  private friendService = inject(FriendService);
  private feedService = inject(FeedService);
  private searchTimeout: any;
  private cdr = inject(ChangeDetectorRef);
  userInitials = '';
  errorMessage: any;
  selectedTripId: number | null = null;
  selectedTrip: any = null;
  private pendingTripId: number | null = null;
  private AuthService = inject(AuthService);
  private onboardingService = inject(OnboardingService);
  private router: Router = inject(Router);
  private route = inject(ActivatedRoute);

  selectedFriend?: FriendData;
  isFriendTripsSidebarOpen = false;
  friendPinsVisible = false;

  activeStopOwnerId?: number;
  activeStopOwnerName = '';
  activeStopOwnerProfilePicture = '';

  ngOnInit() {
    this.AuthService.currentUser$
      .pipe(filter(user => !!user), take(1))
      .subscribe((user: any) => {
        this.currentUser = user;
        this.showOnboarding = user!.has_completed_onboarding !== OnboardingStatus.Onboarded;
        this.userInitials = (user.firstname?.[0] ?? '') + (user.lastname?.[0] ?? '');
        if (this.activeStopOwnerId === undefined && !this.selectedFriend) {
          this.activeStopOwnerId = user.id;
          this.activeStopOwnerName = (user.firstname ? `${user.firstname} ${user.lastname || ''}`.trim() : user.username) || '';
          this.activeStopOwnerProfilePicture = user.profile_picture || '';
        }
      });

    this.route.queryParams.subscribe(params => {
      const tab = params['tab'] as NavTab;
      if (tab) {
        setTimeout(() => {
          this.onNavTabChanged(tab);
        }, 400);
      }
      const searchParam = (params['search'] || params['q'] || '').trim();
      if (this.searchControl.value !== searchParam) {
        this.searchControl.setValue(searchParam, { emitEvent: false });
      }
      this.filterMapElements(searchParam);

      const ownerId = params['ownerId'] ? Number(params['ownerId']) : undefined;
      const ownerName = params['ownerName'] || params['friendName'] || '';
      const ownerProfilePicture = params['ownerProfilePicture'] || params['friendProfilePicture'] || '';
      if (ownerId !== undefined && !isNaN(ownerId)) {
        this.activeStopOwnerId = ownerId;
        this.activeStopOwnerName = ownerName;
        this.activeStopOwnerProfilePicture = ownerProfilePicture;
      }

      const tripId = Number(params['tripId']);
      if (Number.isInteger(tripId) && tripId > 0) {
        if (this.map && this.map.isStyleLoaded()) {
          this.onTripSelected(tripId);
        } else {
          this.pendingTripId = tripId;
        }
      }
    });

    this.searchControl.valueChanges
      .pipe(
        debounceTime(400),
        distinctUntilChanged()
      )
      .subscribe(query => {
        const searchTerm = query?.trim() || '';
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { search: searchTerm || null },
          queryParamsHandling: 'merge',
          replaceUrl: true
        });
      });
  }

  ngAfterViewInit() {
    mapboxgl.accessToken = environment.mapboxToken;

    this.map = new mapboxgl.Map({
      container: 'map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [10.1815, 36.8065],
      zoom: 5,
      minZoom: 3
    });

    this.map.on('load', () => {
      if (this.pendingTripId) {
        const tripId = this.pendingTripId;
        this.pendingTripId = null;
        this.onTripSelected(tripId);
      }
    });
  }

  private resizeMap(): void {
    if (this.map) {
      this.map.resize();
    }
  }

  private loadFriendPosts(): void {
    this.clearFriendPins();
    this.friendPinsVisible = true;
    this.feedService.loadPosts();

    forkJoin({
      friends: this.friendService.getMyFriends(1, 50),
      posts: this.feedService.getPosts().pipe(skip(1), take(1))
    }).subscribe({
      next: ({ friends, posts }) => {
        const friendList = friends.data ?? [];
        const friendsById = new globalThis.Map(friendList.map(friend => [friend.friend_id, friend]));
        const friendsByUsername = new globalThis.Map(friendList.map(friend => [friend.username.toLowerCase(), friend]));
        const friendPosts = posts.filter(post => {
          const authorId = post.authorId ?? (post as any).author_id ?? (post as any).user_id ?? (post as any).user?.id;
          const authorName = (post.authorName || (post as any).author_name || (post as any).username || '').toLowerCase();
          if (post.lat === undefined || post.long === undefined) return false;
          return friendsById.has(authorId) || friendsByUsername.has(authorName);
        });

        friendPosts.forEach(post => {
          const authorId = post.authorId ?? (post as any).author_id ?? (post as any).user_id ?? (post as any).user?.id;
          const authorName = (post.authorName || (post as any).author_name || (post as any).username || '').toLowerCase();
          const friend = friendsById.get(authorId)
            ?? friendsByUsername.get(authorName);
          if (!friend || post.lat === undefined || post.long === undefined) return;

          this.placeFriendPostPin(friend, post);
        });
      },
      error: () => {
        this.errorMessage = 'Could not load friends\' posts.';
      }
    });
  }

  private placeFriendPostPin(friend: FriendData, post: FeedPost): void {
    const title = post.description || post.location || 'Travel post';
    const location = post.location || '';
    const initials = friend.username.slice(0, 2).toUpperCase();

    const el = document.createElement('div');
    el.style.width = '42px';
    el.style.height = '42px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#e5e7eb';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.25)';
    el.style.overflow = 'hidden';
    el.style.cursor = 'pointer';
    el.innerHTML = friend.profile_picture
      ? `<img src="${friend.profile_picture}" alt="" style="width: 100%; height: 100%; object-fit: cover;" />`
      : `<span style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; color: #374151; font-weight: 700; font-size: 0.8rem;">${initials}</span>`;

    const popup = new mapboxgl.Popup({ offset: 30, closeButton: false })
      .setText(`${friend.username}: ${title}${location ? ` - ${location}` : ''}`);

    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([post.long!, post.lat!])
      .setPopup(popup)
      .addTo(this.map);

    (marker as any).friendId = friend.friend_id;
    (marker as any).friendName = friend.username;
    (marker as any).stopTitle = title;
    (marker as any).postId = post.id;

    el.addEventListener('click', (event) => {
      event.stopPropagation();
      this.ngZone.run(() => this.openFriendStopSheet(friend, post));
    });

    this.friendPinMarkers.push(marker);
    this.updateFriendPinsVisibility();
  }

  private openFriendStopSheet(friend: FriendData, post: FeedPost): void {
    if (!post.stopId) {
      this.router.navigate(['/post', post.id]);
      return;
    }

    this.selectedFriend = friend;
    this.activeStopOwnerId = friend.friend_id;
    this.activeStopOwnerName = friend.username;
    this.activeStopOwnerProfilePicture = friend.profile_picture || '';
    this.isFriendTripsSidebarOpen = false;
    this.isTripSidebarOpen = false;
    this.selectedStop = {
      id: post.stopId,
      trip_id: post.tripId,
      title: post.location || post.description || 'Travel stop',
      description: post.description,
      city: { lat: post.lat, long: post.long },
    };
    this.cdr.detectChanges();
  }

  onSeeFriendTrip(tripId: number): void {
    this.onTripSelected(tripId);
  }

  clearFriendPins(): void {
    this.friendPinMarkers.forEach(m => m.remove());
    this.friendPinMarkers = [];
    this.friendPinsVisible = false;
  }

  updateFriendPinsVisibility(): void {
    const query = (this.searchControl.value || '').trim().toLowerCase();
    this.friendPinMarkers.forEach((marker) => {
      const fId = (marker as any).friendId;
      const friendName = ((marker as any).friendName || '').toLowerCase();
      const el = marker.getElement();

      const matchesSearch = !query || friendName.includes(query);

      if (!matchesSearch) {
        el.style.display = 'none';
        return;
      }

      if (!this.selectedFriend) {
        el.style.display = 'block';
      } else {
        if (fId === this.selectedFriend.friend_id) {
          el.style.display = 'block';
        } else {
          el.style.display = 'none';
        }
      }
    });
  }

  filterMapElements(query: string): void {
    const term = query.trim();
    if (!term) {
      this.lastSearchedTerm = '';
      this.updateFriendPinsVisibility();
      return;
    }

    if (term === this.lastSearchedTerm) {
      return;
    }

    this.lastSearchedTerm = term;

    this.updateFriendPinsVisibility();

    const matchingMarker = this.friendPinMarkers.find(marker => {
      const friendName = ((marker as any).friendName || '').toLowerCase();
      return friendName.includes(term.toLowerCase());
    });

    if (matchingMarker && this.map) {
      const lngLat = matchingMarker.getLngLat();
      this.map.flyTo({
        center: [lngLat.lng, lngLat.lat],
        zoom: 8,
        essential: true
      });
    }
  }

  clearActiveTripRoute(): void {
    this.selectedTripId = null;
    this.selectedTrip = null;
    this.selectedStop = null;
    this.selectedFriend = undefined;
    this.markers.forEach(m => m.remove());
    this.markers = [];
    this.clearRouteLine();
  }

  private clearRouteLine(): void {
    if (this.map.getLayer(this.activeRouteLayerId)) {
      this.map.removeLayer(this.activeRouteLayerId);
    }
    if (this.map.getSource(this.activeRouteSourceId)) {
      this.map.removeSource(this.activeRouteSourceId);
    }
  }

  onFriendPinClicked(friend: FriendData, tripId?: number, stop?: any): void {
    if (this.selectedFriend && this.selectedFriend.friend_id === friend.friend_id && !stop) {
      this.selectedFriend = undefined;
      this.isFriendTripsSidebarOpen = false;
      this.clearActiveTripRoute();
    } else {
      this.selectedFriend = friend;
      this.activeStopOwnerId = friend.friend_id;
      this.activeStopOwnerName = friend.username;
      this.activeStopOwnerProfilePicture = friend.profile_picture || '';
      this.isFriendTripsSidebarOpen = true;
      this.isTripSidebarOpen = false;
      if (tripId) {
        this.selectedTripId = tripId;
      }
      if (stop) {
        this.selectedStop = stop;
      }
    }
    this.updateFriendPinsVisibility();
    setTimeout(() => this.resizeMap(), 300);
  }

  onNavTabChanged(tab: NavTab): void {
    this.selectedFriend = undefined;
    this.clearActiveTripRoute();

    switch (tab) {
      case 'home':
        this.isTripSidebarOpen = false;
        this.isFriendTripsSidebarOpen = false;
        this.showStopPanel = false;
        this.clearFriendPins();
        if (this.draggableMarker) {
          this.draggableMarker.remove();
          this.draggableMarker = null;
        }
        setTimeout(() => this.resizeMap(), 300);
        break;

      case 'add-stop':
        this.isTripSidebarOpen = false;
        this.isFriendTripsSidebarOpen = false;
        this.addDraggablePin();
        break;

      case 'my-trips':
        this.isFriendTripsSidebarOpen = false;
        this.clearFriendPins();
        if (this.currentUser) {
          this.activeStopOwnerId = this.currentUser.id;
          this.activeStopOwnerName = (this.currentUser.firstname ? `${this.currentUser.firstname} ${this.currentUser.lastname || ''}`.trim() : this.currentUser.username) || '';
          this.activeStopOwnerProfilePicture = this.currentUser.profile_picture || '';
        }
        if (this.isTripSidebarOpen) {
          this.tripSidebar?.loadTrips();
        } else {
          this.openTripSidebar();
        }
        break;

      case 'profile':
        this.router.navigate(['/profile']);
        break;

      case 'feed':
        this.router.navigate(['/feed']);
        break;
    }
  }

  onAnySidebarClosed(): void {
    this.isTripSidebarOpen = false;
    this.isFriendTripsSidebarOpen = false;
    setTimeout(() => this.resizeMap(), 350);
  }

  onBackToList(): void {
    this.selectedTripId = null;
    this.selectedTrip = null;
    this.selectedStop = null;
    this.markers.forEach(m => m.remove());
    this.markers = [];
    this.clearRouteLine();
  }

  openTripSidebar(): void {
    this.isTripSidebarOpen = true;
    setTimeout(() => {
      this.resizeMap();
      window.dispatchEvent(new Event('resize'));
    }, 250);
  }

  onTripSelected(tripId: number): void {
    this.selectedTripId = tripId;
    this.selectedStop = null;

    if (this.selectedFriend) {
      this.activeStopOwnerId = this.selectedFriend.friend_id;
      this.activeStopOwnerName = this.selectedFriend.username;
      this.activeStopOwnerProfilePicture = this.selectedFriend.profile_picture || '';
    } else if (this.activeStopOwnerId === undefined && this.currentUser) {
      this.activeStopOwnerId = this.currentUser.id;
      this.activeStopOwnerName = (this.currentUser.firstname ? `${this.currentUser.firstname} ${this.currentUser.lastname || ''}`.trim() : this.currentUser.username) || '';
      this.activeStopOwnerProfilePicture = this.currentUser.profile_picture || '';
    }

    this.StopService.getTripStops(this.selectedTripId).subscribe({
      next: async (res: any) => {
        if (res.status_code === 200) {
          await this.renderTripStops(res.stops ?? []);
        } else {
          this.errorMessage = res.message;
        }
      },
      error: () => {
        this.errorMessage = 'Something went wrong. Please try again.';
      }
    });
  }

  private async renderTripStops(stops: any[]): Promise<void> {
    this.markers.forEach(marker => marker.remove());
    this.markers = [];
    this.clearRouteLine();

    const points: LatLng[] = [];
    const bounds = new mapboxgl.LngLatBounds();

    stops.forEach(stop => {
      const lat = stop.city?.lat;
      const lng = stop.city?.long;
      if (lat === undefined || lng === undefined) return;

      this.markers.push(this.createTripStopMarker(stop, lat, lng));
      points.push({ lat, lng });
      bounds.extend([lng, lat]);
    });

    if (points.length > 1) {
      await this.drawRoute(points, '#3b82f6');
    }
    if (points.length > 0) {
      this.map.fitBounds(bounds, { padding: 50 });
    }
  }

  private createTripStopMarker(stop: any, lat: number, lng: number): mapboxgl.Marker {
    const element = document.createElement('div');
    element.style.width = '16px';
    element.style.height = '16px';
    element.style.borderRadius = '50%';
    element.style.backgroundColor = '#3b82f6';
    element.style.border = '3px solid white';
    element.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    element.style.cursor = 'pointer';

    const marker = new mapboxgl.Marker({ element })
      .setLngLat([lng, lat])
      .addTo(this.map);

    element.addEventListener('click', () => {
      this.ngZone.run(() => {
        this.selectedStop = stop;
        this.cdr.detectChanges();
      });
    });

    return marker;
  }

  onTripCreated(trip: any): void {
    this.isTripSidebarOpen = false;
    setTimeout(() => this.resizeMap(), 300);
  }

  addDraggablePin(): void {
    if (this.draggableMarker) return;

    const center = this.map.getCenter();

    const el = document.createElement('div');
    el.style.background = '#3b82f6';
    el.style.width = '18px';
    el.style.height = '18px';
    el.style.borderRadius = '50%';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
    el.style.cursor = 'grab';

    this.draggableMarker = new mapboxgl.Marker({ element: el, draggable: true })
      .setLngLat([center.lng, center.lat])
      .addTo(this.map);

    this.draggableMarker.on('dragend', () => {
      const pos = this.draggableMarker!.getLngLat();
      this.pendingLatLng = { lat: pos.lat, lng: pos.lng };
    });

    this.pendingLatLng = { lat: center.lat, lng: center.lng };
    this.showStopPanel = true;
    this.stopTitle = '';
    this.stopDescription = '';
  }

  async confirmStop(): Promise<void> {
    if (!this.pendingLatLng || !this.stopTitle) return;
    const { lat, lng } = this.pendingLatLng;

    if (this.draggableMarker) {
      this.draggableMarker.remove();
      this.draggableMarker = null;
    }

    const el = document.createElement('div');
    el.style.width = '16px';
    el.style.height = '16px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#ef4444';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([lng, lat])
      .addTo(this.map);

    const stopData = {
      lat: this.pendingLatLng.lat,
      long: this.pendingLatLng.lng,
      title: this.stopTitle,
      description: this.stopDescription,
      order: Math.max(1, this.markers.length - 1),
    };

    this.markers.push(marker);
    await this.updatePolyline();

    this.StopService.createStop(stopData, this.selectedTripId!).subscribe({
      next: (res: any) => {
        if (res.status_code !== 200) this.errorMessage = res.message;
      },
      error: () => {
        this.errorMessage = 'Something went wrong. Please try again.';
      }
    });

    this.showStopPanel = false;
    this.pendingLatLng = null;
  }

  cancelStop(): void {
    if (this.draggableMarker) {
      this.draggableMarker.remove();
      this.draggableMarker = null;
    }
    this.showStopPanel = false;
    this.pendingLatLng = null;
  }

  private async getOsrmRoute(points: LatLng[]): Promise<[number, number][]> {
    const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.[0]) return [];

    return data.routes[0].geometry.coordinates as [number, number][];
  }

  private async drawRoute(points: LatLng[], color = '#3b82f6'): Promise<void> {
    this.clearRouteLine();
    if (points.length < 2) return;

    let coordinates: [number, number][] = [];
    try {
      coordinates = await this.getOsrmRoute(points);
      if (coordinates.length === 0) {
        coordinates = points.map(p => [p.lng, p.lat]);
      }
    } catch {
      coordinates = points.map(p => [p.lng, p.lat]);
    }

    const geojson = {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: coordinates
      }
    };

    this.map.addSource(this.activeRouteSourceId, {
      type: 'geojson',
      data: geojson
    });

    this.map.addLayer({
      id: this.activeRouteLayerId,
      type: 'line',
      source: this.activeRouteSourceId,
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': color,
        'line-width': 4,
        'line-opacity': 0.8
      }
    });
  }

  async updatePolyline(): Promise<void> {
    if (this.markers.length < 2) {
      this.clearRouteLine();
      return;
    }
    const points = this.markers.map(m => {
      const pos = m.getLngLat();
      return { lat: pos.lat, lng: pos.lng };
    });
    await this.drawRoute(points);
  }

  onSearch(): void {
    clearTimeout(this.searchTimeout);
    if (!this.searchQuery || this.searchQuery.length < 3) {
      this.suggestions = [];
      return;
    }
    this.searchTimeout = setTimeout(() => {
      fetch(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(this.searchQuery)}&limit=5&access_token=${environment.mapboxToken}`)
        .then(res => res.json())
        .then(data => {
          const features = data?.features || [];
          this.suggestions = features.map((f: any, idx: number) => ({
            place_id: f.id || idx,
            display_name: f.properties?.full_address || f.properties?.name || '',
            lat: f.geometry?.coordinates[1]?.toString() || '0',
            lon: f.geometry?.coordinates[0]?.toString() || '0'
          }));
        })
        .catch(() => { });
    }, 400);
  }

  selectSuggestion(suggestion: any): void {
    if (!suggestion) return;
    this.map.flyTo({
      center: [parseFloat(suggestion.lon), parseFloat(suggestion.lat)],
      zoom: 12
    });
    this.searchQuery = suggestion.display_name;
    this.suggestions = [];
  }

  toggleProfileMenu(): void {
    this.showProfileMenu = !this.showProfileMenu;
  }

  logout(): void {
    this.AuthService.logout().subscribe({
      next: () => {
        this.AuthService.currentUser$.next(null);
        this.showProfileMenu = false;
        this.router.navigateByUrl('/auth/login');
      },
      error: () => {
        this.AuthService.currentUser$.next(null);
        this.showProfileMenu = false;
        this.router.navigateByUrl('/auth/login');
      }
    });
  }

  onOnboardingComplete(data: { lat: number; lon: number; privacy: PrivacyType }): void {
    this.onboardingService.complete(data).subscribe(() => {
      this.showOnboarding = false;
      this.map.flyTo({ center: [data.lon, data.lat], zoom: 10 });
    });
  }

  onStopAdded(stop: any): void {
    const lat = stop.city?.lat ?? stop.lat ?? 0;
    const lon = stop.city?.long ?? stop.long ?? stop.lon ?? 0;

    const el = document.createElement('div');
    el.style.width = '16px';
    el.style.height = '16px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = '#3b82f6';
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([lon, lat])
      .addTo(this.map);

    el.addEventListener('click', () => {
      this.ngZone.run(() => {
        this.selectedStop = stop;
        this.cdr.detectChanges();
      });
    });

    this.markers.push(marker);
    this.updatePolyline();
    if (lon && lat) {
      this.map.panTo([lon, lat]);
    }

    this.selectedStop = stop;
    this.cdr.markForCheck();
  }

  onTripObjectSelected(trip: any): void {
    this.selectedTrip = trip;
  }

  onStopSelectedFromSidebar(stop: any): void {
    this.selectedStop = stop;
    this.cdr.detectChanges();
  }

  async onStopsReordered(stops: any[]): Promise<void> {
    this.markers.forEach(m => m.remove());
    this.markers = [];
    this.clearRouteLine();

    const points: LatLng[] = [];
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const lat = stop.city.lat;
      const lng = stop.city.long;

      const el = document.createElement('div');
      el.style.width = '16px';
      el.style.height = '16px';
      el.style.borderRadius = '50%';
      el.style.backgroundColor = '#3b82f6';
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
      el.style.cursor = 'pointer';

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(this.map);

      this.markers.push(marker);
      points.push({ lat, lng });

      el.addEventListener('click', () => {
        this.ngZone.run(() => {
          this.selectedStop = stop;
          this.cdr.detectChanges();
        });
      });
    }

    if (points.length > 1) {
      await this.drawRoute(points, '#3b82f6');
    }
  }

  onStopSheetClosed(): void {
    this.selectedStop = null;
  }

  get isCurrentStopOwner(): boolean {
    return !this.selectedFriend;
  }

  get activeStopFriendName(): string {
    if (this.selectedFriend) {
      return this.selectedFriend.username;
    }
    return '';
  }

  get activeStopTripDate(): string {
    return this.selectedTrip?.created_at || '';
  }
}