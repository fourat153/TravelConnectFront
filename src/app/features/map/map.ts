import { Component, AfterViewInit, NgZone, ChangeDetectorRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
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
import { filter, take, forkJoin, of, map, switchMap, catchError } from 'rxjs';
import { OnboardingStatus } from '../../shared/enums/onboarding';
import { PrivacyType } from '../../shared/enums/PrivacyType';
import { OnboardingService } from '../../core/services/onboarding';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { FriendService } from '../../core/services/friends';
import { FriendData } from '../../shared/models/friends';

import { environment } from '../../../environments/environment';

interface LatLng {
  lat: number;
  lng: number;
}

@Component({
  selector: 'app-map',
  imports: [
    CommonModule, FormsModule, AutoCompleteModule, DialogModule,
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
  private searchTimeout: any;
  private cdr = inject(ChangeDetectorRef);
  userInitials = '';
  errorMessage: any;
  selectedTripId: number | null = null;
  selectedTrip: any = null;
  private AuthService = inject(AuthService);
  private onboardingService = inject(OnboardingService);
  private router: Router = inject(Router);
  private route = inject(ActivatedRoute);

  selectedFriend?: FriendData;
  isFriendTripsSidebarOpen = false;
  friendPinsVisible = false;

  ngOnInit() {
    this.AuthService.currentUser$
      .pipe(filter(user => !!user), take(1))
      .subscribe((user: any) => {
        this.currentUser = user;
        this.showOnboarding = user!.has_completed_onboarding !== OnboardingStatus.Onboarded;
        this.userInitials = (user.firstname?.[0] ?? '') + (user.lastname?.[0] ?? '');
      });

    this.route.queryParams.subscribe(params => {
      const tab = params['tab'] as NavTab;
      if (tab) {
        setTimeout(() => {
          this.onNavTabChanged(tab);
        }, 400);
      }
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

    this.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  }

  private resizeMap(): void {
    if (this.map) {
      this.map.resize();
    }
  }

  loadFriendPins(): void {
    this.clearFriendPins();
    this.friendPinsVisible = true;

    this.friendService.getMyFriends(1, 50).pipe(
      switchMap((res) => {
        if (!res.data?.length) {
          return of([]);
        }

        const colors = ['#f43f5e', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#14b8a6', '#3b82f6'];

        const friendStopsObservables = res.data.map((friend) => {
          const friendColor = colors[friend.friend_id % colors.length];
          return this.friendService.getFriendTrips(friend.friend_id).pipe(
            switchMap((tripRes) => {
              const trips = tripRes.trips;
              if (!trips || trips.length === 0) {
                return of({ friend, stops: [], color: friendColor });
              }
              const lastTrip = trips[trips.length - 1];
              return this.StopService.getTripStops(lastTrip.id).pipe(
                map((stopsRes) => {
                  const stops = stopsRes.stops || [];
                  stops.sort((a, b) => a.order - b.order);
                  return { friend, stops, color: friendColor };
                }),
                catchError(() => of({ friend, stops: [], color: friendColor }))
              );
            }),
            catchError(() => of({ friend, stops: [], color: friendColor }))
          );
        });

        return forkJoin(friendStopsObservables);
      })
    ).subscribe({
      next: (friendsDataList) => {
        this.renderFriendPins(friendsDataList);
      },
      error: () => {
        this.errorMessage = 'Could not load friends.';
      }
    });
  }

  private renderFriendPins(friendsDataList: Array<{ friend: FriendData; stops: any[]; color: string }>): void {
    const avatarsToPlace: Array<{
      friend: FriendData;
      lat: number;
      lon: number;
      stopTitle: string;
      color: string;
      tripId: number;
      stop: any;
    }> = [];

    friendsDataList.forEach(({ friend, stops, color }) => {
      if (!stops || stops.length === 0) return;

      stops.forEach((stop, index) => {
        const lat = stop.city?.lat;
        const lon = stop.city?.long;
        if (lat === undefined || lon === undefined) return;

        if (index === stops.length - 1) {
          avatarsToPlace.push({
            friend,
            lat,
            lon,
            stopTitle: stop.title,
            color,
            tripId: stop.trip_id,
            stop,
          });
        } else {
          this.ngZone.run(() => {
            this.placeFriendStopPin(friend, lat, lon, stop.title, color, stop.trip_id, stop);
          });
        }
      });
    });

    const groups: Array<typeof avatarsToPlace> = [];

    avatarsToPlace.forEach((avatar) => {
      let grouped = false;
      for (const group of groups) {
        const first = group[0];
        const dist = this.calculateDistance(avatar.lat, avatar.lon, first.lat, first.lon);
        if (dist < 15) { // ~15km
          group.push(avatar);
          grouped = true;
          break;
        }
      }
      if (!grouped) {
        groups.push([avatar]);
      }
    });

    groups.forEach((group) => {
      const N = group.length;
      if (N === 1) {
        const a = group[0];
        this.ngZone.run(() => {
          this.placeFriendPin(a.friend, a.lat, a.lon, a.stopTitle, a.color, a.tripId, a.stop);
        });
      } else {
        const centerLat = group.reduce((sum, a) => sum + a.lat, 0) / N;
        const centerLon = group.reduce((sum, a) => sum + a.lon, 0) / N;

        const radius = 0.15;

        group.forEach((a, i) => {
          const angle = (2 * Math.PI * i) / N;
          const offsetLat = Math.sin(angle) * radius;
          const offsetLon = (Math.cos(angle) * radius) / Math.cos((centerLat * Math.PI) / 180);

          this.ngZone.run(() => {
            this.placeFriendPin(a.friend, centerLat + offsetLat, centerLon + offsetLon, a.stopTitle, a.color, a.tripId, a.stop);
          });
        });
      }
    });
  }

  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private placeFriendPin(friend: FriendData, lat: number, lon: number, stopTitle: string, color: string, tripId: number, stop: any): void {
    const initials = friend.username.slice(0, 2).toUpperCase();

    const el = document.createElement('div');
    el.className = 'friend-pin';
    el.innerHTML = `
      <div class="friend-pin__avatar" style="background: ${color}; border-color: #fff;">${initials}</div>
      <div class="friend-pin__tail" style="border-top-color: ${color};"></div>
      <div class="friend-pin__label" style="background: ${color};">${friend.username}</div>
    `;

    const popup = new mapboxgl.Popup({ offset: 30, closeButton: false }).setText(stopTitle);

    const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([lon, lat])
      .setPopup(popup)
      .addTo(this.map);

    (marker as any).friendId = friend.friend_id;
    (marker as any).isAvatar = true;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ngZone.run(() => {
        this.onFriendPinClicked(friend);
      });
    });

    this.friendPinMarkers.push(marker);
    this.updateFriendPinsVisibility();
  }

  private placeFriendStopPin(friend: FriendData, lat: number, lon: number, stopTitle: string, color: string, tripId: number, stop: any): void {
    const el = document.createElement('div');
    el.style.width = '14px';
    el.style.height = '14px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = color;
    el.style.border = '2.5px solid white';
    el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.3)';
    el.style.cursor = 'pointer';

    const popup = new mapboxgl.Popup({ offset: 15, closeButton: false }).setText(`${friend.username}: ${stopTitle}`);

    const marker = new mapboxgl.Marker({ element: el })
      .setLngLat([lon, lat])
      .setPopup(popup)
      .addTo(this.map);

    (marker as any).friendId = friend.friend_id;
    (marker as any).isAvatar = false;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      this.ngZone.run(() => {
        this.onFriendPinClicked(friend, tripId, stop);
      });
    });

    this.friendPinMarkers.push(marker);
    this.updateFriendPinsVisibility();
  }

  clearFriendPins(): void {
    this.friendPinMarkers.forEach(m => m.remove());
    this.friendPinMarkers = [];
    this.friendPinsVisible = false;
  }

  updateFriendPinsVisibility(): void {
    this.friendPinMarkers.forEach((marker) => {
      const fId = (marker as any).friendId;
      const el = marker.getElement();
      if (!this.selectedFriend) {
        el.style.display = 'block';
        this.updateAvatarHighlight(marker, false);
      } else {
        if (fId === this.selectedFriend.friend_id) {
          el.style.display = 'block';
          const isAvatar = (marker as any).isAvatar;
          this.updateAvatarHighlight(marker, isAvatar);
        } else {
          el.style.display = 'none';
        }
      }
    });
  }

  private updateAvatarHighlight(marker: mapboxgl.Marker, highlight: boolean): void {
    const el = marker.getElement();
    if (!el) return;
    const pinEl = el.classList.contains('friend-pin') ? el : el.querySelector('.friend-pin');
    if (pinEl) {
      if (highlight) {
        pinEl.classList.add('friend-pin--selected');
      } else {
        pinEl.classList.remove('friend-pin--selected');
      }
    }
  }

  clearActiveTripRoute(): void {
    this.selectedTripId = null;
    this.selectedTrip = null;
    this.selectedStop = null;
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

      case 'friends':
        this.isTripSidebarOpen = false;
        this.isFriendTripsSidebarOpen = false;
        this.loadFriendPins();
        break;

      case 'add-stop':
        this.isTripSidebarOpen = false;
        this.isFriendTripsSidebarOpen = false;
        this.addDraggablePin();
        break;

      case 'my-trips':
        this.isFriendTripsSidebarOpen = false;
        this.clearFriendPins();
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

    this.markers.forEach(m => m.remove());
    this.markers = [];
    this.clearRouteLine();

    this.StopService.getTripStops(this.selectedTripId).subscribe({
      next: async (res: any) => {
        if (res.status_code === 200) {
          const stops = res.stops;
          const points: LatLng[] = [];
          const bounds = new mapboxgl.LngLatBounds();

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
            bounds.extend([lng, lat]);

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

          if (points.length > 0) {
            this.map.fitBounds(bounds, { padding: 50 });
          }
        } else {
          this.errorMessage = res.message;
        }
      },
      error: () => {
        this.errorMessage = 'Something went wrong. Please try again.';
      }
    });
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
        .catch((err) => console.error('Error searching location:', err));
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
    this.AuthService.logout().subscribe((res: any) => {
      this.AuthService.currentUser$.next(null);
      this.showProfileMenu = false;
      this.router.navigateByUrl('/auth/login');
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

  get activeStopFriendName(): string {
    if (this.isFriendTripsSidebarOpen && this.selectedFriend) {
      return this.selectedFriend.username;
    }
    return this.currentUser?.username || '';
  }

  get activeStopTripDate(): string {
    return this.selectedTrip?.created_at || '';
  }
}