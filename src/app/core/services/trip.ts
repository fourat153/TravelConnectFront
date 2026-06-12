import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TripBaseOut, TripCreate, TripsOut } from '../../shared/models/trip'; 
@Injectable({ providedIn: 'root' })
export class TripService {
  private base = 'http://localhost:8000';
 
  constructor(private http: HttpClient) {}
 
  createTrip(payload: TripCreate): Observable<TripBaseOut> {
    return this.http.post<TripBaseOut>(`${this.base}/trips`, payload , { withCredentials: true });
  }
 
  getMyTrips(): Observable<TripsOut> {
    return this.http.get<TripsOut>(`${this.base}/trips/me?_=${new Date().getTime()}` ,{ withCredentials: true });
  }
}
 