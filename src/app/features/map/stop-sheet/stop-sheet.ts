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

@Component({
  selector: 'app-stop-sheet',
  imports: [CommonModule, FormsModule, TimelineModule, CardModule, AvatarModule, ButtonModule, InputTextModule],
  templateUrl: './stop-sheet.html',
  styleUrl: './stop-sheet.scss'
})
export class StopSheetComponent implements OnInit {
  @Input() stop: any = null;
  @Output() closed = new EventEmitter<void>();

  private postService = inject(PostService);
  private cdr = inject(ChangeDetectorRef);
  
  posts: PostOut[] = [];
  postTitle = '';
  selectedImages: File[] = [];
  imagePreviews: string[] = [];
  isSubmitting = false;
  errorMessage = '';

  ngOnInit() {
    this.loadPosts();
  }
 
  loadPosts() {
    this.postService.getStopPosts(this.stop.id).subscribe({
      next: (res) => {
        if (res.status_code === 200) this.posts = res.posts;
      },
      error: () => { this.errorMessage = 'Failed to load posts.'; }
    });
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