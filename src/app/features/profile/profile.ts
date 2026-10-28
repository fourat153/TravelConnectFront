import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { AuthService } from '../../core/services/auth';
import { FeedService, FeedPost } from '../../core/services/feed';
import { User } from '../../shared/models/user';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { CarouselModule } from 'primeng/carousel';
import { environment } from '../../../environments/environment';

import { PostCommentsComponent } from '../../shared/components/post-comments/post-comments';
import { FriendService } from '../../core/services/friends';
import { RelationshipStatus } from '../../shared/models/friends';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, BottomNavComponent, ButtonModule, DialogModule, CarouselModule, PostCommentsComponent],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private route = inject(ActivatedRoute);
  private feedService = inject(FeedService);
  private friendService = inject(FriendService);

  user: User | null = null;
  userInitials = '';

  isOwnProfile = true;
  visitedUser: User | null = null;
  visitedUserInitials = '';
  posts: FeedPost[] = [];
  postsLoading = false;
  relationshipStatus: RelationshipStatus | null = null;
  relationshipLoading = false;
  relationshipActionLoading = false;
  relationshipRequestId: number | null = null;

  showPostDetailModal = false;
  selectedPostForModal: FeedPost | null = null;
  heartOverlayPostId: number | null = null;

  isEditMode = false;
  editForm = {
    firstname: '',
    lastname: '',
    email: '',
    gender: '',
    phone_number: '',
    city_lat: null as number | null,
    city_lon: null as number | null,
  };

  citySearchQuery = '';
  citySuggestions: any[] = [];
  selectedCity: any = null;
  private searchTimeout: any;

  selectedFile: File | null = null;
  imagePreview: string | null = null;
  errorMessage = '';
  successMessage = '';
  isSaving = false;

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const idParam = params.get('id');
      const visitedUserId = idParam ? parseInt(idParam, 10) : null;

      this.authService.currentUser$.subscribe((currentUser) => {
        if (currentUser) {
          if (!visitedUserId || visitedUserId === currentUser.id) {
            this.isOwnProfile = true;
            this.user = currentUser;
            this.userInitials =
              (currentUser.firstname?.[0] ?? '') + (currentUser.lastname?.[0] ?? '');
            this.resetForm();
            this.fetchUserCity();
            this.loadUserPosts(currentUser.id);
          } else {
            this.isOwnProfile = false;
            this.user = currentUser;
            this.userInitials =
              (currentUser.firstname?.[0] ?? '') + (currentUser.lastname?.[0] ?? '');
            this.fetchVisitedUser(visitedUserId);
          }
        } else {
          // Fetch current user if not loaded in BehaviorSubject
          this.authService.fetchCurrentUser().subscribe({
            error: () => {}
          });
        }
      });
    });
  }

  fetchUserCity() {
    this.authService.getUserCity().subscribe({
      next: (res: any) => {
        if (res && res.lat && res.long) {
          this.editForm.city_lat = res.lat;
          this.editForm.city_lon = res.long;
          // Reverse geocode to get a readable name for the city query
          this.reverseGeocode(res.lat, res.long);
        }
      },
      error: () => {},
    });
  }

  reverseGeocode(lat: number, lon: number) {
    fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lon}&latitude=${lat}&access_token=${environment.mapboxToken}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.features && data.features.length > 0) {
          const feature = data.features[0];
          const cityName = feature.properties?.name || feature.properties?.full_address || '';
          this.citySearchQuery = cityName;
          this.cdr.detectChanges();
        }
      })
      .catch(() => {});
  }

  resetForm() {
    if (this.user) {
      this.editForm.firstname = this.user.firstname || '';
      this.editForm.lastname = this.user.lastname || '';
      this.editForm.email = this.user.email || '';
      this.editForm.gender = this.user.gender || '';
      this.editForm.phone_number = this.user.phone_number || '';
      this.imagePreview = this.user.profile_picture || null;
      this.selectedFile = null;
    }
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    if (!this.isEditMode) {
      this.resetForm();
      this.fetchUserCity();
    }
    this.errorMessage = '';
    this.successMessage = '';
  }

  onCitySearch() {
    clearTimeout(this.searchTimeout);
    if (!this.citySearchQuery || this.citySearchQuery.length < 3) {
      this.citySuggestions = [];
      return;
    }
    this.searchTimeout = setTimeout(() => {
      fetch(
        `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(
          this.citySearchQuery
        )}&limit=5&access_token=${environment.mapboxToken}`
      )
        .then((res) => res.json())
        .then((data) => {
          const features = data?.features || [];
          this.citySuggestions = features.map((f: any, idx: number) => ({
            place_id: f.id || idx,
            display_name: f.properties?.full_address || f.properties?.name || '',
            lat: f.geometry?.coordinates[1]?.toString() || '0',
            lon: f.geometry?.coordinates[0]?.toString() || '0'
          }));
          this.cdr.detectChanges();
        })
        .catch(() => {});
    }, 400);
  }

  selectCity(suggestion: any) {
    this.selectedCity = suggestion;
    this.editForm.city_lat = parseFloat(suggestion.lat);
    this.editForm.city_lon = parseFloat(suggestion.lon);
    this.citySearchQuery = suggestion.display_name.split(',')[0];
    this.citySuggestions = [];
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        this.errorMessage = 'Please select a valid image file.';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        this.errorMessage = 'Image size should be less than 5MB.';
        return;
      }
      this.selectedFile = file;
      this.errorMessage = '';

      const reader = new FileReader();
      reader.onload = () => {
        this.imagePreview = reader.result as string;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  triggerFileInput(fileInput: HTMLInputElement) {
    if (this.isEditMode) {
      fileInput.click();
    }
  }

  saveProfile() {
    if (!this.editForm.firstname || !this.editForm.lastname || !this.editForm.email) {
      this.errorMessage = 'First name, last name, and email are required.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService
      .updateProfile({
        firstname: this.editForm.firstname,
        lastname: this.editForm.lastname,
        email: this.editForm.email,
        gender: this.editForm.gender,
        phone_number: this.editForm.phone_number,
        city_lat: this.editForm.city_lat ?? undefined,
        city_lon: this.editForm.city_lon ?? undefined,
        profile_picture: this.selectedFile,
      })
      .subscribe({
        next: (updatedUser) => {
          this.isSaving = false;
          this.isEditMode = false;
          this.successMessage = 'Profile updated successfully!';
          this.authService.currentUser$.next(updatedUser);
        },
        error: (err) => {
          this.isSaving = false;
          this.errorMessage = err.error?.message || 'Failed to update profile. Please try again.';
          this.cdr.detectChanges();
        },
      });
  }

  logout() {
    this.authService.logout().subscribe({
      next: () => {
        this.authService.currentUser$.next(null);
        this.router.navigate(['/auth/login']);
      },
      error: () => {
        this.authService.currentUser$.next(null);
        this.router.navigate(['/auth/login']);
      }
    });
  }

  findFriends(): void {
    this.router.navigate(['/friend-requests']);
  }

  fetchVisitedUser(userId: number) {
    this.relationshipLoading = true;
    this.authService.getUserById(userId).subscribe({
      next: (user: User) => {
        this.visitedUser = user;
        this.visitedUserInitials = (user.firstname?.[0] ?? '') + (user.lastname?.[0] ?? '');
        this.loadUserPosts(userId);
        this.loadRelationshipStatus(userId);
      },
      error: (err: any) => {
        this.errorMessage = 'Failed to load user profile.';
      }
    });
  }

  loadRelationshipStatus(userId: number): void {
    this.friendService.getRelationshipStatus(userId).subscribe({
      next: (relationship) => {
        this.relationshipStatus = relationship.status;
        this.relationshipRequestId = null;
        this.relationshipLoading = false;
        if (relationship.status === 'pending_received' && !this.relationshipRequestId) {
          this.friendService.getIncomingFriendRequests().subscribe({
            next: (requests) => {
              this.relationshipRequestId =
                requests.find(request => request.sender_id === userId)?.id ?? null;
              this.cdr.detectChanges();
            },
            error: () => {}
          });
        }
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.relationshipLoading = false;
        this.errorMessage = 'Failed to load friendship status.';
        this.cdr.detectChanges();
      }
    });
  }

  respondToFriendRequest(action: 'accept' | 'decline'): void {
    if (!this.relationshipRequestId || this.relationshipActionLoading) return;

    this.relationshipActionLoading = true;
    const request$ = action === 'accept'
      ? this.friendService.acceptFriendRequest(this.relationshipRequestId)
      : this.friendService.declineFriendRequest(this.relationshipRequestId);

    request$.subscribe({
      next: () => {
        this.relationshipStatus = action === 'accept' ? 'friends' : 'none';
        this.relationshipRequestId = null;
        this.relationshipActionLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.relationshipActionLoading = false;
        this.errorMessage = `Failed to ${action} friend request. Please try again.`;
        this.cdr.detectChanges();
      }
    });
  }

  sendFriendRequest(): void {
    if (!this.visitedUser || this.relationshipActionLoading) return;

    this.relationshipActionLoading = true;
    this.errorMessage = '';
    this.friendService.sendFriendRequest(this.visitedUser.id).subscribe({
      next: () => {
        this.relationshipStatus = 'pending_sent';
        this.relationshipActionLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.relationshipActionLoading = false;
        this.errorMessage = err.error?.message || 'Failed to send friend request. Please try again.';
        this.cdr.detectChanges();
      }
    });
  }

  loadUserPosts(userId: number) {
    this.postsLoading = true;
    this.feedService.getUserPosts(userId).subscribe({
      next: (posts) => {
        this.posts = posts;
        this.postsLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.postsLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  openPostDetail(post: FeedPost) {
    this.selectedPostForModal = post;
    this.showPostDetailModal = true;
    this.cdr.detectChanges();
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

  goBack() {
    this.router.navigate(['/feed']);
  }

  onNavTabChanged(tab: NavTab): void {
    if (tab === 'profile') {
      return;
    }
    // Redirect back to map dashboard with the tab selector
    this.router.navigate(['/map'], { queryParams: { tab } });
  }
}
