import { Component, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { PopoverModule, Popover } from 'primeng/popover';
import { ButtonModule } from 'primeng/button';
import { Notification } from '../../models/notification';
import { NotificationService } from '../../../core/services/notification';

@Component({
  selector: 'app-notifications-panel',
  standalone: true,
  imports: [CommonModule, PopoverModule, ButtonModule],
  templateUrl: './notifications-panel.component.html',
  styleUrl: './notifications-panel.component.scss'
})
export class NotificationsPanelComponent {
  @ViewChild('popover') popover!: Popover;

  private notificationService = inject(NotificationService);
  private router = inject(Router);

  notifications$ = this.notificationService.notifications$;
  loading = false;
  errorMessage = '';

  toggle(event: Event, target?: any): void {
    if (this.popover) {
      this.popover.toggle(event, target);
    }
  }

  hide(): void {
    if (this.popover) {
      this.popover.hide();
    }
  }

  close(): void {
    this.hide();
  }


  loadNotifications(): void {
    this.loading = true;
    this.errorMessage = '';
    this.notificationService.getNotifications().subscribe({
      next: () => {
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.errorMessage = 'Failed to load notifications. Please try again.';
      }
    });
  }

  onNotificationClick(notification: Notification): void {
    if (!notification.is_read) {
      this.notificationService.markAsRead(notification.id).subscribe();
    }

    this.close();

    const type = notification.type?.toLowerCase() || '';

    const tripId = notification.trip_id;
    if (typeof tripId === 'number' && Number.isInteger(tripId) && tripId > 0) {
      this.router.navigate(['/map'], {
        queryParams: {
          tripId,
          ownerId: notification.actor_id || undefined
        }
      });
      return;
    }

    if (type.includes('trip')) {
      return;
    }

    if (notification.post_id) {
      this.router.navigate(['/post', notification.post_id]);
      return;
    }

    if (type.includes('friend') && type.includes('request')) {
      this.router.navigate(['/friend-requests']);
      return;
    }

    if (type.includes('friend') && type.includes('accept') && notification.actor_id) {
      this.router.navigate(['/profile', notification.actor_id]);
      return;
    }

    // Fallback navigation based on actor profile
    if (notification.actor_id) {
      this.router.navigate(['/profile', notification.actor_id]);
    }
  }

  getNotificationIcon(type: string): string {
    const lowerType = type?.toLowerCase() || '';
    if (lowerType.includes('friend') || lowerType.includes('follow') || lowerType.includes('connect')) {
      return 'pi pi-user-plus';
    }
    if (lowerType.includes('like') || lowerType.includes('heart')) {
      return 'pi pi-heart-fill';
    }
    if (lowerType.includes('comment')) {
      return 'pi pi-comment';
    }
    if (lowerType.includes('trip') || lowerType.includes('stop')) {
      return 'pi pi-map-marker';
    }
    return 'pi pi-bell';
  }

  getNotificationTypeClass(type: string): string {
    const lowerType = type?.toLowerCase() || '';
    if (lowerType.includes('trip') || lowerType.includes('stop')) return 'type-trip';
    if (lowerType.includes('friend') || lowerType.includes('follow')) return 'type-friend';
    if (lowerType.includes('like')) return 'type-like';
    if (lowerType.includes('comment')) return 'type-comment';
    return 'type-general';
  }

  getNotificationMessage(notification: Notification): string {
    const type = notification.type?.toLowerCase() || '';
    if (type.includes('trip') || type === 'new_trip' || type === 'trip_created') {
      return 'created a new trip';
    }
    if (type === 'friend_request' || type === 'friend') {
      return 'sent you a friend request';
    }
    if (type === 'friend_accepted') {
      return 'accepted your friend request';
    }
    if (type === 'like' || type === 'post_like') {
      return 'liked your trip post';
    }
    if (type === 'comment' || type === 'post_comment') {
      return 'commented on your trip';
    }
    return notification.type || 'sent you a notification';
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMinutes / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMinutes < 1) return 'Just now';
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;

      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  }
}
