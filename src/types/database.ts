export type UserRole =
  | 'super_admin'
  | 'studio_owner'
  | 'reception'
  | 'detailer'
  | 'accountant';

export type JobStatus =
  | 'new'
  | 'scheduled'
  | 'vehicle_received'
  | 'inspection'
  | 'in_progress'
  | 'quality_check'
  | 'completed'
  | 'delivered';

/** Booking / job status stored in DB */
export type BookingStatus =
  | 'new_enquiry'
  | 'confirmed'
  | 'vehicle_received'
  | 'inspection'
  | 'awaiting_approval'
  | 'in_progress'
  | 'quality_check'
  | 'completed'
  | 'delivered'
  | 'cancelled';

export type BookingPriority = 'low' | 'normal' | 'high' | 'urgent';

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';
export type InvoiceStatus = 'pending' | 'overdue' | 'paid';
export type PaymentProvider = 'yookassa' | 'tinkoff' | 'demo' | 'manual';
/** How money reached the studio (manual ledger on the invoice). */
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'online' | 'deposit';
/** One received payment — the invoice's payment ledger (an invoice can be paid in parts). */
export interface InvoicePayment {
  id: string;
  amount: number;
  method: PaymentMethod;
  at: string;
  note?: string | null;
}
/** An extra service line on an order (upsell, added at inspection or by hand). */
export interface BookingItem {
  service_id?: string | null;
  name: string;
  price: number;
  quantity?: number;
  source?: 'manual' | 'inspection';
}
export type PaymentRecordStatus = 'pending' | 'waiting_for_capture' | 'succeeded' | 'canceled' | 'failed';
export type CustomerStatus = 'active' | 'vip' | 'sleeping';
export type LeadSource = 'website' | 'instagram' | 'whatsapp' | 'phone' | 'referral';
export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'lost' | 'junk';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: UserRole;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  verification_code?: string | null;
  invited_at?: string | null;
  verified_at?: string | null;
  must_change_password?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  profile_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: CustomerStatus;
  lifetime_value: number;
  visit_count: number;
  last_visit_at: string | null;
  /** Where the client came from (lead source, referral …). */
  source?: string | null;
  preferred_channel?: 'whatsapp' | 'telegram' | 'phone' | 'email' | null;
  birthday?: string | null;
  tags?: string[];
  referred_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Staff {
  id: string;
  profile_id: string | null;
  full_name: string;
  role: string;
  skills: string[];
  workload_pct: number;
  experience_years?: number;
  is_active: boolean;
  employee_id?: string | null;
  date_of_birth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  emergency_contact?: string | null;
  nationality?: string | null;
  employment_status?: string;
  department?: string | null;
  start_date?: string | null;
  employment_type?: string | null;
  salary?: number | null;
  reporting_manager_id?: string | null;
  working_location?: string | null;
  profile_photo_r2_key?: string | null;
  internal_notes?: string | null;
  availability_status?: string;
  /** Share of a completed job's value paid to this employee, % (0–100). */
  commission_pct?: number | null;
  created_at: string;
  updated_at: string;
  reporting_manager?: Staff;
}

export interface StaffSkill {
  id: string;
  staff_id: string;
  skill_key: string;
  level: number;
  certified: boolean;
  experience_years: number;
  training_completed: boolean;
  performance_score: number | null;
  created_at: string;
  updated_at: string;
}

export interface StaffSchedule {
  id: string;
  staff_id: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  type: 'work' | 'off' | 'holiday' | 'sick' | 'overtime';
  notes: string | null;
  created_at: string;
}

