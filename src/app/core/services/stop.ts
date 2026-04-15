import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {StopBaseOut, StopCreate, StopsOut } from '../../shared/models/stop'; 
@Injectable({ providedIn: 'root' })
export class StopsService {
  private base = 'http://localhost:8000';
 
  constructor(private http: HttpClient) {}
 
  createStop(payload: StopCreate , tripId: number ): Observable<StopBaseOut> {
    return this.http.post<StopBaseOut>(`${this.base}/trips/${tripId}/stops`, payload , { withCredentials: true });
  }
 
  getTripStops(tripId: number): Observable<StopsOut> {
    return this.http.get<StopsOut>(`${this.base}/trips/${tripId}/stops` ,{ withCredentials: true });
  }
}
 