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

  updateProfile(data: {
    firstname: string;
    lastname: string;
    email: string;
    gender?: string;
    phone_number?: string;
    city_lat?: number;
    city_lon?: number;
    profile_picture?: File | null;
  }) {
    const formData = new FormData();
    formData.append('firstname', data.firstname);
    formData.append('lastname', data.lastname);
    formData.append('email', data.email);
    if (data.gender) formData.append('gender', data.gender);
    if (data.phone_number) formData.append('phone_number', data.phone_number);
    if (data.city_lat !== undefined && data.city_lat !== null) formData.append('city_lat', data.city_lat.toString());
    if (data.city_lon !== undefined && data.city_lon !== null) formData.append('city_lon', data.city_lon.toString());
    if (data.profile_picture) {
      formData.append('profile_picture', data.profile_picture);
    }
    return this.http.put<User>(`${this.baseUrl}/users/me`, formData, { withCredentials: true });
  }

  getUserCity() {
    return this.http.get<{ lat?: number; long?: number }>(`${this.baseUrl}/users/me/city`, { withCredentials: true });
  }

  logout() {
    return this.http.post(`${this.baseUrl}/logout`, {}, { withCredentials: true });
  }

}