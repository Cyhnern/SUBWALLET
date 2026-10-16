import { apiRequest } from './client';
import type { ServiceProvider } from '../types/api';

export const serviceProvidersApi = {
  list: () => apiRequest<ServiceProvider[]>('/service-providers'),
};
