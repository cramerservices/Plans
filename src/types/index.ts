export interface Customer {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  service_address: string;
  city: string;
  state: string;
  zip_code: string;
  stripe_customer_id?: string;
  created_at: string;
  updated_at: string;
}

export interface MaintenancePlan {
  id: string;
  name: string;
  description: string;
  price: number;
  billing_frequency: string;
  tune_ups_per_year: number;
  priority_service: boolean;
  discount_percentage: number;
  features: string[];
  stripe_price_id?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomerMembership {
  id: string;
  customer_id: string;
  plan_id: string;
  start_date: string;
  end_date: string;
  status: 'active' | 'expired' | 'cancelled';
  tune_ups_remaining: number;
  stripe_subscription_id?: string;
  agreement_signed_at: string;
  created_at: string;
  updated_at: string;
  plan?: MaintenancePlan;
}

export interface ServiceCompleted {
  id: string;
  customer_id: string;
  membership_id?: string;
  service_date: string;
  service_type: string;
  technician_name?: string;
  summary?: string;
  work_completed: WorkItem[];
  recommendations: Recommendation[];
  created_at: string;
}

export interface WorkItem {
  task: string;
  completed: boolean;
  notes?: string;
}

export interface Recommendation {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  estimated_cost?: number;
}

export interface TuneUpChecklistItem {
  id: string;
  category: string;
  item_name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
}

export interface ContentPage {
  id: string;
  page_key: string;
  title: string;
  content: any;
  updated_at: string;
  updated_by?: string;
}

export interface MembershipAgreement {
  id: string;
  version: string;
  content: string;
  effective_date: string;
  is_active: boolean;
  created_at: string;
}
