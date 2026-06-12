import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PostComment {
  username: string;
  text: string;
  createdAt: string;
}

export interface FeedPost {
  id: number;
  authorName: string;
  authorAvatar: string;
  location: string;
  imageUrls: string[];
  description: string;
  likesCount: number;
  hasLiked: boolean;
  comments: PostComment[];
  createdAt: string;
  tripTitle?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FeedService {
  private http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;
  private posts$ = new BehaviorSubject<FeedPost[]>([]);

  constructor() {
    this.loadPosts();
  }

  loadPosts(): void {
    this.http.get<FeedPost[]>(`${this.baseUrl}/posts/feed?_=${new Date().getTime()}`, { withCredentials: true })
      .subscribe({
        next: (posts) => {
          const sorted = (posts ?? []).sort((a, b) => b.id - a.id);
          this.posts$.next(sorted);
        },
        error: (err) => {
          console.error('Failed to load feed posts', err);
        }
      });
  }

  getPosts(): Observable<FeedPost[]> {
    return this.posts$.asObservable();
  }

  likePost(postId: number): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/posts/${postId}/likes`, {}, { withCredentials: true });
  }

  unlikePost(postId: number): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/posts/${postId}/likes`, { withCredentials: true });
  }

  addComment(postId: number, commentText: string): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/posts/${postId}/comments`, { content: commentText }, { withCredentials: true });
  }

  createFeedPost(
    description: string,
    location: string,
    lat: number,
    lon: number,
    images: File[]
  ): Observable<any> {
    const formData = new FormData();
    formData.append('title', description);
    formData.append('location', location);
    formData.append('lat', lat.toString());
    formData.append('long', lon.toString()); // Backend expects long

    images.forEach(image => {
      formData.append('images', image);
    });

    return this.http.post<any>(`${this.baseUrl}/posts/feed`, formData, { withCredentials: true });
  }

  createStopPost(
    stopId: number,
    description: string,
    images: File[]
  ): Observable<any> {
    const formData = new FormData();
    formData.append('title', description);
    images.forEach(image => {
      formData.append('images', image);
    });
    return this.http.post<any>(`${this.baseUrl}/stops/${stopId}/posts`, formData, { withCredentials: true });
  }

  deletePost(postId: number): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/posts/${postId}`, { withCredentials: true });
  }
}
