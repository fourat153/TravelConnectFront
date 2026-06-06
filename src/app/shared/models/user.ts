import { OnboardingStatus } from "../enums/onboarding";

export interface User {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  gender?: string;
  phone_number?: string;
  profile_picture?: string;
  has_completed_onboarding: OnboardingStatus;
}

export interface SuggestionUser {
  id: number;
  firstname: string;
  lastname: string;
  profile_picture: string | null;
  mutual_friends_count: number;
}
export interface SuggestionsOut {
  status_code: number;
  message: string;
  data: SuggestionUser[];
}