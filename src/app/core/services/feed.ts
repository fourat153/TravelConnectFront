import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { PostsOut } from '../../shared/models/post';

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
  videoUrls: string[];
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
  private loading$ = new BehaviorSubject<boolean>(true);
  private loadingMore$ = new BehaviorSubject<boolean>(false);
  private hasMore$ = new BehaviorSubject<boolean>(true);

  private currentPage = 1;
  private readonly pageSize = 10;
  private totalPages = 1;
  private isFetching = false;

  constructor() {
    this.loadPosts();
  }

  private getMediaUrls(rawMedia: unknown): string[] {
    if (!Array.isArray(rawMedia)) {
      return [];
    }

    return rawMedia
      .map((media: unknown) => {
        if (typeof media === 'string') {
          return media;
        }

        if (media && typeof media === 'object') {
          const item = media as {
            link?: unknown;
            url?: unknown;
            path?: unknown;
            src?: unknown;
            video_url?: unknown;
            file_url?: unknown;
          };
          const url = item.link ?? item.url ?? item.path ?? item.src ?? item.video_url ?? item.file_url;
          return typeof url === 'string' ? url : '';
        }

        return '';
      })
      .filter((url): url is string => Boolean(url));
  }

  private getVideoUrls(rawPost: any): string[] {
    const videos = this.getMediaUrls(
      rawPost.videos ??
      rawPost.videoUrls ??
      rawPost.video_urls ??
      (rawPost.video ? [rawPost.video] : [])
    );
    if (videos.length > 0) {
      return videos;
    }

    if (!Array.isArray(rawPost.media)) {
      return [];
    }

    return rawPost.media
      .filter((media: any) => media?.type?.startsWith('video/') || media?.media_type === 'video')
      .map((media: any) => this.getMediaUrls([media])[0] || '')
      .filter((url: string): url is string => Boolean(url));
  }

  private transformPost(rawPost: any): FeedPost {
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
      imageUrls: this.getMediaUrls(rawPost.images ?? rawPost.imageUrls),
      videoUrls: this.getVideoUrls(rawPost),
      stopId: rawPost.stop_id ?? rawPost.stopId,
      tripId: rawPost.trip_id ?? rawPost.tripId,
      comments
    };
  }

  loadPosts(reset: boolean = true): void {
    if (this.isFetching) return;

    if (reset) {
      this.currentPage = 1;
      this.loading$.next(true);
    } else {
      this.loadingMore$.next(true);
    }

    this.isFetching = true;

    const pageToLoad = reset ? 1 : this.currentPage + 1;
    const url = `${this.baseUrl}/posts/feed?page_number=${pageToLoad}&page_size=${this.pageSize}&_=${new Date().getTime()}`;

    this.http.get<any>(url, { withCredentials: true })
      .subscribe({
        next: (response) => {
          const rawPostsList = Array.isArray(response)
            ? response
            : (response?.posts ?? response?.data ?? response?.items ?? []);

          const newPosts: FeedPost[] = rawPostsList.map((rawPost: any) => this.transformPost(rawPost));

          this.currentPage = response?.page_number ?? pageToLoad;
          this.totalPages = response?.total_pages ?? (newPosts.length < this.pageSize ? this.currentPage : this.currentPage + 1);
          this.hasMore$.next(this.currentPage < this.totalPages && newPosts.length > 0);

          if (reset) {
            this.posts$.next(newPosts);
            this.loading$.next(false);
          } else {
            const currentPosts = this.posts$.getValue();
            // Prevent duplicate posts if any
            const existingIds = new Set(currentPosts.map(p => p.id));
            const filteredNew = newPosts.filter(p => !existingIds.has(p.id));
            this.posts$.next([...currentPosts, ...filteredNew]);
            this.loadingMore$.next(false);
          }

          this.isFetching = false;
        },
        error: () => {
          if (reset) {
            this.posts$.next([]);
            this.loading$.next(false);
          } else {
            this.loadingMore$.next(false);
          }
          this.isFetching = false;
        }
      });
  }

  loadNextPage(): void {
    if (!this.hasMore$.getValue() || this.isFetching) {
      return;
    }
    this.loadPosts(false);
  }

  getLoading(): Observable<boolean> {
    return this.loading$.asObservable();
  }

  getLoadingMore(): Observable<boolean> {
    return this.loadingMore$.asObservable();
  }

  getHasMore(): Observable<boolean> {
    return this.hasMore$.asObservable();
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
          ? this.getMediaUrls(rawPost.images)
          : this.getMediaUrls(rawPost.imageUrls);

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
          videoUrls: this.getVideoUrls(rawPost),
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
    return this.http.get<any>(`${this.baseUrl}/posts/user/${userId}`, { withCredentials: true }).pipe(
      map((res) => {
        const list = Array.isArray(res) ? res : (res?.posts ?? res?.data ?? []);
        return list.map((rawPost: any) => this.transformPost(rawPost));
      })
    );
  }

  getStopPosts(stopId: number): Observable<PostsOut> {
    return this.http.get<PostsOut>(`${this.baseUrl}/stops/${stopId}/posts`, { withCredentials: true }).pipe(
      map((res) => ({
        ...res,
        posts: (res.posts ?? []).map((post: any) => ({
          ...post,
          images: this.getMediaUrls(post.images).map((link, index) => ({
            id: post.images?.[index]?.id ?? index,
            link,
            caption: post.images?.[index]?.caption ?? null
          })),
          videos: this.getVideoUrls(post).map((link, index) => ({
            id: post.videos?.[index]?.id ?? index,
            link
          }))
        }))
      }))
    );
  }

  getPostComments(postId: number): Observable<any> {
    return this.http.get<any>(`${this.baseUrl}/posts/${postId}/comments`, { withCredentials: true });
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
    formData.append('long', lon.toString()); 

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
    images: File[],
    videos: File[] = []
  ): Observable<any> {
    const formData = new FormData();
    formData.append('title', description);
    images.forEach(image => {
      formData.append('images', image);
    });
    videos.forEach(video => {
      formData.append('videos', video);
    });
    return this.http.post<any>(`${this.baseUrl}/stops/${stopId}/posts`, formData, { withCredentials: true });
  }

  deletePost(postId: number): Observable<any> {
    return this.http.delete<any>(`${this.baseUrl}/posts/${postId}`, { withCredentials: true });
  }
}
