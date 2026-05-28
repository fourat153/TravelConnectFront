import { Routes } from '@angular/router';
import { authGuard } from './core/guards/guard';


export const routes: Routes = [
  {
    path: 'auth/register',
    loadComponent: () =>
      import('./features/auth/register/register').then(m => m.Register),
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login/login').then(m => m.Login),
  },
  {
    path: '',
    redirectTo: 'auth/login',
    pathMatch: 'full',
  },
  { 
  path: 'confirm-account',
  loadComponent: () => import('./features/auth/confirm-account/confirm-account')
  .then(m => m.ConfirmAccountComponent) 
}
  ,
    {
  path: 'map',
  loadComponent: () =>
    import('./features/map/map').then(m => m.Map),
    canActivate: [authGuard]
},
{
  path: 'feed',
  loadComponent: () =>
    import('./features/feed/feed').then(m => m.FeedComponent),
  canActivate: [authGuard]
},
{
    path: '**',
    redirectTo: 'auth/login',
  }

];