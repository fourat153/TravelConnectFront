    export interface CityData {
    id: number;
    name: string;
    }
export interface StopInput {
  label: string;
  lat:   number;
  lon:   number;
  order: number;
}

    
export interface TripCreate {
  title:             string;
  privacy:           'public' | 'friends_only' | 'private';
  include_home_city: boolean;
  stops:             StopInput[];
}
 


    export interface TripOut {
    id: number;
    title: string;
    city?: CityData;
    privacy_id?: number;
    }

    export interface TripBaseOut {
    id?: number;
    title?: string;
    city?: CityData;
    status_code: number;
    message: string;
    }

    export interface TripsOut {
    trips: TripOut[];
    status_code: number;
    message: string;
    }