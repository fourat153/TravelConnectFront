import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { AuthService } from '../../core/services/auth';
import { FeedService, FeedPost } from '../../core/services/feed';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { CarouselModule } from 'primeng/carousel';

@Component({
  selector: 'app-feed',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BottomNavComponent,
    DialogModule,
    InputTextModule,
    TextareaModule,
    ButtonModule,
    CarouselModule
  ],
  templateUrl: './feed.html',
  styleUrl: './feed.scss'
})
export class FeedComponent implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private feedService = inject(FeedService);
  private cdr = inject(ChangeDetectorRef);

  posts: FeedPost[] = [];

  currentUser: any = null;
  currentUserInitials = '';

  // Suggestions panel data
  suggestions = [
    { name: 'Sarah Jenkins', avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=100&auto=format&fit=crop&q=80', mutualFriends: 3 },
    { name: 'Marcus Chen', avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=100&auto=format&fit=crop&q=80', mutualFriends: 5 },
    { name: 'Elena Rostova', avatar: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=100&auto=format&fit=crop&q=80', mutualFriends: 1 }
  ];

  // Create post modal state
  showCreateModal = false;
  newDescription = '';
  newLocation = '';
  newImageUrlsBase64: string[] = [];
  selectedImages: File[] = [];
  imageError = '';

  // Store active comment input text per post ID
  commentInputs: { [postId: number]: string } = {};

  // For showing a brief heart animation overlay when double clicked
  heartOverlayPostId: number | null = null;

  // Emoji picker state
  activeEmojiPickerPostId: number | null = null;
  popularEmojis = ['😀', '✈️', '🌍', '🏖️', '📸', '😍', '❤️', '🔥', '🙌', '✨', '🍕', '🗺️', '🥳', '😎', '👍', '👏', '🌟', '🍹', '🚗', '🏔️'];

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.currentUser = user;
        this.currentUserInitials = (user.firstname?.[0] ?? '') + (user.lastname?.[0] ?? '');
      } else {
        // Fallback user if auth session is not active/available (helps in local UI testing)
        this.currentUser = { firstname: 'Traveler', lastname: 'Connect', email: 'traveler@travelconnect.com' };
        this.currentUserInitials = 'TC';
      }
    });

    this.feedService.getPosts().subscribe(posts => {
      this.posts = posts;
      this.cdr.detectChanges();
    });

    // Explicitly load feed posts when visiting feed page
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

  openCreateModal(): void {
    this.showCreateModal = true;
    this.newDescription = '';
    this.newLocation = '';
    this.newImageUrlsBase64 = [];
    this.selectedImages = [];
    this.imageError = '';
  }

  submitPost(): void {
    if (this.selectedImages.length === 0) {
      this.imageError = 'At least one trip photo is required.';
      return;
    }

    const locationName = this.newLocation.trim() || 'Unknown Location';
    const description = this.newDescription.trim();

    // Run Nominatim geocoding on the location name first
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1`)
      .then(res => res.json())
      .then(data => {
        let lat = 0.0;
        let lon = 0.0;
        if (data && data.length > 0) {
          lat = parseFloat(data[0].lat);
          lon = parseFloat(data[0].lon);
        }

        this.feedService.createFeedPost(description, locationName, lat, lon, this.selectedImages).subscribe({
          next: () => {
            this.showCreateModal = false;
            this.loadFeed();
          },
          error: (err) => {
            console.error(err);
            this.imageError = 'Failed to create post. Please try again.';
          }
        });
      })
      .catch(() => {
        // Fallback to default coordinates
        this.feedService.createFeedPost(description, locationName, 0.0, 0.0, this.selectedImages).subscribe({
          next: () => {
            this.showCreateModal = false;
            this.loadFeed();
          },
          error: (err) => {
            console.error(err);
            this.imageError = 'Failed to create post. Please try again.';
          }
        });
      });
  }
}
