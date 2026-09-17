import { Component, signal, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Toast } from 'primeng/toast';
import { AuthService } from './core/services/auth';
import { FirebaseMessagingService } from './core/services/firebase-messaging';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Toast],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnInit {
  protected readonly title = signal('travelconnect-frontend');
  private authService = inject(AuthService);
  private firebaseMessagingService = inject(FirebaseMessagingService);

  ngOnInit() {
    this.authService.fetchCurrentUser();
  }

  onToastClick(message: any) {
    this.firebaseMessagingService.handleToastClick(message);
  }
}
