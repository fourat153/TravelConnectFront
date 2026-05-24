import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  return auth.verifySession().pipe(
    map(isValid => {
      if (isValid) return true;
      return router.createUrlTree(['auth/login']);
    }),
    catchError(() => {
      return of(router.createUrlTree(['auth/login']));
    })
  );
};