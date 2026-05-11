export type AppPanel = "map" | "search" | "saved" | "details" | "measure";

export type MeasurementMode = "distance" | "area" | "rectangle";

export type MeasurementPoint = {
  id: string;
  lng: number;
  lat: number;
};

export type MeasurementSummary = {
  title: string;
  primary: string;
  secondary: string;
  hint: string;
};
