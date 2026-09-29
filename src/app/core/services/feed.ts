import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

export interface PostComment {
  id?: number;
  userId?: number;
  username: string;
  text: string;
  createdAt: string;
  parentId?: number | null;
  replyToUsername?: string;
}

export interface FeedPost {
  id: number;
  authorId?: number;
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
  stopId?: number;
  tripId?: number;
  lat?: number;
  long?: number;
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
    this.http.get<any[]>(`${this.baseUrl}/posts/feed?_=${new Date().getTime()}`, { withCredentials: true })
      .subscribe({
        next: (rawPosts) => {
          const posts: FeedPost[] = (rawPosts ?? []).map((rawPost: any) => {
            const rawComments = rawPost.comments || [];
            const comments: PostComment[] = rawComments.map((c: any) => {
              const username = c.username || c.user_name || (c.user ? `${c.user.firstname || ''} ${c.user.lastname || ''}`.trim() : '') || 'Traveler';
              const parentId = c.parent_id ?? c.parentId ?? null;
              let replyToUsername: string | undefined = undefined;

              if (parentId) {
                const parent = rawComments.find((pc: any) => pc.id === parentId);
                if (parent) {
                  replyToUsername = parent.username || parent.user_name || (parent.user ? `${parent.user.firstname || ''} ${parent.user.lastname || ''}`.trim() : '') || 'Traveler';
                }
              }

              return {
                id: c.id,
                userId: c.user_id || c.userId,
                username: username,
                text: c.text || c.content || '',
                createdAt: c.createdAt || c.created_at || 'Just now',
                parentId: parentId,
                replyToUsername: replyToUsername
              };
            });

            return {
              ...rawPost,
              stopId: rawPost.stop_id ?? rawPost.stopId,
              tripId: rawPost.trip_id ?? rawPost.tripId,
              comments
            };
          });

          const sorted = posts.sort((a, b) => b.id - a.id);
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

  getPostById(postId: number): Observable<FeedPost> {
    return this.http.get<any>(`${this.baseUrl}/posts/${postId}`, { withCredentials: true }).pipe(
      map((res) => {
        const rawPost = res?.post || res?.data || res;
        if (!rawPost) {
          throw new Error('Post not found');
        }

        const imageUrls = Array.isArray(rawPost.images)
          ? rawPost.images.map((img: any) => (typeof img === 'string' ? img : img.link || img.url || ''))
          : Array.isArray(rawPost.imageUrls)
            ? rawPost.imageUrls
            : [];

        const authorId = rawPost.authorId || rawPost.author_id || rawPost.user_id || rawPost.user?.id;
        const authorName =
          rawPost.authorName ||
          rawPost.author_name ||
          (rawPost.user ? `${rawPost.user.firstname || ''} ${rawPost.user.lastname || ''}`.trim() : '') ||
          rawPost.username ||
          'Traveler';
        const authorAvatar =
          rawPost.authorAvatar ||
          rawPost.author_avatar ||
          rawPost.user?.profile_picture ||
          rawPost.user_avatar ||
          '';

        const rawComments = rawPost.comments || [];
        const comments = rawComments.map((c: any) => {
          const username = c.username || c.user_name || (c.user ? `${c.user.firstname || ''} ${c.user.lastname || ''}`.trim() : '') || 'Traveler';
          const parentId = c.parent_id ?? c.parentId ?? null;
          let replyToUsername: string | undefined = undefined;

          if (parentId) {
            const parent = rawComments.find((pc: any) => pc.id === parentId);
            if (parent) {
              replyToUsername = parent.username || parent.user_name || (parent.user ? `${parent.user.firstname || ''} ${parent.user.lastname || ''}`.trim() : '') || 'Traveler';
            }
          }

          return {
            id: c.id,
            userId: c.user_id || c.userId,
            username: username,
            text: c.text || c.content || '',
            createdAt: c.createdAt || c.created_at || 'Just now',
            parentId: parentId,
            replyToUsername: replyToUsername
          };
        });

        const feedPost: FeedPost = {
          id: rawPost.id,
          authorId: authorId,
          authorName: authorName,
          authorAvatar: authorAvatar,
          location: rawPost.location || rawPost.title || '',
          imageUrls: imageUrls,
          description: rawPost.description || rawPost.title || '',
          likesCount: rawPost.likes_count ?? rawPost.likesCount ?? 0,
          hasLiked: rawPost.has_liked ?? rawPost.hasLiked ?? false,
          comments: comments,
          createdAt: rawPost.created_at || rawPost.createdAt || 'Just now',
          tripTitle: rawPost.trip_title || rawPost.tripTitle,
          lat: rawPost.lat,
          long: rawPost.long
        };

        return feedPost;
      })
    );
  }

  getUserPosts(userId: number): Observable<FeedPost[]> {
    return this.http.get<FeedPost[]>(`${this.baseUrl}/posts/user/${userId}`, { withCredentials: true });
  }

  likePost(postId: number): Observable<any> {
    return this.http.post<any>(`${this.baseUrl}/posts/${postId}/likes`, {}, { withCredentials: true }).pipe(
      map((res) => {
        const currentPosts = this.posts$.getValue();
        const updatedPosts = currentPosts.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              hasLiked: true,
              likesCount: p.likesCount + 1
            };
          }
          return p;
        });
        this.posts$.next(updatedPosts);
        return res;
      })
    );
  }

  unlikePost(postId: number): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/posts/${postId}/likes`, { withCredentials: true }).pipe(
      map((res) => {
        const currentPosts = this.posts$.getValue();
        const updatedPosts = currentPosts.map(p => {
          if (p.id === postId) {
            return {
              ...p,
              hasLiked: false,
              likesCount: Math.max(0, p.likesCount - 1)
            };
          }
          return p;
        });
        this.posts$.next(updatedPosts);
        return res;
      })
    );
  }

  addComment(postId: number, commentText: string, parentId?: number | null): Observable<any> {
    const payload: any = { content: commentText };
    if (parentId !== undefined && parentId !== null) {
      payload.parent_id = parentId;
    }
    return this.http.post<any>(`${this.baseUrl}/posts/${postId}/comments`, payload, { withCredentials: true }).pipe(
      map((res) => {
        this.loadPosts();
        return res;
      })
    );
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

    return this.http.post<any>(`${this.baseUrl}/posts/feed`, formData, { withCredentials: true }).pipe(
      map((res) => {
        this.loadPosts();
        return res;
      })
    );
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
