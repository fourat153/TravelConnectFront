export interface FriendData {
  friend_id: number;
  username: string;
  profile_picture?: string;
}

export interface FriendsOut {
  status_code: number;
  message: string;
  data?: FriendData[];
  total_pages?: number;
  total_records?: number;
  page_size?: number;
  page_number?: number;
}

export interface FriendFirstStop {
  lat: number;
  lon: number;
  stop_title: string;
}

export type RelationshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

export interface UserSearchResult {
  id: number;
  name: string;
  avatarUrl: string | null;
  relationshipStatus: 'none' | 'pending_sent' | 'pending_received';
}

export interface FriendshipRequest {
  message: string | null;
  status_code: number | null;
  id: number;
  sender_id: number;
  receiver_id: number;
  status: 'pending' | 'accepted' | 'refused';
}

export interface IncomingFriendshipRequest extends FriendshipRequest {
  status: 'pending';
  sender_name: string;
  sender_avatar: string | null;
}