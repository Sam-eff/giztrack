export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  phone: string;
  role: "admin" | "staff" | "technician";
  shop: number;
  shop_name: string;
  is_active: boolean;
  subscription_plan: string | null;
  subscription_status: string;
  is_in_trial: boolean;
  trial_days_remaining: number;
  has_active_subscription: boolean;
  has_app_access: boolean;
  has_pro_access: boolean;
}

export interface Shop {
  id: number;
  name: string;
  owner_name: string;
  email: string;
  phone: string;
  address: string;
  logo: string | null;
  subscription_is_active: boolean;
  is_in_trial: boolean;
  subscription_expires_at: string | null;
  allow_staff_sales: boolean;
  allow_staff_expense_logging: boolean;
  allow_staff_inventory_management: boolean;
  enable_sms_notifications: boolean;
}

export interface Category {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  description: string;
  sku: string;
  brand: string;
  product_model: string;
  color: string;
  category: number | null;
  category_name: string | null;
  image?: string | null;
  cost_price: string;
  selling_price: string;
  profit_margin: number;
  quantity: number;
  low_stock_threshold: number;
  is_low_stock: boolean;
  tracked_units_count?: number;
  tracked_in_stock_count?: number;
  tracked_available_count?: number;
  tracked_stock_count?: number;
  tracked_sold_count?: number;
  untracked_stock_count?: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  created_at: string;
}

export interface SoldUnit {
  id: number;
  identifier: string;
  imei_1: string;
  imei_2: string;
  serial_number: string;
  status: string;
  status_display: string;
  supplier_name: string | null;
  warranty_months: number;
  warranty_expiry: string | null;
  condition: string;
  condition_display: string;
  color: string;
  storage: string;
}

export interface SaleItem {
  id: number;
  product: number | null;
  product_name: string;
  product_image?: string | null;
  quantity: number;
  returned_quantity?: number;
  unit_price: string;
  unit_cost: string;
  is_custom: boolean;
  subtotal: number;
  profit: number;
  sold_units?: SoldUnit[];
}

export interface SalePayment {
  id: number;
  amount: string;
  note: string;
  received_by: number | null;
  received_by_name: string | null;
  created_at: string;
}

export interface Sale {
  id: number;
  customer: number | null;
  customer_name: string;
  staff: number;
  staff_name: string;
  items: SaleItem[];
  total_amount: string;
  total_profit: string;
  discount_amount: string;
  amount_paid: string;
  is_credit: boolean;
  balance_owed: string;
  payments: SalePayment[];
  note: string;
  created_at: string;
}

export interface RepairTicket {
  id: number;
  customer: number | null;
  customer_name: string;
  technician: number | null;
  technician_name: string;
  device_type: string;
  device_model: string;
  issue_description: string;
  estimated_cost: string;
  final_cost: string | null;
  amount_paid: string;
  status: "received" | "diagnosing" | "waiting_parts" | "fixed" | "collected";
  status_display: string;
  note: string;
  image?: string | null;
  parts: RepairPart[];
  created_at: string;
  updated_at: string;
}

export interface RepairPart {
  id: number;
  product: number;
  product_name: string;
  quantity_used: number;
  unit_cost: string;
}

export interface DashboardStats {
  inventory: {
    total_products: number;
    low_stock_count: number;
  };
  sales_today: {
    count: number;
    payment_count: number;
    sales_value: number;
    cash_received: number;
    revenue: number;
    profit: number;
  };
  credit: {
    outstanding: number;
    customers_with_balance: number;
    sales_with_balance: number;
  };
  revenue_all_time: number;
  repairs: {
    active: number;
    completed_today: number;
    by_status: Record<string, number>;
  };
}

export interface Expense {
  id: number;
  amount: string;
  category: string;
  category_display: string;
  description: string;
  date: string;
  logged_by: number;
  logged_by_name: string;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  payment_terms: string;
  notes: string;
  is_active: boolean;
  total_orders: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItem {
  id: number;
  product: number | null;
  product_name: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_cost: string;
  subtotal: number;
  is_fully_received: boolean;
  created_at: string;
}

export interface PurchaseOrder {
  id: number;
  supplier: number;
  supplier_name: string;
  order_number: string;
  status: "draft" | "ordered" | "partially_received" | "received" | "cancelled";
  status_display: string;
  total_cost: string;
  notes: string;
  ordered_at: string | null;
  received_at: string | null;
  created_by: number | null;
  created_by_name: string | null;
  items: PurchaseOrderItem[];
  created_at: string;
  updated_at: string;
}

export interface ProductUnit {
  id: number;
  product: number;
  product_name: string;
  imei_1: string;
  imei_2: string;
  serial_number: string;
  condition: "new" | "refurbished" | "used";
  condition_display: string;
  status: "in_stock" | "sold" | "reserved" | "returned" | "defective";
  status_display: string;
  supplier: number | null;
  supplier_name: string | null;
  purchase_order: number | null;
  purchase_price: string | null;
  sale: number | null;
  sold_to: number | null;
  sold_to_name: string | null;
  sold_at: string | null;
  selling_price_actual: string | null;
  warranty_months: number;
  warranty_is_active: boolean;
  warranty_expiry: string | null;
  color: string;
  storage: string;
  notes: string;
  identifier: string;
  created_at: string;
  updated_at: string;
}
