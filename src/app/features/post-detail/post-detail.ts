import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { FeedService, FeedPost, PostComment } from '../../core/services/feed';
import { AuthService } from '../../core/services/auth';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { CarouselModule } from 'primeng/carousel';
import { ButtonModule } from 'primeng/button';
import { POPULAR_EMOJIS } from '../../shared/constants/emojis';

import { PostCommentsComponent } from '../../shared/components/post-comments/post-comments';

@Component({
  selector: 'app-post-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    BottomNavComponent,
    CarouselModule,
    ButtonModule,
    PostCommentsComponent
  ],
  templateUrl: './post-detail.ts.html',
  styleUrl: './post-detail.ts.scss'
})
export class PostDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private feedService = inject(FeedService);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  post: FeedPost | null = null;
  loading = true;
  errorMessage = '';

  activeReplyComment: PostComment | null = null;
  currentUser: any = null;
  commentInput = '';
  activeEmojiPicker = false;
  popularEmojis = POPULAR_EMOJIS;
  heartOverlay = false;

  replyToComment(comment: PostComment, inputElem?: HTMLInputElement): void {
    this.activeReplyComment = comment;
    if (inputElem) {
      setTimeout(() => inputElem.focus(), 50);
    }
  }

  cancelReply(): void {
    this.activeReplyComment = null;
  }

  submitComment(): void {
    if (!this.post || !this.commentInput || !this.commentInput.trim()) return;

    const replyTarget = this.activeReplyComment;
    const parentId = replyTarget?.id ?? null;

    const userFullName = this.currentUser
      ? `${this.currentUser.firstname || ''} ${this.currentUser.lastname || ''}`.trim()
      : 'Traveler';

    const text = this.commentInput;
    const newComment: PostComment = {
      username: userFullName || 'Traveler',
      text: text,
      createdAt: 'Just now',
      parentId: parentId,
      replyToUsername: replyTarget?.username
    };

    this.post.comments = [...this.post.comments, newComment];
    this.commentInput = '';
    this.activeReplyComment = null;
    this.cdr.detectChanges();

    this.feedService.addComment(this.post.id, text, parentId).subscribe({
      next: (res) => {
        if (res && res.id) {
          newComment.id = res.id;
        }
      },
      error: (err) => {
        console.error('Failed to submit comment', err);
        if (this.post) {
          this.post.comments = this.post.comments.filter(c => c !== newComment);
          this.commentInput = text;
          this.activeReplyComment = replyTarget;
          this.cdr.detectChanges();
        }
      }
    });
  }

  ngOnInit(): void {
    this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
    });

    this.route.paramMap.subscribe(params => {
      const postIdStr = params.get('id');
      if (postIdStr) {
        const postId = parseInt(postIdStr, 10);
        this.fetchPost(postId);
      } else {
        this.loading = false;
        this.errorMessage = 'Invalid post ID.';
      }
    });
  }

  fetchPost(postId: number): void {
    this.loading = true;
    this.errorMessage = '';

    this.feedService.getPostById(postId).subscribe({
      next: (post: FeedPost) => {
        this.post = post;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('Error fetching post detail:', err);
        this.loading = false;
        this.errorMessage = 'Post not found or failed to load.';
        this.cdr.detectChanges();
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/feed']);
  }

  viewProfile(userId?: number): void {
    if (userId) {
      this.router.navigate(['/profile', userId]);
    }
  }

  toggleLike(): void {
    if (!this.post) return;

    const originalHasLiked = this.post.hasLiked;
    const originalLikesCount = this.post.likesCount;

    this.post.hasLiked = !this.post.hasLiked;
    this.post.likesCount = this.post.hasLiked ? this.post.likesCount + 1 : this.post.likesCount - 1;
    this.cdr.detectChanges();

    const request$ = originalHasLiked
      ? this.feedService.unlikePost(this.post.id)
      : this.feedService.likePost(this.post.id);

    request$.subscribe({
      error: (err) => {
        console.error('Failed to update like status', err);
        if (this.post) {
          this.post.hasLiked = originalHasLiked;
          this.post.likesCount = originalLikesCount;
          this.cdr.detectChanges();
        }
      }
    });
  }

  onImageDoubleClicked(): void {
    if (!this.post) return;
    if (!this.post.hasLiked) {
      this.toggleLike();
    }
    this.heartOverlay = true;
    setTimeout(() => {
      this.heartOverlay = false;
      this.cdr.detectChanges();
    }, 800);
  }

  toggleEmojiPicker(): void {
    this.activeEmojiPicker = !this.activeEmojiPicker;
  }

  addEmoji(emoji: string): void {
    this.commentInput = (this.commentInput || '') + emoji;
    this.activeEmojiPicker = false;
  }

  onNavTabChanged(tab: NavTab): void {
    if (tab === 'feed') {
      this.router.navigate(['/feed']);
      return;
    }
    if (tab === 'profile') {
      this.router.navigate(['/profile']);
      return;
    }
    this.router.navigate(['/map'], { queryParams: { tab } });
  }
}
