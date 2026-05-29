import { Component, OnInit, inject } from '@angular/core';
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
  imageError = '';

  // Store active comment input text per post ID
  commentInputs: { [postId: number]: string } = {};

  // For showing a brief heart animation overlay when double clicked
  heartOverlayPostId: number | null = null;

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
    });
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
    const userFullName = this.getDisplayName(this.currentUser);
    this.feedService.likePost(post.id, userFullName);
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

  submitComment(post: FeedPost): void {
    const text = this.commentInputs[post.id];
    if (!text || !text.trim()) return;

    const userFullName = this.getDisplayName(this.currentUser);
    this.feedService.addComment(post.id, text, userFullName);
    this.commentInputs[post.id] = ''; // Clear input
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
  }

  openCreateModal(): void {
    this.showCreateModal = true;
    this.newDescription = '';
    this.newLocation = '';
    this.newImageUrlsBase64 = [];
    this.imageError = '';
  }

  submitPost(): void {
    if (this.newImageUrlsBase64.length === 0) {
      this.imageError = 'At least one trip photo is required.';
      return;
    }

    const locationName = this.newLocation.trim() || 'Unknown Location';
    const authorName = this.getDisplayName(this.currentUser);
    const authorAvatar = ''; // service will fallback to beautiful generic traveler avatar

    this.feedService.createPost(
      this.newDescription,
      this.newImageUrlsBase64,
      locationName,
      authorName,
      authorAvatar
    );

    this.showCreateModal = false;
  }
}
