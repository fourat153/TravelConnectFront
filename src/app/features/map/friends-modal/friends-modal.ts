import { Component, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { AvatarModule } from 'primeng/avatar';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';

import { FriendService } from '../../../core/services/friends';
import { FriendData } from '../../../shared/models/friends';

@Component({
  selector: 'app-friends-modal',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    ProgressSpinnerModule,
    AvatarModule,
    InputIconModule,
    IconFieldModule,
    PaginatorModule,
  ],
  templateUrl: './friends-modal.html',
  styleUrl: './friends-modal.scss',
})
export class FriendsModalComponent implements OnInit {
  @Output() closed         = new EventEmitter<void>();
  @Output() friendSelected = new EventEmitter<FriendData>();

  friends:  FriendData[] = [];
  filtered: FriendData[] = [];

  searchQuery  = '';
  loading      = false;
  error        = '';
  currentPage  = 1;
  pageSize     = 10;
  totalRecords = 0;

  constructor(
    private friendService: FriendService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadFriends();
  }

  loadFriends(): void {
    this.loading = true;
    this.error   = '';

    this.friendService.getMyFriends(this.currentPage, this.pageSize).subscribe({
      next: (res) => {
        this.loading = false;
        if (res.status_code === 200 && res.data) {
          this.friends      = res.data;
          this.filtered     = [...res.data];
          this.totalRecords = res.total_records ?? 0;
        } else {
          this.friends      = [];
          this.filtered     = [];
          this.totalRecords = 0;
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.loading = false;
        this.error   = 'Could not load friends.';
        this.cdr.markForCheck();
      }
    });
  }

  onPageChange(event: PaginatorState): void {
    this.currentPage = (event.page ?? 0) + 1;
    this.pageSize    = event.rows ?? this.pageSize;
    this.searchQuery = '';
    this.loadFriends();
  }

  onSearch(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filtered = q
      ? this.friends.filter(f => f.username.toLowerCase().includes(q))
      : [...this.friends];
  }

  select(friend: FriendData): void {
    this.friendSelected.emit(friend);
  }

  onHide(): void {
    this.closed.emit();
  }

  initials(name: string): string {
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
  }
}