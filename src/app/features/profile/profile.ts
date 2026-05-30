import { Component, OnInit, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BottomNavComponent, NavTab } from '../../shared/components/bottom-nav/bottom-nav';
import { AuthService } from '../../core/services/auth';
import { User } from '../../shared/models/user';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, BottomNavComponent, ButtonModule],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);

  user: User | null = null;
  userInitials = '';

  // Edit Mode state
  isEditMode = false;
  editForm = {
    firstname: '',
    lastname: '',
    email: '',
    gender: '',
    phone_number: '',
    city_lat: null as number | null,
    city_lon: null as number | null,
  };

  // City Autocomplete state
  citySearchQuery = '';
  citySuggestions: any[] = [];
  selectedCity: any = null;
  private searchTimeout: any;

  // Image Upload state
  selectedFile: File | null = null;
  imagePreview: string | null = null;
  errorMessage = '';
  successMessage = '';
  isSaving = false;

  ngOnInit() {
    this.authService.currentUser$.subscribe((currentUser) => {
      if (currentUser) {
        this.user = currentUser;
        this.userInitials =
          (currentUser.firstname?.[0] ?? '') + (currentUser.lastname?.[0] ?? '');
        this.resetForm();
        this.fetchUserCity();
      } else {
        // Fetch current user if not loaded in BehaviorSubject
        this.authService.fetchCurrentUser();
      }
    });
  }

  fetchUserCity() {
    this.authService.getUserCity().subscribe({
      next: (res: any) => {
        if (res && res.lat && res.long) {
          this.editForm.city_lat = res.lat;
          this.editForm.city_lon = res.long;
          // Reverse geocode to get a readable name for the city query
          this.reverseGeocode(res.lat, res.long);
        }
      },
      error: () => {
        console.log('City coordinates not found or set yet.');
      },
    });
  }

  reverseGeocode(lat: number, lon: number) {
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`)
      .then((res) => res.json())
      .then((data) => {
        if (data && data.display_name) {
          const address = data.address;
          const cityName = address.city || address.town || address.village || address.suburb || data.display_name.split(',')[0];
          this.citySearchQuery = cityName;
          this.cdr.detectChanges();
        }
      })
      .catch((err) => console.error('Error reverse geocoding:', err));
  }

  resetForm() {
    if (this.user) {
      this.editForm.firstname = this.user.firstname || '';
      this.editForm.lastname = this.user.lastname || '';
      this.editForm.email = this.user.email || '';
      this.editForm.gender = this.user.gender || '';
      this.editForm.phone_number = this.user.phone_number || '';
      this.imagePreview = this.user.profile_picture || null;
      this.selectedFile = null;
    }
  }

  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    if (!this.isEditMode) {
      this.resetForm();
      this.fetchUserCity();
    }
    this.errorMessage = '';
    this.successMessage = '';
  }

  onCitySearch() {
    clearTimeout(this.searchTimeout);
    if (!this.citySearchQuery || this.citySearchQuery.length < 3) {
      this.citySuggestions = [];
      return;
    }
    this.searchTimeout = setTimeout(() => {
      fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          this.citySearchQuery
        )}&limit=5`
      )
        .then((res) => res.json())
        .then((results) => {
          this.citySuggestions = results;
          this.cdr.detectChanges();
        });
    }, 400);
  }

  selectCity(suggestion: any) {
    this.selectedCity = suggestion;
    this.editForm.city_lat = parseFloat(suggestion.lat);
    this.editForm.city_lon = parseFloat(suggestion.lon);
    this.citySearchQuery = suggestion.display_name.split(',')[0];
    this.citySuggestions = [];
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        this.errorMessage = 'Please select a valid image file.';
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        this.errorMessage = 'Image size should be less than 5MB.';
        return;
      }
      this.selectedFile = file;
      this.errorMessage = '';

      const reader = new FileReader();
      reader.onload = () => {
        this.imagePreview = reader.result as string;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  triggerFileInput(fileInput: HTMLInputElement) {
    if (this.isEditMode) {
      fileInput.click();
    }
  }

  saveProfile() {
    if (!this.editForm.firstname || !this.editForm.lastname || !this.editForm.email) {
      this.errorMessage = 'First name, last name, and email are required.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';
    this.successMessage = '';

    this.authService
      .updateProfile({
        firstname: this.editForm.firstname,
        lastname: this.editForm.lastname,
        email: this.editForm.email,
        gender: this.editForm.gender,
        phone_number: this.editForm.phone_number,
        city_lat: this.editForm.city_lat ?? undefined,
        city_lon: this.editForm.city_lon ?? undefined,
        profile_picture: this.selectedFile,
      })
      .subscribe({
        next: (updatedUser) => {
          this.isSaving = false;
          this.isEditMode = false;
          this.successMessage = 'Profile updated successfully!';
          this.authService.currentUser$.next(updatedUser);
        },
        error: (err) => {
          this.isSaving = false;
          this.errorMessage = err.error?.message || 'Failed to update profile. Please try again.';
          this.cdr.detectChanges();
        },
      });
  }

  logout() {
    this.authService.logout().subscribe({
      next: () => {
        this.authService.currentUser$.next(null);
        this.router.navigate(['/auth/login']);
      },
      error: (err) => {
        console.error('Logout failed:', err);
      }
    });
  }

  onNavTabChanged(tab: NavTab): void {
    if (tab === 'profile') {
      return;
    }
    // Redirect back to map dashboard with the tab selector
    this.router.navigate(['/map'], { queryParams: { tab } });
  }
}
