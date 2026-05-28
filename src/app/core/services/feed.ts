import { Injectable } from '@angular/core';
import { Observable, BehaviorSubject, of } from 'rxjs';

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
}

@Injectable({
  providedIn: 'root'
})
export class FeedService {
  private readonly STORAGE_KEY = 'travelconnect_posts';
  private posts$ = new BehaviorSubject<FeedPost[]>([]);

  private defaultPosts: FeedPost[] = [
    {
      id: 4,
      authorName: 'Ahmed',
      authorAvatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      location: 'Paris, France',
      imageUrls: [
        'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1511739001486-6bfe10ce785f?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1543007630-9710e4a00a20?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1524413840807-0c3cb6fa808d?w=800&auto=format&fit=crop&q=80'
      ],
      description: 'Weekend getaway in Paris! The city of lights never ceases to inspire. Exploring museums, drinking espresso in street cafés, and catching sunsets at the Arc de Triomphe. 🗼✨ #Paris #EuropeTour #Photography #CityOfLights',
      likesCount: 98,
      hasLiked: false,
      comments: [
        { username: 'Sophia Martinez', text: 'Paris looks gorgeous through your lens! 📸', createdAt: '30 mins ago' },
        { username: 'Liam Wilson', text: 'Incredible! Save some croissants for me!', createdAt: '15 mins ago' }
      ],
      createdAt: '1 hour ago'
    },
    {
      id: 1,
      authorName: 'Sophia Martinez',
      authorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      location: 'Santorini, Greece',
      imageUrls: [
        'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800&auto=format&fit=crop&q=80'
      ],
      description: 'Sunsets in Santorini are magical! 🌅 Can\'t get enough of this view. Truly feels like a dream. #Greece #TravelGoals #Wanderlust',
      likesCount: 42,
      hasLiked: false,
      comments: [
        { username: 'Alex Carter', text: 'This looks absolutely breathtaking! 😍', createdAt: '2 hours ago' },
        { username: 'Liam Wilson', text: 'Added to my bucket list! Which hotel did you stay at?', createdAt: '1 hour ago' }
      ],
      createdAt: '3 hours ago'
    },
    {
      id: 2,
      authorName: 'Liam Wilson',
      authorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      location: 'Kyoto, Japan',
      imageUrls: [
        'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1503899036084-c55cdd92da26?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1490806843957-31f4c9a91c65?w=800&auto=format&fit=crop&q=80'
      ],
      description: 'Peace and serenity in Kyoto. The historic temples and gardens are out of this world. 🎋🇯🇵 #Kyoto #ExploreJapan #Nature',
      likesCount: 29,
      hasLiked: false,
      comments: [
        { username: 'Emma Watson', text: 'Unreal! The lighting in this photo is perfect.', createdAt: '4 hours ago' },
        { username: 'Sophia Martinez', text: 'I need to go there next spring!', createdAt: '3 hours ago' }
      ],
      createdAt: '5 hours ago'
    },
    {
      id: 3,
      authorName: 'Emma Watson',
      authorAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&auto=format&fit=crop&q=80',
      location: 'Amalfi Coast, Italy',
      imageUrls: [
        'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=800&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1527631746610-bca00a040d60?w=800&auto=format&fit=crop&q=80'
      ],
      description: 'Gelato, beautiful coastlines, and endless sunshine. Life is sweet here! 🍦🇮🇹 #Amalfi #Italia #RoadTrip',
      likesCount: 56,
      hasLiked: false,
      comments: [
        { username: 'Alex Carter', text: 'Save some gelato for me!', createdAt: '6 hours ago' },
        { username: 'Liam Wilson', text: 'Wow, beautiful perspective Emma!', createdAt: '5 hours ago' }
      ],
      createdAt: '7 hours ago'
    }
  ];

  constructor() {
    this.loadPosts();
  }

  private loadPosts(): void {
    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        
        // Force reset default posts if Ahmed's post is missing, to reload the multi-image gallery
        const needsReset = parsed.length < 4 || !parsed.some((p: any) => p.authorName === 'Ahmed');

        if (needsReset) {
          this.posts$.next(this.defaultPosts);
          this.saveToStorage(this.defaultPosts);
          return;
        }

        const migrated = parsed.map((p: any) => {
          if (p.imageUrl && !p.imageUrls) {
            p.imageUrls = [p.imageUrl];
            delete p.imageUrl;
          }
          return p;
        });
        this.posts$.next(migrated);
      } catch (e) {
        this.posts$.next(this.defaultPosts);
        this.saveToStorage(this.defaultPosts);
      }
    } else {
      this.posts$.next(this.defaultPosts);
      this.saveToStorage(this.defaultPosts);
    }
  }

  private saveToStorage(posts: FeedPost[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(posts));
  }

  getPosts(): Observable<FeedPost[]> {
    return this.posts$.asObservable();
  }

  likePost(postId: number, username: string): void {
    const currentPosts = this.posts$.value.map(post => {
      if (post.id === postId) {
        const hasLiked = !post.hasLiked;
        const likesCount = hasLiked ? post.likesCount + 1 : post.likesCount - 1;
        return {
          ...post,
          hasLiked,
          likesCount
        };
      }
      return post;
    });

    this.posts$.next(currentPosts);
    this.saveToStorage(currentPosts);
  }

  addComment(postId: number, commentText: string, username: string): void {
    if (!commentText.trim()) return;

    const currentPosts = this.posts$.value.map(post => {
      if (post.id === postId) {
        const comments = [
          ...post.comments,
          {
            username,
            text: commentText,
            createdAt: 'Just now'
          }
        ];
        return {
          ...post,
          comments
        };
      }
      return post;
    });

    this.posts$.next(currentPosts);
    this.saveToStorage(currentPosts);
  }

  createPost(
    description: string,
    imageUrls: string[],
    location: string,
    authorName: string,
    authorAvatar: string
  ): void {
    const newPost: FeedPost = {
      id: Date.now(),
      authorName,
      authorAvatar: authorAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      location,
      imageUrls,
      description,
      likesCount: 0,
      hasLiked: false,
      comments: [],
      createdAt: 'Just now'
    };

    const currentPosts = [newPost, ...this.posts$.value];
    this.posts$.next(currentPosts);
    this.saveToStorage(currentPosts);
  }
}
