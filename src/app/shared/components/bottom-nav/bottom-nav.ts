import { Component, Output, EventEmitter, Input, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { NotificationsPanelComponent } from '../notifications-panel/notifications-panel.component';
import { NotificationService } from '../../../core/services/notification';

export type NavTab = 'home' | 'friends' | 'add-stop' | 'my-trips' | 'profile' | 'feed';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, ButtonModule, BadgeModule, NotificationsPanelComponent],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
})
export class BottomNavComponent implements OnInit {
  @ViewChild('notifPanel') notifPanel?: NotificationsPanelComponent;
  @Output() tabChanged = new EventEmitter<NavTab>();

  @Input() active: NavTab = 'home';
  expanded = false;

  private notificationService = inject(NotificationService);
  unreadCount$ = this.notificationService.unreadCount$;

  ngOnInit(): void {
    this.notificationService.refreshNotifications();
  }

  select(tab: NavTab): void {
    this.active = tab;
    this.tabChanged.emit(tab);
  }

  openNotifications(event: Event, target?: any): void {
    if (this.notifPanel) {
      this.notifPanel.toggle(event, target);
    }
  }
}
