import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeedService } from '../../../core/services/feed';
import { AuthService } from '../../../core/services/auth';
import { PostOut } from '../../../shared/models/post';

import { TimelineModule } from 'primeng/timeline';
import { CardModule } from 'primeng/card';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { GalleriaModule } from 'primeng/galleria';
import { DialogModule } from 'primeng/dialog';
import { PostCommentsComponent } from '../../../shared/components/post-comments/post-comments';
import { POPULAR_EMOJIS } from '../../../shared/constants/emojis';

@Component({
  selector: 'app-stop-sheet',
  imports: [CommonModule, FormsModule, TimelineModule, CardModule, AvatarModule, ButtonModule, InputTextModule, GalleriaModule, DialogModule, PostCommentsComponent],
  templateUrl: './stop-sheet.html',
  styleUrl: './stop-sheet.scss'
})
export class StopSheetComponent implements OnInit, OnChanges {
  @Input() stop: any = null;
  @Input({ required: true }) ownerId!: number;
  @Input() ownerName: string = '';
  @Input() ownerProfilePicture: string = '';
  @Input() tripDate: string = '';
  @Output() closed = new EventEmitter<void>();
  @Output() seeTrip = new EventEmitter<number>();

  @ViewChild('postInput') postInputElem?: ElementRef<HTMLInputElement>;

  private feedService = inject(FeedService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  currentUser: any = null;
  currentUserInitials = '';

  posts: PostOut[] = [];
  postTitle = '';
  selectedImages: File[] = [];
  imagePreviews: string[] = [];
  selectedVideos: File[] = [];
  videoPreviews: string[] = [];
  emojiPickerOpen = false;
  popularEmojis = POPULAR_EMOJIS;
  isSubmitting = false;
  errorMessage = '';
  postPendingDeletion: PostOut | null = null;
  deletingPost = false;
  currentImageIndex: { [postId: number]: number } = {};
  responsiveOptions = [
    { breakpoint: '1024px', numVisible: 5 },
    { breakpoint: '768px', numVisible: 3 },
    { breakpoint: '560px', numVisible: 1 }
  ];

  prevImage(post: any) {
    const images = post.images || [];
    if (images.length <= 1) return;
    const currentIndex = this.currentImageIndex[post.id] || 0;
    this.currentImageIndex[post.id] = (currentIndex - 1 + images.length) % images.length;
    this.cdr.detectChanges();
  }

  nextImage(post: any) {
    const images = post.images || [];
    if (images.length <= 1) return;
    const currentIndex = this.currentImageIndex[post.id] || 0;
    this.currentImageIndex[post.id] = (currentIndex + 1) % images.length;
    this.cdr.detectChanges();
  }

  setImageIndex(post: any, index: number) {
    this.currentImageIndex[post.id] = index;
    this.cdr.detectChanges();
  }

  ngOnInit() {
    this.authService.currentUser$.subscribe((user: any) => {
      if (user) {
        this.currentUser = user;
        this.currentUserInitials = (user.firstname?.[0] ?? '') + (user.lastname?.[0] ?? '');
        this.cdr.detectChanges();
      }
    });
  }

  get isOwner(): boolean {
    if (!this.currentUser || this.ownerId === undefined || this.ownerId === null) {
      return false;
    }
    return Number(this.currentUser.id) === Number(this.ownerId);
  }

  get authorName(): string {
    if (this.isOwner) {
      const full = (this.currentUser?.firstname ? `${this.currentUser.firstname} ${this.currentUser.lastname || ''}`.trim() : this.currentUser?.username);
      return full || 'Me';
    }
    return this.ownerName || 'Traveler';
  }

  get authorPhoto(): string | undefined {
    return this.isOwner ? this.currentUser?.profile_picture : (this.ownerProfilePicture || undefined);
  }

  get authorInitials(): string {
    if (this.isOwner) {
      return this.currentUserInitials;
    }
    return this.getInitials(this.ownerName);
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(part => part[0]).join('').toUpperCase().slice(0, 2);
  }

  canDeletePost(post: PostOut): boolean {
    const postOwnerId = post.user_id ?? post.author_id ?? post.owner_id;
    return postOwnerId === undefined
      ? this.isOwner
      : Number(postOwnerId) === Number(this.currentUser?.id);
  }

  requestPostDeletion(post: PostOut, event: Event): void {
    event.stopPropagation();
    if (this.canDeletePost(post)) {
      this.postPendingDeletion = post;
    }
  }

  cancelPostDeletion(): void {
    if (!this.deletingPost) {
      this.postPendingDeletion = null;
    }
  }

  confirmPostDeletion(): void {
    if (!this.postPendingDeletion || this.deletingPost) return;

    const post = this.postPendingDeletion;
    this.deletingPost = true;
    this.feedService.deletePost(post.id).subscribe({
      next: () => {
        this.posts = this.posts.filter(item => item.id !== post.id);
        delete this.currentImageIndex[post.id];
        this.deletingPost = false;
        this.postPendingDeletion = null;
      },
      error: () => {
        this.errorMessage = 'Failed to delete post. Please try again.';
        this.deletingPost = false;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['stop'] && this.stop) {
      this.posts = [];
      this.postTitle = '';
      this.selectedImages = [];
      this.imagePreviews = [];
      this.selectedVideos = [];
      this.videoPreviews = [];
      this.emojiPickerOpen = false;
      this.isSubmitting = false;
      this.errorMessage = '';
      this.currentImageIndex = {};
      this.loadPosts();
      this.focusPostInput();
    }
  }

  focusPostInput(): void {
    setTimeout(() => {
      this.postInputElem?.nativeElement?.focus();
    }, 150);
  }

  loadPosts() {
    this.feedService.getStopPosts(this.stop.id).subscribe({
      next: (res) => {
        if (res.status_code === 200 && res.posts) {
          this.posts = res.posts;
          this.posts.forEach(post => this.loadComments(post));
        }
      },
      error: () => { this.errorMessage = 'Failed to load posts.'; }
    });
  }

  loadComments(post: PostOut) {
    this.feedService.getPostComments(post.id).subscribe({
      next: (res) => {
        if (res.status_code === 200 && res.data) {
          post.comments = res.data.map((c: any) => ({
            id: c.id,
            username: c.username || 'Traveler',
            text: c.content,
            createdAt: c.created_at
          }));
          this.cdr.detectChanges();
        }
      },
      error: () => {}
    });
  }

  toggleLike(post: PostOut) {
    if (post.has_liked) {
      this.feedService.unlikePost(post.id).subscribe({
        next: () => {
          post.has_liked = false;
          post.likes_count = Math.max(0, (post.likes_count || 1) - 1);
          this.cdr.detectChanges();
        },
        error: () => {
          this.errorMessage = 'Failed to update like.';
        }
      });
    } else {
      this.feedService.likePost(post.id).subscribe({
        next: () => {
          post.has_liked = true;
          post.likes_count = (post.likes_count || 0) + 1;
          this.cdr.detectChanges();
        },
        error: () => {
          this.errorMessage = 'Failed to update like.';
        }
      });
    }
  }

  onImagesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;
    this.selectedImages = Array.from(input.files);
    this.imagePreviews = [];
    this.selectedImages.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => this.imagePreviews.push(e.target?.result as string);
      reader.readAsDataURL(file);
    });
    input.value = '';
  }

  onVideosSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const videos = Array.from(input.files).filter(file => file.type.startsWith('video/'));
    this.selectedVideos = [...this.selectedVideos, ...videos];
    this.videoPreviews = this.selectedVideos.map(video => URL.createObjectURL(video));
    input.value = '';
  }

  toggleEmojiPicker(): void {
    this.emojiPickerOpen = !this.emojiPickerOpen;
  }

  insertEmoji(emoji: string): void {
    const input = this.postInputElem?.nativeElement;
    if (!input) {
      this.postTitle += emoji;
    } else {
      const start = input.selectionStart ?? this.postTitle.length;
      const end = input.selectionEnd ?? start;
      this.postTitle = `${this.postTitle.slice(0, start)}${emoji}${this.postTitle.slice(end)}`;
    }

    this.emojiPickerOpen = false;
    setTimeout(() => {
      input?.focus();
      const cursorPosition = (input?.selectionStart ?? this.postTitle.length) + emoji.length;
      input?.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  submitPost() {
    if (!this.postTitle.trim()) return;
    this.isSubmitting = true;
    this.feedService.createStopPost(this.stop.id, this.postTitle, this.selectedImages, this.selectedVideos).subscribe({
      next: (res: any) => {
        if (res && (res.post || res.status_code === 200 || res.status_code === 201)) {
          this.postTitle = '';
          this.selectedImages = [];
          this.imagePreviews = [];
          this.selectedVideos = [];
          this.videoPreviews = [];
          this.emojiPickerOpen = false;
          this.isSubmitting = false;
          this.errorMessage = '';
          this.loadPosts();
          this.cdr.detectChanges();
        } else {
          this.errorMessage = res?.message || 'Failed to create post.';
          this.isSubmitting = false;
        }
      },
      error: () => {
        this.errorMessage = 'Failed to create post.';
        this.isSubmitting = false;
      }
    });
  }

  close() {
    this.closed.emit();
  }

  viewTrip(): void {
    if (this.stop?.trip_id) {
      this.seeTrip.emit(this.stop.trip_id);
    }
  }
}