import { ChangeDetectionStrategy, Component, OnInit, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged, switchMap, catchError, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { FriendService } from '../../core/services/friends';
import { IncomingFriendshipRequest, UserSearchResult } from '../../shared/models/friends';

@Component({
  selector: 'app-friend-requests',
  standalone: true,
  imports: [CommonModule, BottomNavComponent],
  templateUrl: './friend-requests.html',
  styleUrl: './friend-requests.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FriendRequests implements OnInit {
  private friendService = inject(FriendService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private searchQuery$ = new Subject<string>();

  requests = signal<IncomingFriendshipRequest[]>([]);
  loading = signal(true);
  actionRequestId = signal<number | null>(null);
  errorMessage = signal('');
  searchResults = signal<UserSearchResult[]>([]);
  searchLoading = signal(false);
  searchError = signal('');
  searchQuery = signal('');

  ngOnInit(): void {
    this.loadRequests();
    this.searchQuery$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef),
        switchMap(query => {
          this.searchLoading.set(query.length > 0);
          this.searchError.set('');
          if (!query) {
            this.searchResults.set([]);
            return of([]);
          }
          return this.friendService.searchUsers(query).pipe(
            catchError(() => {
              this.searchError.set('Failed to search users. Please try again.');
              return of([]);
            })
          );
        })
      )
      .subscribe(results => {
        this.searchResults.set(results);
        this.searchLoading.set(false);
      });
  }

  loadRequests(): void {
    this.loading.set(true);
    this.errorMessage.set('');
    this.friendService.getIncomingFriendRequests().subscribe({
      next: (requests) => {
        this.requests.set(requests);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.errorMessage.set('Failed to load incoming friend requests.');
      }
    });
  }

  respondToRequest(request: IncomingFriendshipRequest, action: 'accept' | 'decline'): void {
    if (this.actionRequestId() !== null) return;

    this.actionRequestId.set(request.id);
    const request$ = action === 'accept'
      ? this.friendService.acceptFriendRequest(request.id)
      : this.friendService.declineFriendRequest(request.id);

    request$.subscribe({
      next: () => {
        this.requests.update(requests => requests.filter(item => item.id !== request.id));
        this.actionRequestId.set(null);
      },
      error: (err) => {
        this.actionRequestId.set(null);
        this.errorMessage.set(`Failed to ${action} friend request. Please try again.`);
      }
    });
  }

  onSearchInput(event: Event): void {
    const query = (event.target as HTMLInputElement).value;
    const normalizedQuery = query.trim();
    this.searchQuery.set(normalizedQuery);
    this.searchQuery$.next(normalizedQuery);
  }

  sendRequest(user: UserSearchResult): void {
    if (this.actionRequestId() !== null || user.relationshipStatus !== 'none') return;

    this.actionRequestId.set(user.id);
    this.friendService.sendFriendRequest(user.id).subscribe({
      next: () => {
        this.searchResults.update(results =>
          results.map(result =>
            result.id === user.id
              ? { ...result, relationshipStatus: 'pending_sent' }
              : result
          )
        );
        this.actionRequestId.set(null);
      },
      error: () => {
        this.actionRequestId.set(null);
        this.searchError.set('Failed to send friend request. Please try again.');
      }
    });
  }

  userInitials(user: UserSearchResult): string {
    return user.name
      .split(/\s+/)
      .map(part => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'TR';
  }

  viewUser(userId: number): void {
    this.router.navigate(['/profile', userId]);
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
