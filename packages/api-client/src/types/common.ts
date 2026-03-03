/** Generic paginated response matching the Python PaginatedResponse schema. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
