import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { AuthService } from '../../core/services/auth';
import { FeedService, FeedPost } from '../../core/services/feed';
import { TripService } from '../../core/services/trip';
import { TripStopInputComponent, TripStop } from '../../shared/components/trip-stop-input/trip-stop-input.component';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { CarouselModule } from 'primeng/carousel';
import { SuggestionsService } from '../../core/services/suggestions';
import {SuggestionUser } from '../../shared/models/user';
import { forkJoin } from 'rxjs';

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
  private suggestionsService = inject(SuggestionsService);
  private fb = inject(FormBuilder);
  private cdr = inject(ChangeDetectorRef);

  posts: FeedPost[] = [];

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
    return this.tripStops.some(s => s.photos && s.photos.length > 0);
  }

  submitPost(): void {
    const stopsWithPhotos = this.tripStops.filter(s => s.photos && s.photos.length > 0);
    if (stopsWithPhotos.length === 0) {
      this.imageError = 'At least one trip photo is required.';
      return;
    }
    if (this.createForm.invalid) {
      this.imageError = 'Trip Title is required (min 2 chars).';
      return;
    }

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
      next: (tripRes) => {
        if (tripRes.status_code === 201 && tripRes.id) {
          // Trip created successfully! Now create feed posts.
          const postObservables: any[] = [];

          // Create feed post for each stop that has photos
          stopsWithPhotos.forEach(stop => {
            const locationName = stop.label || 'Unknown Location';
            const lat = stop.lat || 0.0;
            const lon = stop.lon || 0.0;
            const images = stop.photos || [];
            const stopDescription = (stop.description || '').trim() || tripRes.title || 'Trip stop';
            postObservables.push(this.feedService.createFeedPost(stopDescription, locationName, lat, lon, images));
          });

          if (postObservables.length > 0) {
            forkJoin(postObservables).subscribe({
              next: () => {
                this.showCreateModal = false;
                this.loadFeed();
              },
              error: (err) => {
                console.error(err);
                this.imageError = 'Failed to create feed posts. Please try again.';
              }
            });
          } else {
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
}
