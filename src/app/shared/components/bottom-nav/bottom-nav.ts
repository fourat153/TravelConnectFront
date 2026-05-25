import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonModule } from 'primeng/button';

export type NavTab = 'home' | 'friends' | 'add-stop' | 'my-trips' | 'profile';

@Component({
  selector: 'app-bottom-nav',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './bottom-nav.html',
  styleUrl: './bottom-nav.scss',
})
export class BottomNavComponent {
  @Output() tabChanged = new EventEmitter<NavTab>();

  active: NavTab = 'home';
  expanded = false;

  select(tab: NavTab): void {
    this.active = tab;
    this.tabChanged.emit(tab);
  }
}