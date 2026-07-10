export interface UserApartmentLink {
  id: string;
  number: string;
  entrance: number;
  isPrimary?: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  status: string;
  apartmentId: string | null;
  apartments?: UserApartmentLink[];
  apartment?: { id: string; number: string; entrance: number } | null;
}

export interface UsersListResponse {
  items: UserRow[];
  total: number;
  page: number;
  limit: number;
}

export interface ApartmentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: string;
  isPrimary?: boolean;
}

export interface ApartmentRow {
  id: string;
  number: string;
  entrance: number;
  floor: number | null;
  area: number;
  users?: ApartmentUser[];
}

export interface UserFormState {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone: string;
  role: string;
  status: string;
  apartmentIds: string[];
  primaryApartmentId: string;
}

export const emptyUserForm = (): UserFormState => ({
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  phone: '',
  role: 'board',
  status: 'active',
  apartmentIds: [],
  primaryApartmentId: '',
});