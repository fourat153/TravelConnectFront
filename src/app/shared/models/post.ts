export interface ImageOut {
  id: number;
  link: string;
  caption: string | null;
}

export interface CommentData {
  id?: number;
  userId?: number;
  postId?: number;
  parentId?: number | null;
  username: string;
  text: string;
  createdAt?: string;
  replyToUsername?: string;
}

export interface PostOut {
  id: number;
  stop_id: number;
  title: string;
  created_at: string;
  images: ImageOut[];
  likes_count?: number;
  has_liked?: boolean;
  comments?: CommentData[];
}

export interface PostsOut {
  status_code: number;
  message: string;
  posts: PostOut[];
}

export interface SinglePostOut {
  status_code: number;
  message: string;
  post: PostOut | null;
}