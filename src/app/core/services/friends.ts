import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  FriendsOut,
  FriendshipRequest,
  IncomingFriendshipRequest,
  RelationshipStatus,
  UserSearchResult
} from '../../shared/models/friends';
import { environment } from '../../../environments/environment';
import { TripsOut } from '../../shared/models/trip';

import { FriendFirstStop } from '../../shared/models/friends';

@Injectable({ providedIn: 'root' })
export class FriendService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }
  
  getMyFriends(page = 1, pageSize = 10): Observable<FriendsOut> {
    return this.http.get<FriendsOut>(
      `${this.baseUrl}/Friends/me`,
      {
        params: { page_number: page, page_size: pageSize },
        withCredentials: true,
      }
    );
  }

  getFriendTrips(friendId: number): Observable<TripsOut> {
    return this.http.get<TripsOut>(
      `${this.baseUrl}/trips/friend/${friendId}`,
      { withCredentials: true }
    );
  }


  getFriendFirstStop(friendId: number): Observable<FriendFirstStop> {
    return this.http.get<FriendFirstStop>(
      `${this.baseUrl}/trips/friend/${friendId}/first-stop`,
      { withCredentials: true }
    );
  }

  searchFriendsAndStops(query: string): Observable<any> {
    return this.http.get<any>(
      `${this.baseUrl}/Friends/search`,
      {
        params: { q: query },
        withCredentials: true
      }
    );
  }

  sendFriendRequest(receiverId: number): Observable<FriendshipRequest> {
    return this.http.post<FriendshipRequest>(
      `${this.baseUrl}/friendship-requests`,
      { receiver_id: receiverId },
      { withCredentials: true }
    );
  }

  getRelationshipStatus(userId: number): Observable<{ status: RelationshipStatus }> {
    return this.http.get<{ status: RelationshipStatus }>(
      `${this.baseUrl}/friendship-status/${userId}`,
      { withCredentials: true }
    );
  }

  getIncomingFriendRequests(pageNumber: number = 1, pageSize: number = 20): Observable<IncomingFriendshipRequest[]> {
    return this.http.get<any>(
      `${this.baseUrl}/friend-requests/incoming`,
      {
        params: { page_number: pageNumber, page_size: pageSize },
        withCredentials: true
      }
    ).pipe(
      map((res: any) => res?.requests ?? [])
    );
  }

  searchUsers(query: string, pageNumber: number = 1, pageSize: number = 20): Observable<UserSearchResult[]> {
    return this.http.get<any>(
      `${this.baseUrl}/users/search`,
      {
        params: { query, page_number: pageNumber, page_size: pageSize },
        withCredentials: true
      }
    ).pipe(
      map((res: any) => {
        const users = res?.users ?? [];
        return users.map((u: any) => ({
          id: u.id,
          name: u.name,
          avatarUrl: u.avatar_url ?? u.avatarUrl ?? null,
          relationshipStatus: u.relationship_status ?? u.relationshipStatus ?? 'none'
        }));
      })
    );
  }

  acceptFriendRequest(requestId: number): Observable<FriendshipRequest> {
    return this.http.patch<FriendshipRequest>(
      `${this.baseUrl}/friend-requests/${requestId}/accept`,
      null,
      { withCredentials: true }
    );
  }

  declineFriendRequest(requestId: number): Observable<FriendshipRequest> {
    return this.http.patch<FriendshipRequest>(
      `${this.baseUrl}/friend-requests/${requestId}/decline`,
      null,
      { withCredentials: true }
    );
  }
}
