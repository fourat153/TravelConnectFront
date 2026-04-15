import { Onboarding } from "../../features/profile/onboarding/onboarding";

export interface User {
  id: number;
  email: string;
  firstname: string;
  lastname: string;
  has_completed_onboarding: Onboarding;
}