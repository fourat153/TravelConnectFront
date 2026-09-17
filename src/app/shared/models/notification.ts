export interface Notification {
  id: number;
  recipient_id: number;
  actor_id: number | null;
  post_id?: number | null;
  type: string;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface NotificationResponse {
  status_code?: number;
  message?: string;
  data?: Notification[];
}
