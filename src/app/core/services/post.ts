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
}