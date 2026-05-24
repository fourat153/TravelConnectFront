import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, of } from 'rxjs';
import { confirmation_code } from '../../shared/models/confirmation_code';
import { User } from '../../shared/models/user';
@Injectable({
  providedIn: 'root',
})
export class AuthService  {

  private baseUrl = environment.apiUrl;
  currentUser$ = new BehaviorSubject<User | null>(null);
  constructor(private http: HttpClient) {}

  register(data: {
    firstname: string;
    lastname: string;
    email: string;
    password: string;
  }) {
    return this.http.post(`${this.baseUrl}/users`, data);
  }
  login(data: { username: string; password: string }) {
  const formData = new FormData();
  formData.append('username', data.username);
  formData.append('password', data.password);
  return this.http.post(`${this.baseUrl}/login`, formData, { withCredentials: true });
}
verifySession() {
  return this.http.get<{ valid: boolean }>(`${this.baseUrl}/auth/verify`, {
    withCredentials: true  
  }).pipe(
    map(res => res.valid),
    catchError(() => of(false))
  );
}
 confirmAccount( confirmationcode: confirmation_code ) {
    return this.http.patch(`${this.baseUrl}/confirmAccount`, confirmationcode);
  }

  fetchCurrentUser() {  
    return this.http.get<User>(`${this.baseUrl}/users/me`, { withCredentials: true })
      .subscribe(user => this.currentUser$.next(user));
  }

  logout() {
  return this.http.post(`${this.baseUrl}/logout`, {}, { withCredentials: true });
}

}