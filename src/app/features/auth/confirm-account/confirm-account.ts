import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

import { AuthService } from '../../../core/services/auth';
import { confirmation_code } from '../../../shared/models/confirmation_code';

@Component({
  selector: 'app-confirm-account',
  imports: [CommonModule],
  templateUrl: './confirm-account.html',
  styleUrl: './confirm-account.scss'
})
export class ConfirmAccountComponent implements OnInit {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
 private authService = inject(AuthService);

  status: 'loading' | 'success' | 'error' = 'loading';
  message = '';
  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      const code = params['confirmation_code'];
      const registered = params['registered']?.toLowerCase() === 'true';
      const user_id = +params['user_id'];
 
      if (!code) {
        this.status = 'error';
        this.message = 'Invalid confirmation link.';
        setTimeout(() => this.router.navigate(['/login']), 2000);
        return;
      }
           const confirmation: confirmation_code = {
            user_id: user_id,
            confirmation_code: code
};
      this.authService.confirmAccount(confirmation).subscribe({
        next: (res: any) => {
          if (res.status_code === 200) {
            this.status = 'success';
            this.message = res.message;
            setTimeout(() => {
              this.router.navigate(['/login'], {
                queryParams: registered ? { registered: 'true' } : {}
              });
            }, 2000);
          } else {
            this.status = 'error';
            this.message = res.message;
            setTimeout(() => this.router.navigate(['/login']), 2000);
          }
        },
        error: () => {
          this.status = 'error';
          this.message = 'Something went wrong. Please try again.';
          setTimeout(() => this.router.navigate(['/login']), 2000);
        }
      });
    });
  }
}