import { Component, OnInit, OnChanges, SimpleChanges, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TripService } from '../../core/services/trip';
import { FriendService } from '../../core/services/friends';
import { TripCreate, TripOut } from '../../shared/models/trip';
import { FriendData } from '../../shared/models/friends';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TripStop, TripStopInputComponent } from '../../shared/components/trip-stop-input/trip-stop-input.component';

type View = 'list' | 'create';

@Component({
  selector: 'app-trip-sidebar',
  templateUrl: './trip-sidebar.html',
  styleUrls: ['./trip-sidebar.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    ProgressSpinnerModule,
    MessageModule,
    ToggleSwitchModule,
    TripStopInputComponent
  ]
})
export class TripSidebarComponent implements OnInit, OnChanges {

  // ── friend mode input ────────────────────────────────────────
  @Input() friend?: FriendData;

  @Output() closed      = new EventEmitter<void>();
  @Output() tripCreated = new EventEmitter<TripOut>();
  @Output() tripSelected = new EventEmitter<number>();

  view: View = 'list';
  trips: TripOut[] = [];
  tripsLoading = false;
  tripsError = '';
  tripStops: TripStop[] = [];
 


  createForm: FormGroup;
  createLoading = false;
  createError = '';

  privacyOptions: Array<{ value: string; label: string; color: string }> = [
    { value: 'public',       label: 'Public',  color: '#27A168' },
    { value: 'friends_only', label: 'Friends', color: '#178FD8' },
    { value: 'private',      label: 'Private', color: '#888780' },
  ];

  selectedTripId?: number;


  get isFriendMode(): boolean {
    return !!this.friend;
  }

  get headerTitle(): string {
    return this.isFriendMode ? this.friend!.username : 'My Trips';
  }

  get headerSubtitle(): string {
    return this.isFriendMode
      ? 'Public trips'
      : 'Select a trip or create a new one';
  }

  get emptyMessage(): string {
    return this.isFriendMode
      ? 'No public trips yet.'
      : 'No trips yet. Create your first one!';
  }

  // ── constructor ──────────────────────────────────────────────

  constructor(
    private fb: FormBuilder,
    private tripService: TripService,
    private friendService: FriendService,
    private cdr: ChangeDetectorRef
  ) {
    this.createForm = this.fb.group({
      title:             ['', [Validators.required, Validators.minLength(2)]],
      privacy:           ['public'],
      include_home_city: [false],
    });
  }


  ngOnInit(): void {
    this.loadTrips();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['friend'] && !changes['friend'].firstChange) {
      this.view = 'list';
      this.selectedTripId = undefined;
      this.loadTrips();
    }
  }


  loadTrips(): void {
    this.tripsLoading = true;
    this.tripsError   = '';
    this.trips        = [];

    const request$ = this.isFriendMode
      ? this.friendService.getFriendTrips(this.friend!.friend_id)
      : this.tripService.getMyTrips();

    request$.subscribe({
      next: (res) => {
        this.trips        = res.trips ?? [];
        this.tripsLoading = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.tripsError   = 'Could not load trips.';
        this.tripsLoading = false;
        this.cdr.markForCheck();
      }
    });
  }


  selectTrip(tripId: number): void {
    this.selectedTripId = tripId;
    this.tripSelected.emit(tripId);
  }



  goToList(): void { this.view = 'list'; }

  close(): void { this.closed.emit(); }

  setPrivacy(value: string): void {
    this.createForm.get('privacy')!.setValue(value);
  }

  get selectedPrivacy(): string {
    return this.createForm.get('privacy')!.value;
  }

 

  onStopsChange(stops: TripStop[]): void {
  this.tripStops = stops;
}
 
// 5. REPLACE submitCreate() with this:
submitCreate(): void {
  if (this.createForm.invalid || this.createLoading) return;
  this.createLoading = true;
  this.createError   = '';
 
  const payload: TripCreate = {
    ...this.createForm.value,
    stops: this.tripStops.map((stop, index) => ({
      label: stop.label,
      lat:   stop.lat,
      lon:   stop.lon,
      order: index,          
    })),
  };
 
  this.tripService.createTrip(payload).subscribe({
    next: (res) => {
      this.createLoading = false;
      if (res.status_code === 201 && res.id) {
        const newTrip: TripOut = { id: res.id, title: res.title!, city: res.city };
        this.trips.unshift(newTrip);
        this.tripCreated.emit(newTrip);
        this.goToList();
      } else {
        this.createError = res.message;
      }
    },
    error: () => {
      this.createLoading = false;
      this.createError   = 'Something went wrong. Try again.';
    }
  });
}

 
// 6. RESET tripStops when going back to list — update goToCreate():
goToCreate(): void {
  this.view = 'create';
  this.tripStops = [];
  this.createForm.reset({ title: '', privacy: 'public', include_home_city: false });
  this.createError = '';
}

}