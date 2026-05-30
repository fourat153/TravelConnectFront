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