export interface StaffTask {
  id: string;
  staff_id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  deadline: string | null;
  assigned_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StaffTraining {
  id: string;
  staff_id: string;
  course_name: string;
  completed_at: string | null;
  expires_at: string | null;
  certificate_r2_key: string | null;
  notes: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  customer_id: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  registration_number: string | null;
  vin: string | null;
  maintenance_notes: string | null;
  pipeline_stage: string;
  intake_at: string | null;
  eta_at: string | null;
  mileage?: number | null;
  paint_code?: string | null;
  coating_history?: string | null;
  created_at: string;
  updated_at: string;
  customers?: Customer;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  category: string;
  subcategory?: string | null;
  difficulty_level?: string | null;
  duration_minutes: number;
  price: number;
  base_price?: number | null;
  min_price?: number | null;
  max_price?: number | null;
  labour_hours?: number | null;
  vehicle_types?: string[];
  vehicle_pricing?: Record<string, number>;
  customer_instructions?: string | null;
  equipment_required?: unknown[];
  is_package?: boolean;
  required_technician_role: string | null;
  required_equipment: string | null;
  materials?: unknown[];
  required_skills?: string[];
  /** Warranty on the work, months (0 / empty = no warranty). Drives the warranty card and reminders. */
  warranty_months?: number | null;
  /** Recommended maintenance interval, months. Drives «пора на обслуживание» reminders. */
  maintenance_interval_months?: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  service_ids: string[];
  discount_pct: number;
  is_seasonal: boolean;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServiceQuoteItem {
  service_id: string;
  name: string;
  price: number;
  quantity?: number;
}

export interface ServiceQuote {
  id: string;
  customer_id: string | null;
  vehicle_id: string | null;
  items: ServiceQuoteItem[];
  subtotal: number;
  discount: number;
  total: number;
  status: 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';
  notes: string | null;
  created_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
  customers?: Customer;
  vehicles?: Vehicle;
}

export interface Booking {
  id: string;
  customer_id: string;
  vehicle_id: string | null;
  service_id: string | null;
  scheduled_at: string;
  bay: string;
  assigned_technician_id: string | null;
  status: BookingStatus;
  payment_status: PaymentStatus;
  priority: BookingPriority;
  estimated_value: number | null;
  internal_notes: string | null;
  eta_at?: string | null;
  completed_at?: string | null;
  /** Hard links of the chain booking → order → invoice (no more guessing by name). */
  order_id?: string | null;
  invoice_id?: string | null;
  /** Extra services on top of the main one (upsell / added at inspection). */
  extra_items?: BookingItem[];
  discount?: number | null;
  deposit?: number | null;
  pickup_at?: string | null;
  items_left?: string | null;
  materials_written_off?: boolean;
  materials_cost?: number | null;
  before_photos?: string[];
  after_photos?: string[];
  notes: string | null;
  created_at: string;
  updated_at: string;
  customers?: Customer;
  vehicles?: Vehicle;
  services?: Service;
  staff?: Staff;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string | null;
  customer_id: string;
  description: string | null;
  amount: number;
  status: InvoiceStatus;
  due_date: string | null;
  pdf_url: string | null;
  sent_at: string | null;
  last_sent_to: string | null;
  payment_url: string | null;
  yookassa_payment_id: string | null;
  paid_at: string | null;
  /** The booking this invoice bills (hard link). */
  booking_id?: string | null;
  /** Payment ledger: every received payment (partial payments, deposit, cash / card / transfer). */
  payments?: InvoicePayment[];
  created_at: string;
  updated_at: string;
  customers?: Customer;
}

export interface Payment {
  id: string;
  invoice_id: string;
  customer_id: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  external_id: string | null;
  status: PaymentRecordStatus;
  confirmation_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface JobChecklist {
  id: string;
  booking_id: string;
  item: string;
  is_completed: boolean;
  completed_at: string | null;
  completed_by: string | null;
  sort_order: number;
}

export interface Order {
  id: string;
  order_number: string;
  customer_id: string;
  booking_id: string | null;
  services: unknown[];
  materials_used: unknown[];
  labour_cost: number;
  materials_cost: number;
  total_amount: number;
  payment_status: PaymentStatus;
  invoice_status: InvoiceStatus;
  created_at: string;
  updated_at: string;
  customers?: Customer;
}

export interface Lead {
  id: string;
  full_name: string;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  car_brand: string | null;
  car_model: string | null;
  source: LeadSource;
  status: LeadStatus;
  converted_customer_id: string | null;
  notes: string | null;
  owner_id: string | null;
  tags: string[];
  next_action_at: string | null;
  next_action_note: string | null;
  lost_reason: string | null;
  /** Expected budget / deal size in ₽ (optional — older leads don't have it). */
  est_value?: number | null;
  /** Service the lead is interested in (see LEAD_SERVICE_INTERESTS). */
  service_interest?: string | null;
  created_at: string;
  updated_at: string;
}

export type LeadActivityType = 'note' | 'status_change' | 'call' | 'converted';

export interface LeadActivity {
  id: string;
  lead_id: string;
  type: LeadActivityType;
  body: string;
  author_id: string | null;
  created_at: string;
}

export type FileEntityType = 'customer' | 'vehicle' | 'booking' | 'order' | 'invoice' | 'staff' | 'product' | 'service' | 'lead';

export interface FileRecord {
  id: string;
  entity_type: FileEntityType;
  entity_id: string;
  bucket_path: string;
  r2_key: string | null;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  category: string;
  storage_provider: string;
  is_sensitive: boolean;
  is_cover: boolean;
  booking_id: string | null;
  title: string | null;
  description: string | null;
  sent_at: string | null;
  sent_to_email: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: 'product' | 'material';
  supplier: string | null;
  description: string | null;
  stock_level: number;
  min_stock_level: number;
  unit: string;
  image_r2_key: string | null;
  catalog_r2_key: string | null;
  safety_r2_key: string | null;
  category: string | null;
  subcategory: string | null;
  brand: string | null;
  sku: string | null;
  barcode: string | null;
  application_purpose: string | null;
  compatible_services: string[] | null;
  usage_instructions: string | null;
  safety_info: string | null;
  unit_cost: number;
  selling_price: number;
  storage_location: string | null;
  batch_number: string | null;
  expiry_date: string | null;
  film_thickness: string | null;
  roll_length: number | null;
  roll_width: number | null;
  equipment_id: string | null;
  purchase_date: string | null;
  warranty_until: string | null;
  maintenance_due: string | null;
  assigned_staff_id: string | null;
  condition: string | null;
  hazard_class: string | null;
  storage_requirements: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
}

export interface InventoryReceipt {
  id: string;
  item_id: string;
  supplier_id: string | null;
  quantity: number;
  batch_number: string | null;
  expiry_date: string | null;
  invoice_ref: string | null;
  received_by: string | null;
  received_at: string;
}

export interface InventoryIssue {
  id: string;
  item_id: string;
  quantity: number;
  booking_id: string | null;
  vehicle_id: string | null;
  staff_id: string | null;
  issued_at: string;
  notes: string | null;
}

export interface InventoryReturn {
  id: string;
  item_id: string;
  quantity: number;
  reason: string | null;
  condition: string | null;
  returned_by: string | null;
  returned_at: string;
}

export interface InventoryWaste {
  id: string;
  item_id: string;
  quantity: number;
  reason: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

export interface ServiceMaterialRecipe {
  id: string;
  service_id: string;
  item_id: string;
  quantity_per_service: number;
  unit: string;
  notes: string | null;
}

export interface PurchaseOrder {
  id: string;
  supplier_id: string | null;
  status: string;
  total: number;
  approved_by: string | null;
  created_at: string;
  suppliers?: Supplier | null;
}

export interface InventoryUsage {
  id: string;
  item_id: string;
  order_id: string | null;
  booking_id: string | null;
  quantity_used: number;
  used_at: string;
}

export type EmailMessageType =
  | 'invoice'
  | 'notification'
  | 'manual'
  | 'document'
  | 'reminder_payment'
  | 'reminder_visit'
  | 'thanks'
  | 'enquiry'
  | 'booking_request'
  | 'quote'
  | 'estimate'
  | 'service_confirmation'
  | 'payment'
  | 'membership'
  | 'warranty'
  | 'supplier'
  | 'internal';
export type EmailStatus = 'sent' | 'failed';

export interface Communication {
  id: string;
  customer_id: string;
  channel: 'email' | 'whatsapp' | 'sms' | 'phone' | 'telegram';
  direction: 'inbound' | 'outbound';
  content: string;
  sent_at: string;
  created_by: string | null;
  subject?: string | null;
  recipient_email?: string | null;
  sender_email?: string | null;
  body_text?: string | null;
  body_html?: string | null;
  email_status?: EmailStatus | null;
  message_type?: EmailMessageType | null;
  entity_id?: string | null;
  error_message?: string | null;
  read_at?: string | null;
  read_by_profile_id?: string | null;
  is_important?: boolean;
  is_draft?: boolean;
  is_archived?: boolean;
  is_deleted?: boolean;
  is_spam?: boolean;
  attachment_keys?: string[] | null;
}

export type InspectionWorkflowStage =
  | 'vehicle_arrival'
  | 'customer_handover'
  | 'initial_inspection'
  | 'damage_assessment'
  | 'service_recommendation'
  | 'customer_approval'
  | 'work_authorisation'
  | 'inspection_completion'
  | 'handover_documentation';

export type InspectionApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface InspectionCheckItem {
  checked?: boolean;
  rating?: number;
  condition?: string;
  notes?: string;
}

export interface InspectionDamageEntry {
  area: string;
  severity: 'minor' | 'moderate' | 'severe';
  notes: string;
  photo_keys: string[];
}

export interface InspectionServiceEntry {
  service_id?: string;
  name: string;
  price?: number;
  notes?: string;
}

export interface Inspection {
  id: string;
  vehicle_id: string;
  booking_id: string | null;
  workflow_stage: InspectionWorkflowStage;
  approval_status: InspectionApprovalStatus;
  approved_at: string | null;
  approved_services: InspectionServiceEntry[];
  damage_map: InspectionDamageEntry[];
  exterior_checks: Record<string, InspectionCheckItem>;
  interior_checks: Record<string, InspectionCheckItem>;
  technical_checks: Record<string, InspectionCheckItem>;
  recommended_services: InspectionServiceEntry[];
  recommended_quote?: InspectionServiceEntry[];
  template_id?: string | null;
  customer_comments: string | null;
  inspector_id: string | null;
  exterior_condition: string | null;
  scratches: string | null;
  paint_condition: string | null;
  interior_condition: string | null;
  existing_damage: string | null;
  customer_requests: string | null;
  technician_notes: string | null;
  photos: string[];
  inspected_by: string | null;
  created_at: string;
  updated_at: string;
  vehicles?: Vehicle;
  staff?: Staff;
}

export interface InternalAlert {
  id: string;
  type: string;
  title: string;
  body: string;
  is_read: boolean;
  target_role: UserRole | null;
  created_at: string;
}

export interface StaffAttendance {
  id: string;
  staff_id: string;
  check_in: string;
  check_out: string | null;
  hours_worked: number | null;
  break_minutes?: number | null;
  overtime_hours?: number | null;
  notes: string | null;
  created_at: string;
  staff?: Staff;
}

export type ViewId =
  | 'overview'
  | 'jobs'
  | 'bookings'
  | 'pipeline'
  | 'vehicles'
  | 'customers'
  | 'leads'
  | 'staff'
  | 'services'
  | 'finance'
  | 'mailbox'
  | 'inventory'
  | 'inspection'
  | 'documents'
  | 'reports'
  | 'settings';
