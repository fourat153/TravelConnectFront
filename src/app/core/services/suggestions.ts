import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map } from 'rxjs/operators';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SuggestionUser, SuggestionsOut } from '../../shared/models/user';

@Injectable({
  providedIn: 'root'
})
export class SuggestionsService {
  private baseUrl = environment.apiUrl;
  private suggestions$ = new BehaviorSubject<SuggestionUser[]>([]);

  constructor(private http: HttpClient) {}

  loadSuggestions(): void {
    this.http
      .get<SuggestionsOut>(`${this.baseUrl}/users/suggestions`, { withCredentials: true })
      .subscribe({
        next: (res) => this.suggestions$.next(res.data ?? []),
        error: (err) => console.error('Failed to load suggestions', err)
      });
  }

  getSuggestions(): Observable<SuggestionUser[]> {
    return this.suggestions$.asObservable();
  }

  removeSuggestion(userId: number): void {
    const current = this.suggestions$.getValue();
    this.suggestions$.next(current.filter(u => u.id !== userId));
  }
}