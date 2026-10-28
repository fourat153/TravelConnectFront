import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TripBaseOut, TripCreate, TripsOut } from '../../shared/models/trip';
import { environment } from '../../../environments/environment';
@Injectable({ providedIn: 'root' })
export class TripService {
  private base = environment.apiUrl;
 
  constructor(private http: HttpClient) {}
 
  createTrip(payload: TripCreate): Observable<TripBaseOut> {
    return this.http.post<TripBaseOut>(`${this.base}/trips`, payload , { withCredentials: true });
  }
 
  getMyTrips(): Observable<TripsOut> {
    return this.http.get<TripsOut>(`${this.base}/trips/me?_=${new Date().getTime()}` ,{ withCredentials: true });
  }

  deleteTrip(tripId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/trips/${tripId}`, { withCredentials: true });
  }
}
 