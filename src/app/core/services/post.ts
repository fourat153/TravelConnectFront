import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PostsOut, SinglePostOut } from '../../shared/models/post';

@Injectable({ providedIn: 'root' })
export class PostService {
  private base = 'http://localhost:8000';

  constructor(private http: HttpClient) {}

  getStopPosts(stopId: number): Observable<PostsOut> {
    return this.http.get<PostsOut>(`${this.base}/stops/${stopId}/posts`, { withCredentials: true });
  }

  createPost(stopId: number, title: string, images: File[]): Observable<SinglePostOut> {
    const formData = new FormData();
    formData.append('title', title);
    images.forEach(img => formData.append('images', img));
    return this.http.post<SinglePostOut>(`${this.base}/stops/${stopId}/posts`, formData, { withCredentials: true });
  }

  getPostComments(postId: number): Observable<any> {
    return this.http.get<any>(`${this.base}/posts/${postId}/comments`, { withCredentials: true });
  }

  likePost(postId: number): Observable<any> {
    return this.http.post<any>(`${this.base}/posts/${postId}/likes`, {}, { withCredentials: true });
  }

  unlikePost(postId: number): Observable<any> {
    return this.http.delete<any>(`${this.base}/posts/${postId}/likes`, { withCredentials: true });
  }

  addComment(postId: number, content: string): Observable<any> {
    return this.http.post<any>(`${this.base}/posts/${postId}/comments`, { content }, { withCredentials: true });
  }
}