import { OnboardingStatus } from "../enums/onboarding";

export interface OnboardingOut {
  has_completed_onboarding: OnboardingStatus;
}