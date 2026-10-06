import { apiRequest } from './client';
import type { Category } from '../types/api';

export const categoriesApi = {
  list: () => apiRequest<Category[]>('/categories'),
};
