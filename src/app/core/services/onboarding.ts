import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { OnboardingOut } from '../../shared/models/onboarding';
import { PrivacyType } from '../../shared/enums/PrivacyType';


@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  complete(data: { lat: number; lon: number; privacy: PrivacyType  }) {
    return this.http.post<OnboardingOut>(
      `${this.baseUrl}/users/me/onboarding`,
      { lat: data.lat, lon: data.lon, privacy: data.privacy },
      { withCredentials: true }
    );
  }
}