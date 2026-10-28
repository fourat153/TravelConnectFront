import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { StopBaseOut, StopCreate, StopsOut } from '../../shared/models/stop';
import { environment } from '../../../environments/environment';
@Injectable({ providedIn: 'root' })
export class StopsService {
  private base = environment.apiUrl;

  constructor(private http: HttpClient) { }

  createStop(payload: StopCreate, tripId: number): Observable<StopBaseOut> {
    return this.http.post<StopBaseOut>(`${this.base}/trips/${tripId}/stops`, payload, { withCredentials: true });
  }

  getTripStops(tripId: number): Observable<StopsOut> {
    return this.http.get<StopsOut>(`${this.base}/trips/${tripId}/stops?_=${new Date().getTime()}`, { withCredentials: true });
  }

  reorderStops(tripId: number, stopIds: number[]): Observable<any> {
    return this.http.put<any>(`${this.base}/trips/${tripId}/stops/reorder`, { stop_ids: stopIds }, { withCredentials: true });
  }

  deleteStop(stopId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/stops/${stopId}`, { withCredentials: true });
  }
}
