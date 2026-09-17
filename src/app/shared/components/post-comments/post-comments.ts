import { Component, Input, Output, EventEmitter, inject, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeedService, PostComment } from '../../../core/services/feed';
import { POPULAR_EMOJIS } from '../../constants/emojis';

@Component({
  selector: 'app-post-comments',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './post-comments.html',
  styleUrl: './post-comments.scss'
})
export class PostCommentsComponent {
  @Input() postId!: number;
  @Input() comments: any[] = [];
  @Input() maxListHeight: string = '200px';
  @Input() currentUsername: string = '';

  @Output() authorClicked = new EventEmitter<number | undefined>();
  @Output() commentAdded = new EventEmitter<PostComment>();

  private feedService = inject(FeedService);
  private cdr = inject(ChangeDetectorRef);

  @ViewChild('commentInputElem') commentInputElem!: ElementRef<HTMLInputElement>;

  commentInput = '';
  activeReplyComment: PostComment | null = null;
  activeEmojiPicker = false;
  popularEmojis = POPULAR_EMOJIS;

  focusInput(): void {
    if (this.commentInputElem?.nativeElement) {
      this.commentInputElem.nativeElement.focus();
    }
  }

  replyToComment(comment: PostComment, inputElem?: HTMLInputElement): void {
    this.activeReplyComment = comment;
    if (inputElem) {
      setTimeout(() => inputElem.focus(), 50);
    }
  }

  cancelReply(): void {
    this.activeReplyComment = null;
  }

  toggleEmojiPicker(): void {
    this.activeEmojiPicker = !this.activeEmojiPicker;
  }

  addEmoji(emoji: string): void {
    this.commentInput = (this.commentInput || '') + emoji;
    this.activeEmojiPicker = false;
  }

  onAuthorClick(userId?: number): void {
    this.authorClicked.emit(userId);
  }

  submitComment(): void {
    if (!this.postId || !this.commentInput || !this.commentInput.trim()) return;

    const text = this.commentInput;
    const replyTarget = this.activeReplyComment;
    const parentId = replyTarget?.id ?? null;
    const authorName = this.currentUsername || 'Traveler';

    const newComment: PostComment = {
      username: authorName,
      text: text,
      createdAt: 'Just now',
      parentId: parentId,
      replyToUsername: replyTarget?.username
    };

    this.comments = [...(this.comments || []), newComment];
    this.commentInput = '';
    this.activeReplyComment = null;
    this.commentAdded.emit(newComment);
    this.cdr.detectChanges();

    this.feedService.addComment(this.postId, text, parentId).subscribe({
      next: (res) => {
        if (res && res.id) {
          newComment.id = res.id;
        }
      },
      error: (err) => {
        console.error('Failed to submit comment', err);
        this.comments = (this.comments || []).filter(c => c !== newComment);
        this.commentInput = text;
        this.activeReplyComment = replyTarget;
        this.cdr.detectChanges();
      }
    });
  }
}
