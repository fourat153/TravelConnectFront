import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FriendsOut } from '../../shared/models/friends';
import { environment } from '../../../environments/environment';
import { TripsOut } from '../../shared/models/trip';

@Injectable({ providedIn: 'root' })
export class FriendService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

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
}