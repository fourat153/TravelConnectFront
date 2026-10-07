import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Notification } from '../../shared/models/notification';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  private notificationsSubject = new BehaviorSubject<Notification[]>([]);
  notifications$ = this.notificationsSubject.asObservable();

  unreadCount$ = this.notifications$.pipe(
    map((notifications) => notifications.filter(n => !n.is_read).length)
  );

  /**
   * Fetches notifications from the backend and updates the reactive subject.
   */
  getNotifications(): Observable<Notification[]> {
    return this.http.get<any>(`${this.baseUrl}/notifications`, {
      withCredentials: true
    }).pipe(
      map((res) => {
        // Handle both raw list and wrapped payload formats gracefully
        const notifications = Array.isArray(res)
          ? res
          : res && Array.isArray(res.data)
            ? res.data
            : res && Array.isArray(res.notifications)
              ? res.notifications
              : [];

        return notifications.map((notification: Notification & { tripId?: number | string | null }) => {
          const rawTripId = notification.trip_id ?? notification.tripId;
          const tripId = typeof rawTripId === 'string' ? Number(rawTripId) : rawTripId;

          return {
            ...notification,
            trip_id: typeof tripId === 'number' && Number.isInteger(tripId) && tripId > 0
              ? tripId
              : null
          };
        });
      }),
      tap((notifications) => {
        this.notificationsSubject.next(notifications);
      })
    );
  }

  /**
   * Marks a specific notification as read and updates the internal state immediately.
   */
  markAsRead(notificationId: number): Observable<any> {
    return this.http.patch<any>(
      `${this.baseUrl}/notifications/${notificationId}/read`,
      {},
      { withCredentials: true }
    ).pipe(
      tap(() => {
        const currentList = this.notificationsSubject.getValue();
        const updatedList = currentList.map((n) => {
          if (n.id === notificationId) {
            return {
              ...n,
              is_read: true,
              read_at: new Date().toISOString()
            };
          }
          return n;
        });
        this.notificationsSubject.next(updatedList);
      })
    );
  }

  refreshNotifications(): void {
    this.getNotifications().subscribe({
      error: () => {}
    });
  }
}
