import { Injectable, inject } from '@angular/core';
import { getToken, onMessage, MessagePayload } from 'firebase/messaging';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, Subject } from 'rxjs';
import { MessageService } from 'primeng/api';
import { environment } from '../../../environments/environment';

import { messaging } from '../firebase';
import { NotificationService } from './notification';

@Injectable({
    providedIn: 'root'
})
export class FirebaseMessagingService {
    private http = inject(HttpClient);
    private router = inject(Router);
    private notificationService = inject(NotificationService);
    private messageService = inject(MessageService);
    private baseUrl = environment.apiUrl;

    private currentMessageSubject = new Subject<MessagePayload>();
    currentMessage$ = this.currentMessageSubject.asObservable();

    constructor() {
        this.listenToForegroundMessages();
    }

    async getFCMToken(): Promise<string | null> {
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            return null;
        }

        try {
            const token = await getToken(messaging, {
                vapidKey: 'BJ8f1d3zLK-VexZZ6ROvf2MkSbnjuoYOJsAFKBzD53rVOCwSWGliKlhNWtaVY8wc4SOeivWOxirGnqvwG7vuOZ4'
            });

            return token;
        } catch (error) {
            return null;
        }
    }

    registerToken(token: string): Observable<any> {
        return this.http.post(
            `${this.baseUrl}/notifications/device-token`,
            { token },
            { withCredentials: true }
        );
    }

    /**
     * Listens for incoming FCM messages while the app is in the foreground.
     */
    listenToForegroundMessages(): void {
        try {
            onMessage(messaging, (payload: MessagePayload) => {
                const title = payload.notification?.title || payload.data?.['title'] || 'New Notification';
                const body = payload.notification?.body || payload.data?.['body'] || '';

                const rawPostId = payload.data?.['post_id'] || payload.data?.['postId'];
                const postId = rawPostId ? parseInt(rawPostId.toString(), 10) : null;

                const rawTripId = payload.data?.['trip_id'] || payload.data?.['tripId'];
                const tripId = rawTripId ? parseInt(rawTripId.toString(), 10) : null;

                const rawActorId = payload.data?.['actor_id'] || payload.data?.['actorId'];
                const actorId = rawActorId ? parseInt(rawActorId.toString(), 10) : null;

                const customUrl = payload.data?.['url'] || payload.data?.['click_action'];
                const notificationType = payload.data?.['type'] || payload.data?.['notification_type'];
                // Show visual PrimeNG Toast notification in app
                this.messageService.add({
                    severity: 'info',
                    summary: title,
                    detail: body,
                    life: 6000,
                    data: { postId, tripId, actorId, customUrl, notificationType }
                });

                // Emit payload to any active subscribers
                this.currentMessageSubject.next(payload);

                // Automatically update UI state and unread count by fetching the latest notifications
                this.notificationService.refreshNotifications();
            });
        } catch (error) {}
    }

    /**
     * Handles click event on PrimeNG toast message.
     */
    handleToastClick(message: any): void {
        const postId = message?.data?.postId;
        const rawTripId = message?.data?.tripId;
        const tripId = rawTripId ? Number(rawTripId) : null;
        const actorId = message?.data?.actorId;
        const customUrl = message?.data?.customUrl;
        const rawType = (message?.data?.notificationType || '').toLowerCase();
        const notificationType = this.getNotificationType(message?.data?.notificationType);

        if (typeof tripId === 'number' && Number.isInteger(tripId) && tripId > 0) {
            this.router.navigate(['/map'], {
                queryParams: {
                    tripId,
                    ownerId: actorId || undefined
                }
            });
            return;
        }

        if (rawType.includes('trip')) {
            return;
        }

        if (postId) {
            this.router.navigate(['/post', postId]);
            return;
        }

        if (notificationType === 'friend_request') {
            this.router.navigate(['/friend-requests']);
            return;
        }

        if (notificationType === 'friend_accepted' && actorId) {
            this.router.navigate(['/profile', actorId]);
            return;
        }

        if (actorId) {
            this.router.navigate(['/profile', actorId]);
            return;
        }

        if (customUrl) {
            this.router.navigateByUrl(customUrl);
            return;
        }
    }

    private getNotificationType(type: string | undefined): 'friend_request' | 'friend_accepted' | null {
        const normalized = type?.toLowerCase() ?? '';
        if (normalized.includes('accept')) return 'friend_accepted';
        if (normalized.includes('friend') && normalized.includes('request')) return 'friend_request';
        return null;
    }
}
