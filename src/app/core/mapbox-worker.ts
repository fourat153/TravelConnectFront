import mapboxgl from 'mapbox-gl';

let workerConfigured = false;

export function configureMapboxWorker(): void {
  if (workerConfigured || typeof Worker === 'undefined') {
    return;
  }

  mapboxgl.workerClass = class {
    constructor() {
      return new Worker(new URL('../../mapbox-gl-csp-worker.ts', import.meta.url), {
        type: 'module'
      });
    }
  } as unknown as new () => Worker;

  workerConfigured = true;
}
