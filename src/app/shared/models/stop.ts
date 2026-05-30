import { CityData } from "./trip"

export interface StopCreate{
    lat: number,
    long: number,
    title: string,
    description: string,
}

export interface StopOut {
  id:          number;
  trip_id:     number;
  title:       string;
  description?: string;
  order:       number;
  city:        CityData;
}


export interface StopBaseOut{
    id: number, 
    trip_id: number,
    title: string, 
    city:CityData,
    order:number ,
    status_code: number;
    message: string;
}
export interface StopsOut {
  status_code: number;
  message:     string;
  stops?:      StopOut[];
}
 
