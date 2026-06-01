import { Component, Input, Output, EventEmitter, OnInit, inject, ChangeDetectorRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PostService } from '../../../core/services/post';
import { PostOut } from '../../../shared/models/post';

import { TimelineModule } from 'primeng/timeline';
import { CardModule } from 'primeng/card';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { GalleriaModule } from 'primeng/galleria';

@Component({
  selector: 'app-stop-sheet',
  imports: [CommonModule, FormsModule, TimelineModule, CardModule, AvatarModule, ButtonModule, InputTextModule, GalleriaModule],
  templateUrl: './stop-sheet.html',
  styleUrl: './stop-sheet.scss'
})
export class StopSheetComponent implements OnInit {
  @Input() stop: any = null;
  @Input() friendName: string = '';
  @Input() tripDate: string = '';
  @Output() closed = new EventEmitter<void>();

  private postService = inject(PostService);
  private cdr = inject(ChangeDetectorRef);
  
  posts: PostOut[] = [];
  postTitle = '';
  selectedImages: File[] = [];
  imagePreviews: string[] = [];
  isSubmitting = false;
  errorMessage = '';
  commentInputs: { [postId: number]: string } = {};
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
    this.loadPosts();
  }
  
  loadPosts() {
    this.postService.getStopPosts(this.stop.id).subscribe({
      next: (res) => {
        if (res.status_code === 200 && res.posts) {
          this.posts = res.posts;
          this.posts.forEach(post => {
            this.loadComments(post);
          });
        }
      },
      error: () => { this.errorMessage = 'Failed to load posts.'; }
    });
  }

  loadComments(post: PostOut) {
    this.postService.getPostComments(post.id).subscribe({
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
      }
    });
  }

  toggleLike(post: PostOut) {
    if (post.has_liked) {
      this.postService.unlikePost(post.id).subscribe({
        next: () => {
          post.has_liked = false;
          post.likes_count = Math.max(0, (post.likes_count || 1) - 1);
          this.cdr.detectChanges();
        }
      });
    } else {
      this.postService.likePost(post.id).subscribe({
        next: () => {
          post.has_liked = true;
          post.likes_count = (post.likes_count || 0) + 1;
          this.cdr.detectChanges();
        }
      });
    }
  }

  addComment(post: PostOut) {
    const text = this.commentInputs[post.id];
    if (!text || !text.trim()) return;

    this.postService.addComment(post.id, text).subscribe({
      next: (res) => {
        this.commentInputs[post.id] = '';
        this.loadComments(post);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('Error adding comment:', err);
      }
    });
  }

  getInitials(name: string): string {
    if (!name) return '?';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
  }
 
  submitPost() {
    if (!this.postTitle.trim()) return;
    this.isSubmitting = true;
    this.postService.createPost(this.stop.id, this.postTitle, this.selectedImages).subscribe({
      next: (res) => {
        if (res.post  ) { //need to be fixed the return of post x
          this.postTitle = '';
          this.selectedImages = [];
          this.imagePreviews = [];
          this.isSubmitting = false;
          this.loadPosts();
          this.cdr.detectChanges();
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
}