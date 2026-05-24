// src/app/shared/models/friend.model.ts

export interface FriendData {
  friend_id: number;
  username:  string;
}

export interface FriendsOut {
  status_code:    number;
  message:        string;
  data?:          FriendData[];
  total_pages?:   number;
  total_records?: number;
  page_size?:     number;
  page_number?:   number;
}