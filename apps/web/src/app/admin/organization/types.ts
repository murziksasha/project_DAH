export interface UserApartmentLink {
  id: string;
  number: string;
  entrance: number;
  isPrimary?: boolean;
}

export interface UserApprover {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface UserTenantInfo {
  id: string;
  name: string;
  slug: string;
  orgType?: string;
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
  tenantId?: string | null;
  tenant?: UserTenantInfo | null;
  createdAt?: string;
  approvedAt?: string | null;
  approvedBy?: UserApprover | null;
  apartments?: UserApartmentLink[];
  apartment?: { id: string; number: string; entrance: number } | null;
}

export type UserSortField = 'name' | 'email' | 'role' | 'status' | 'createdAt';

export interface TenantRoleRow {
  code: string;
  isActive: boolean;
  labelUk?: string | null;
  labelRu?: string | null;
  labelDefault?: { uk: string; ru: string };
  sortOrder: number;
  memberCount: number;
  canDelete: boolean;
  isProtected?: boolean;
}

export interface RolesListResponse {
  items: TenantRoleRow[];
}

export interface UsersListResponse {
  items: UserRow[];
  total: number;
  page: number;
  limit: number;
  sortBy?: UserSortField;
  sortDir?: 'asc' | 'desc';
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