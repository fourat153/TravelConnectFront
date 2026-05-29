export interface ImageOut {
  id: number;
  link: string;
  caption: string | null;
}

export interface PostOut {
  id: number;
  stop_id: number;
  title: string;
  created_at: string;
  images: ImageOut[];
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