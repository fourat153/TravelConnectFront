import { ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { FriendService } from '../../core/services/friends';
import { IncomingFriendshipRequest } from '../../shared/models/friends';

@Component({
  selector: 'app-friend-requests',
  standalone: true,
  imports: [CommonModule, BottomNavComponent],
  templateUrl: './friend-requests.html',
  styleUrl: './friend-requests.scss'
})
export class FriendRequests implements OnInit {
  private friendService = inject(FriendService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  requests: IncomingFriendshipRequest[] = [];
  loading = true;
  actionRequestId: number | null = null;
  errorMessage = '';

  ngOnInit(): void {
    this.loadRequests();
  }

  loadRequests(): void {
    this.loading = true;
    this.errorMessage = '';
    this.friendService.getIncomingFriendRequests().subscribe({
      next: (requests) => {
        this.requests = requests;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = 'Failed to load incoming friend requests.';
        this.cdr.detectChanges();
      }
    });
  }

  respondToRequest(request: IncomingFriendshipRequest, action: 'accept' | 'decline'): void {
    if (this.actionRequestId !== null) return;

    this.actionRequestId = request.id;
    const request$ = action === 'accept'
      ? this.friendService.acceptFriendRequest(request.id)
      : this.friendService.declineFriendRequest(request.id);

    request$.subscribe({
      next: () => {
        this.requests = this.requests.filter(item => item.id !== request.id);
        this.actionRequestId = null;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.actionRequestId = null;
        this.errorMessage = `Failed to ${action} friend request. Please try again.`;
        this.cdr.detectChanges();
      }
    });
  }

  senderName(request: IncomingFriendshipRequest): string {
    return request.sender_name || `User ${request.sender_id}`;
  }

  senderInitials(request: IncomingFriendshipRequest): string {
    return request.sender_name
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'TR';
  }

  viewSender(request: IncomingFriendshipRequest): void {
    this.router.navigate(['/profile', request.sender_id]);
  }

  onNavTabChanged(tab: NavTab): void {
    if (tab === 'profile') {
      this.router.navigate(['/profile']);
    } else {
      this.router.navigate(['/map'], { queryParams: { tab } });
    }
  }
}
