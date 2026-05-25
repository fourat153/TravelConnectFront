import { Component, EventEmitter, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { PrivacyType } from '../../../shared/enums/PrivacyType';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
})
export class Onboarding {
  @Output() completed = new EventEmitter<{ lat: number; lon: number; privacy: PrivacyType }>();
  
  step = 1;
  searchQuery = '';
  suggestions: any[] = [];
  selectedCity: any = null;
  selectedPrivacy : PrivacyType | null = null;;
  private searchTimeout: any;
  protected readonly PrivacyType = PrivacyType;


  privacyOptions = [
  { value: PrivacyType.public, label: 'Public', desc: 'Anyone can see your trips' },
  { value: PrivacyType.friends_only, label: 'Friends only', desc: 'Only people you follow' },
  { value: PrivacyType.private, label: 'Private', desc: 'Only you' },
];


  onSearch() {
    clearTimeout(this.searchTimeout);
    if (!this.searchQuery || this.searchQuery.length < 3) {
      this.suggestions = [];
      return;
    }
    this.searchTimeout = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.searchQuery)}&limit=5`)
        .then(res => res.json())
        .then(results => { this.suggestions = results; });
    }, 400);
  }

  selectCity(suggestion: any) {
    this.selectedCity = suggestion;
    this.searchQuery = suggestion.display_name.split(',')[0];
    this.suggestions = [];
  }

  nextStep() {
    if (this.step === 1 && this.selectedCity) this.step = 2;
  }

complete() {
  if (!this.selectedPrivacy) return;
  this.completed.emit({

    lat: parseFloat(this.selectedCity.lat),
    lon: parseFloat(this.selectedCity.lon),
    privacy: this.selectedPrivacy,
  });
}
}