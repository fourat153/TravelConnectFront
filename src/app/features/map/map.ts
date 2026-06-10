import { Component, AfterViewInit, NgZone, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
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
  private map!: L.Map;
  private markers: L.CircleMarker[] = [];
  private polyline!: L.Polyline;
  private draggableMarker: L.Marker | null = null;
  private friendPinMarkers: L.Marker[] = [];
  private friendPolylines: L.Polyline[] = [];
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
    this.map = L.map('map', {
      zoomAnimation: true,
      fadeAnimation: true,
      minZoom: 3,
      markerZoomAnimation: true,
    }).setView([36.8065, 10.1815], 5);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(this.map);
  }

  // ── Friend pins ──────────────────────────────────────────────

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
        const dist = this.map.distance([avatar.lat, avatar.lon], [first.lat, first.lon]);
        if (dist < 15000) {
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

  private placeFriendPin(friend: FriendData, lat: number, lon: number, stopTitle: string, color: string, tripId: number, stop: any): void {
    const initials = friend.username.slice(0, 2).toUpperCase();

    const icon = L.divIcon({
      className: '',
      html: `
        <div class="friend-pin">
          <div class="friend-pin__avatar" style="background: ${color}; border-color: #fff; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3), 0 0 0 1.5px ${color};">${initials}</div>
          <div class="friend-pin__tail" style="border-top-color: ${color};"></div>
          <div class="friend-pin__label" style="background: ${color};">${friend.username}</div>
        </div>
      `,
      iconSize: [90, 72],
      iconAnchor: [45, 50],
      popupAnchor: [0, -72],
    });

    const marker = L.marker([lat, lon], { icon }).addTo(this.map);
    (marker as any).friendId = friend.friend_id;
    (marker as any).isAvatar = true;

    marker.bindTooltip(stopTitle, {
      direction: 'top',
      offset: [0, -60],
      className: 'friend-stop-tooltip',
    });

    marker.on('click', () => {
      this.ngZone.run(() => {
        this.onFriendPinClicked(friend);
      });
    });

    this.friendPinMarkers.push(marker);
    this.updateFriendPinsVisibility();
  }

  private placeFriendStopPin(friend: FriendData, lat: number, lon: number, stopTitle: string, color: string, tripId: number, stop: any): void {
    const circle = L.circleMarker([lat, lon], {
      radius: 6,
      fillColor: color,
      color: 'white',
      weight: 2.5,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(this.map);
    (circle as any).friendId = friend.friend_id;
    (circle as any).isAvatar = false;

    circle.bindTooltip(`${friend.username}: ${stopTitle}`, {
      direction: 'top',
      offset: [0, -10],
      className: 'friend-stop-tooltip',
    });

    circle.on('click', () => {
      this.ngZone.run(() => {
        this.onFriendPinClicked(friend, tripId, stop);
      });
    });

    this.friendPinMarkers.push(circle as any);
    this.updateFriendPinsVisibility();
  }

  private async drawFriendRoute(points: L.LatLng[], color: string): Promise<L.Polyline | null> {
    if (points.length < 2) return null;

    try {
      const routePoints = await this.getOsrmRoute(points);

      const line: L.LatLngTuple[] = routePoints.length > 0
        ? routePoints
        : points.map(p => [p.lat, p.lng] as L.LatLngTuple);

      return L.polyline(line, {
        color,
        weight: 4,
        opacity: 0.8,
      }).addTo(this.map);

    } catch {
      return L.polyline(
        points.map(p => [p.lat, p.lng] as L.LatLngTuple),
        { color, weight: 3, dashArray: '6, 8', opacity: 0.7 }
      ).addTo(this.map);
    }
  }

  clearFriendPins(): void {
    this.friendPinMarkers.forEach(m => this.map.removeLayer(m));
    this.friendPinMarkers = [];
    this.friendPolylines.forEach(p => this.map.removeLayer(p));
    this.friendPolylines = [];
    this.friendPinsVisible = false;
  }

  updateFriendPinsVisibility(): void {
    this.friendPinMarkers.forEach((marker) => {
      const fId = (marker as any).friendId;
      if (!this.selectedFriend) {
        // No friend is selected, so all should be on the map
        if (!this.map.hasLayer(marker)) {
          marker.addTo(this.map);
        }
        this.updateAvatarHighlight(marker, false);
      } else {
        // A friend is selected. Only show this friend's markers.
        if (fId === this.selectedFriend.friend_id) {
          if (!this.map.hasLayer(marker)) {
            marker.addTo(this.map);
          }
          const isAvatar = (marker as any).isAvatar;
          this.updateAvatarHighlight(marker, isAvatar);
        } else {
          if (this.map.hasLayer(marker)) {
            this.map.removeLayer(marker);
          }
        }
      }
    });
  }

  private updateAvatarHighlight(marker: L.Marker, highlight: boolean): void {
    const el = marker.getElement();
    if (!el) return;
    const pinEl = el.querySelector('.friend-pin');
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
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];
    if (this.polyline) {
      this.map.removeLayer(this.polyline);
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
    setTimeout(() => this.map.invalidateSize({ animate: false }), 300);
  }

  // ── Navigation ───────────────────────────────────────────────

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
          this.map.removeLayer(this.draggableMarker);
          this.draggableMarker = null;
        }
        setTimeout(() => this.map.invalidateSize({ animate: false }), 300);
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
        this.openTripSidebar();
        break;

      case 'profile':
        this.router.navigate(['/profile']);
        break;

      case 'feed':
        this.router.navigate(['/feed']);
        break;
    }
  }

  // ── Sidebar ──────────────────────────────────────────────────

  onAnySidebarClosed(): void {
    this.isTripSidebarOpen = false;
    this.isFriendTripsSidebarOpen = false;
    setTimeout(() => this.map.invalidateSize({ animate: false }), 350);
  }

  onBackToList(): void {
    this.selectedTripId = null;
    this.selectedTrip = null;
    this.selectedStop = null;
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];
    if (this.polyline) {
      this.map.removeLayer(this.polyline);
    }
  }

  openTripSidebar(): void {
    this.isTripSidebarOpen = true;
    setTimeout(() => {
      this.map.invalidateSize({ animate: false });
      window.dispatchEvent(new Event('resize'));
    }, 250);
  }

  onTripSelected(tripId: number): void {
    this.selectedTripId = tripId;
    this.selectedStop = null;

    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];
    if (this.polyline) this.map.removeLayer(this.polyline);

    this.StopService.getTripStops(this.selectedTripId).subscribe({
      next: async (res: any) => {
        if (res.status_code === 200) {
          const cities: L.LatLngTuple[] = [];
          const stops = res.stops;

          for (let i = 0; i < stops.length; i++) {
            const stop = stops[i];
            const circle = L.circleMarker([stop.city.lat, stop.city.long], {
              radius: 8,
              fillColor: '#3b82f6',
              color: 'white',
              weight: 3,
              opacity: 1,
              fillOpacity: 1,
            }).addTo(this.map);

            this.markers.push(circle);
            cities.push([stop.city.lat, stop.city.long]);

            circle.on('click', () => {
              this.ngZone.run(() => {
                this.selectedStop = stop;
                this.cdr.detectChanges();
              });
            });
          }

          if (cities.length > 1) {
            const points = this.markers.map(m => m.getLatLng());
            await this.drawRoute(points, '#3b82f6');
          }

          if (cities.length > 0) {
            this.map.fitBounds(cities, { padding: [50, 50] });
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
    setTimeout(() => this.map.invalidateSize(), 300);
  }

  // ── Stop panel ───────────────────────────────────────────────

  addDraggablePin(): void {
    if (this.draggableMarker) return;

    const center = this.map.getCenter();

    const icon = L.divIcon({
      className: '',
      html: `
        <div style="
          background: #3b82f6;
          width: 18px; height: 18px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.4);
          cursor: grab;
        "></div>
      `,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    this.draggableMarker = L.marker(center, { icon, draggable: true }).addTo(this.map);

    this.draggableMarker.on('dragend', () => {
      const pos = this.draggableMarker!.getLatLng();
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
      this.map.removeLayer(this.draggableMarker);
      this.draggableMarker = null;
    }

    const circle = L.circleMarker([lat, lng], {
      radius: 8,
      fillColor: '#ef4444',
      color: 'white',
      weight: 3,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(this.map);

    const stopData = {
      lat: this.pendingLatLng.lat,
      long: this.pendingLatLng.lng,
      title: this.stopTitle,
      description: this.stopDescription,
    };

    this.markers.push(circle);
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
      this.map.removeLayer(this.draggableMarker);
      this.draggableMarker = null;
    }
    this.showStopPanel = false;
    this.pendingLatLng = null;
  }

  // ── Route / polyline ─────────────────────────────────────────

  private async getOsrmRoute(points: L.LatLng[]): Promise<L.LatLngTuple[]> {
    const coords = points.map(p => `${p.lng},${p.lat}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;

    const res = await fetch(url);
    const data = await res.json();

    if (data.code !== 'Ok' || !data.routes?.[0]) return [];

    return data.routes[0].geometry.coordinates.map(
      ([lng, lat]: [number, number]) => [lat, lng] as L.LatLngTuple
    );
  }

  private async drawRoute(points: L.LatLng[], color = '#3b82f6'): Promise<void> {
    if (this.polyline) this.map.removeLayer(this.polyline);
    if (points.length < 2) return;

    try {
      const routePoints = await this.getOsrmRoute(points);

      const line: L.LatLngTuple[] = routePoints.length > 0
        ? routePoints
        : points.map(p => [p.lat, p.lng] as L.LatLngTuple);

      this.polyline = L.polyline(line, {
        color,
        weight: 4,
        opacity: 0.75,
      }).addTo(this.map);

    } catch {
      this.polyline = L.polyline(
        points.map(p => [p.lat, p.lng] as L.LatLngTuple),
        { color, weight: 3, dashArray: '6, 8', opacity: 0.7 }
      ).addTo(this.map);
    }
  }

  async updatePolyline(): Promise<void> {
    if (this.markers.length < 2) {
      if (this.polyline) this.map.removeLayer(this.polyline);
      return;
    }
    const points = this.markers.map(m => m.getLatLng());
    await this.drawRoute(points);
  }

  // ── Search ───────────────────────────────────────────────────

  onSearch(): void {
    clearTimeout(this.searchTimeout);
    if (!this.searchQuery || this.searchQuery.length < 3) {
      this.suggestions = [];
      return;
    }
    this.searchTimeout = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.searchQuery)}&limit=5`)
        .then(res => res.json())
        .then(results => { this.suggestions = results; });
    }, 400);
  }

  selectSuggestion(suggestion: any): void {
    if (!suggestion) return;
    this.map.setView([parseFloat(suggestion.lat), parseFloat(suggestion.lon)], 12);
    this.searchQuery = suggestion.display_name;
    this.suggestions = [];
  }

  // ── Profile ──────────────────────────────────────────────────

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
      this.map.setView([data.lat, data.lon], 10);
    });
  }
  onStopAdded(stop: { lat: number; lon: number; title: string }): void {
    const circle = L.circleMarker([stop.lat, stop.lon], {
      radius: 8,
      fillColor: '#3b82f6',
      color: 'white',
      weight: 3,
      opacity: 1,
      fillOpacity: 1,
    }).addTo(this.map);

    circle.on('click', () => {
      this.ngZone.run(() => {
        this.selectedStop = { title: stop.title, city: { lat: stop.lat, long: stop.lon } };
        this.cdr.detectChanges();
      });
    });

    this.markers.push(circle);
    this.updatePolyline();
    this.map.panTo([stop.lat, stop.lon]);
  }

  onTripObjectSelected(trip: any): void {
    this.selectedTrip = trip;
  }

  onStopSelectedFromSidebar(stop: any): void {
    this.selectedStop = stop;
    this.cdr.detectChanges();
  }

  async onStopsReordered(stops: any[]): Promise<void> {
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];
    if (this.polyline) this.map.removeLayer(this.polyline);

    const cities: L.LatLngTuple[] = [];
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const circle = L.circleMarker([stop.city.lat, stop.city.long], {
        radius: 8,
        fillColor: '#3b82f6',
        color: 'white',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(this.map);

      this.markers.push(circle);
      cities.push([stop.city.lat, stop.city.long]);

      circle.on('click', () => {
        this.ngZone.run(() => {
          this.selectedStop = stop;
          this.cdr.detectChanges();
        });
      });
    }

    if (cities.length > 1) {
      const points = this.markers.map(m => m.getLatLng());
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