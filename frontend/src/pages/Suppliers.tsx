import { useDeferredValue, useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import type { Supplier, PurchaseOrder, Product } from "../types";

type ReceiveUnitDraft = {
  identifier: string;
  imei_2: string;
  condition: "new" | "refurbished" | "used";
  color: string;
  storage: string;
  notes: string;
};

type ReceiveItemDraft = {
  item_id: number;
  quantity_received: number;
  units: ReceiveUnitDraft[];
};

type PoFormItem = {
  product_id: string;
  quantity_ordered: number;
  unit_cost: number;
};

const inputStyle = {
  backgroundColor: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
};

const fmtCurrency = (value: number | string | null | undefined) =>
  `₦${Number(value || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

const createBlankReceiveUnit = (): ReceiveUnitDraft => ({
  identifier: "",
  imei_2: "",
  condition: "new",
  color: "",
  storage: "",
  notes: "",
});

const resizeReceiveUnits = (quantity: number, existing: ReceiveUnitDraft[] = []) =>
  Array.from({ length: Math.max(quantity, 0) }, (_, index) => existing[index] || createBlankReceiveUnit());

function Modal({
  title,
  subtitle,
  onClose,
  children,
  maxWidth = "max-w-lg",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        className={`w-full ${maxWidth} rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col`}
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          maxHeight: "calc(100dvh - 2rem)",
        }}
      >
        <div className="flex justify-center pt-3 sm:hidden">
          <span className="h-1.5 w-14 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
        <div
          className="sticky top-0 z-10 flex items-start justify-between gap-4 px-4 sm:px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
        >
          <div className="min-w-0">
            <h2 className="font-display font-bold text-base" style={{ color: "var(--color-text)" }}>
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg transition-colors shrink-0" style={{ color: "var(--color-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 sm:px-6 pt-5 pb-4 sm:pb-5 overflow-y-auto touch-scroll">
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      {children}
      {hint && (
        <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--color-primary)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Input({
  value,
  onChange,
  type = "text",
  placeholder,
  required,
  min,
  max,
  step,
}: {
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
  min?: string | number;
  max?: string | number;
  step?: string;
}) {
  return (
    <input
      required={required}
      type={type}
      min={min}
      max={max}
      step={step}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
      style={inputStyle}
      onFocus={(event) => (event.target.style.borderColor = "var(--color-primary)")}
      onBlur={(event) => (event.target.style.borderColor = "var(--color-border)")}
    />
  );
}

function StatusBadge({ po }: { po: PurchaseOrder }) {
  const styles: Record<PurchaseOrder["status"], string> = {
    draft: "bg-slate-100 text-slate-700 border border-slate-200",
    ordered: "bg-blue-100 text-blue-700 border border-blue-200",
    partially_received: "bg-amber-100 text-amber-700 border border-amber-200",
    received: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    cancelled: "bg-red-100 text-red-700 border border-red-200",
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${styles[po.status]}`}>
      {po.status_display}
    </span>
  );
}

export default function Suppliers() {
  const { user } = useAuth();
  const { success, error: showError } = useToast();
  const canManage = user?.role === "admin";

  const [activeTab, setActiveTab] = useState<"suppliers" | "purchase_orders">("suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [searchSupplier, setSearchSupplier] = useState("");
  const deferredSearchSupplier = useDeferredValue(searchSupplier);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loadingPOs, setLoadingPOs] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);

  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const supplierSavePending = useRef(false);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierForm, setSupplierForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    payment_terms: "",
    notes: "",
  });

  const [showPOModal, setShowPOModal] = useState(false);
  const poCreatePending = useRef(false);
  const [creatingPO, setCreatingPO] = useState(false);
  const [poForm, setPoForm] = useState<{ supplier_id: string; notes: string; items: PoFormItem[] }>({
    supplier_id: "",
    notes: "",
    items: [{ product_id: "", quantity_ordered: 1, unit_cost: 0 }],
  });

  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
  const receivePending = useRef(false);
  const [receivingItems, setReceivingItems] = useState(false);
  const [receiveForm, setReceiveForm] = useState<{ items: ReceiveItemDraft[] }>({ items: [] });

  const fetchSuppliers = async () => {
    setLoadingSuppliers(true);
    try {
      const { data } = await api.get("/suppliers/suppliers/", { params: { search: deferredSearchSupplier } });
      setSuppliers(data.results || data);
    } catch {
      showError("Failed to load suppliers");
    } finally {
      setLoadingSuppliers(false);
    }
  };

  const fetchPurchaseOrders = async () => {
    setLoadingPOs(true);
    try {
      const { data } = await api.get("/suppliers/purchase-orders/");
      setPurchaseOrders(data.results || data);
    } catch {
      showError("Failed to load purchase orders");
    } finally {
      setLoadingPOs(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data } = await api.get("/inventory/products/");
      setProducts(data.results || data);
    } catch {
      showError("Failed to load products for POs");
    }
  };

  useEffect(() => {
    if (activeTab === "suppliers") void fetchSuppliers();
    if (activeTab === "purchase_orders") {
      void fetchPurchaseOrders();
      if (suppliers.length === 0) void fetchSuppliers();
      if (products.length === 0) void fetchProducts();
    }
  }, [activeTab, deferredSearchSupplier]);

  const resetSupplierForm = () => {
    setSupplierForm({
      name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      payment_terms: "",
      notes: "",
    });
  };

  const handleSaveSupplier = async (event: React.FormEvent) => {
    event.preventDefault();
    if (supplierSavePending.current) return;

    supplierSavePending.current = true;
    setSavingSupplier(true);
    try {
      if (editingSupplier) {
        await api.put(`/suppliers/suppliers/${editingSupplier.id}/`, supplierForm);
        success("Supplier updated");
      } else {
        await api.post("/suppliers/suppliers/", supplierForm);
        success("Supplier added");
      }
      setShowSupplierModal(false);
      setEditingSupplier(null);
      resetSupplierForm();
      void fetchSuppliers();
    } catch {
      showError("Failed to save supplier");
    } finally {
      supplierSavePending.current = false;
      setSavingSupplier(false);
    }
  };

  const handleCreatePO = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!poForm.supplier_id) return showError("Please select a supplier");
    if (poCreatePending.current) return;

    poCreatePending.current = true;
    setCreatingPO(true);
    try {
      await api.post("/suppliers/purchase-orders/", poForm);
      success("Purchase order created successfully");
      setShowPOModal(false);
      setPoForm({ supplier_id: "", notes: "", items: [{ product_id: "", quantity_ordered: 1, unit_cost: 0 }] });
      void fetchPurchaseOrders();
    } catch (err: any) {
      showError(err.response?.data?.detail || "Failed to create PO");
    } finally {
      poCreatePending.current = false;
      setCreatingPO(false);
    }
  };

  const handleMarkOrdered = async (po: PurchaseOrder) => {
    try {
      await api.post(`/suppliers/purchase-orders/${po.id}/mark-ordered/`);
      success("Purchase order marked as ordered");
      void fetchPurchaseOrders();
    } catch (err: any) {
      showError(err.response?.data?.error || "Failed to mark order as ordered");
    }
  };

  const handleReceivePO = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!receivingPO) return;
    if (receivePending.current) return;

    receivePending.current = true;
    setReceivingItems(true);
    try {
      const payload = {
        items: receiveForm.items.map((item) => ({
          item_id: item.item_id,
          quantity_received: item.quantity_received,
          imei_list: item.units
            .filter((unit) => unit.identifier.trim())
            .map((unit) => {
              const identifier = unit.identifier.trim();
              const looksLikeImei = /^\d{14,17}$/.test(identifier);
              return {
                imei_1: looksLikeImei ? identifier : "",
                serial_number: looksLikeImei ? "" : identifier,
                imei_2: unit.imei_2.trim(),
                condition: unit.condition,
                color: unit.color.trim(),
                storage: unit.storage.trim(),
                notes: unit.notes.trim(),
              };
            }),
        })),
      };
      await api.post(`/suppliers/purchase-orders/${receivingPO.id}/receive/`, payload);
      success("Items received successfully");
      setReceivingPO(null);
      void fetchPurchaseOrders();
    } catch {
      showError("Failed to receive items. Check IMEI requirements.");
    } finally {
      receivePending.current = false;
      setReceivingItems(false);
    }
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    setReceiveForm({
      items: po.items
        .filter((item) => !item.is_fully_received)
        .map((item) => {
          const remaining = item.quantity_ordered - item.quantity_received;
          return {
            item_id: item.id,
            quantity_received: remaining,
            units: resizeReceiveUnits(remaining),
          };
        }),
    });
    setReceivingPO(po);
  };

  const updatePoItem = (index: number, field: keyof PoFormItem, value: string) => {
    setPoForm((prev) => {
      const items = [...prev.items];
      const current = items[index];
      if (!current) return prev;
      items[index] = {
        ...current,
        [field]: field === "product_id" ? value : Number(value) || 0,
      };
      return { ...prev, items };
    });
  };

  const updateReceiveQuantity = (index: number, value: string, max: number) => {
    const parsed = Number.parseInt(value, 10);
    const quantity = Math.min(Math.max(Number.isNaN(parsed) ? 1 : parsed, 1), max);
    setReceiveForm((prev) => {
      const items = [...prev.items];
      const current = items[index];
      if (!current) return prev;
      items[index] = {
        ...current,
        quantity_received: quantity,
        units: resizeReceiveUnits(quantity, current.units),
      };
      return { items };
    });
  };

  const updateReceiveUnit = (
    itemIndex: number,
    unitIndex: number,
    field: keyof ReceiveUnitDraft,
    value: string,
  ) => {
    setReceiveForm((prev) => {
      const items = [...prev.items];
      const current = items[itemIndex];
      if (!current) return prev;
      const units = [...current.units];
      const unit = units[unitIndex];
      if (!unit) return prev;
      units[unitIndex] = { ...unit, [field]: value };
      items[itemIndex] = { ...current, units };
      return { items };
    });
  };

  const purchaseOrderValue = purchaseOrders.reduce((sum, po) => sum + Number(po.total_cost || 0), 0);
  const pendingOrders = purchaseOrders.filter((po) => po.status === "draft" || po.status === "ordered" || po.status === "partially_received").length;
  const receivedOrders = purchaseOrders.filter((po) => po.status === "received").length;

  return (
    <>
      <Helmet>
        <title>Suppliers & POs — Giztrack</title>
      </Helmet>
      <div className="space-y-6 max-w-7xl mx-auto">
        <div
          className="rounded-2xl overflow-hidden border"
          style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
        >
          <div className="p-5 sm:p-6 border-b" style={{ borderColor: "var(--color-border)" }}>
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-primary)" }}>
                  Procurement
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: "var(--color-text)" }}>
                  Suppliers & Purchase Orders
                </h1>
                <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--color-muted)" }}>
                  Buy from suppliers, receive stock, and capture exact unit details before items reach the sales floor.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManage && activeTab === "suppliers" && (
                  <button
                    onClick={() => {
                      setEditingSupplier(null);
                      resetSupplierForm();
                      setShowSupplierModal(true);
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: "var(--color-primary)" }}
                  >
                    + Add Supplier
                  </button>
                )}
                {canManage && activeTab === "purchase_orders" && (
                  <button
                    onClick={() => {
                      setPoForm({ supplier_id: "", notes: "", items: [{ product_id: "", quantity_ordered: 1, unit_cost: 0 }] });
                      setShowPOModal(true);
                    }}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: "var(--color-primary)" }}
                  >
                    + Create Purchase Order
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 flex bg-surface p-1 rounded-xl w-fit">
              {[
                { id: "suppliers", label: "Suppliers" },
                { id: "purchase_orders", label: "Purchase Orders" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as "suppliers" | "purchase_orders")}
                  className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                    activeTab === tab.id ? "bg-accent shadow" : "text-muted hover:text-text"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: "Suppliers", value: suppliers.length.toLocaleString("en-NG") },
            { label: "Purchase Orders", value: purchaseOrders.length.toLocaleString("en-NG") },
            { label: "Pending", value: pendingOrders.toLocaleString("en-NG") },
            { label: "Received", value: receivedOrders.toLocaleString("en-NG") },
            { label: "PO Value", value: fmtCurrency(purchaseOrderValue) },
          ].map((metric) => (
            <div key={metric.label} className="p-4 rounded-2xl border min-w-0" style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
                {metric.label}
              </p>
              <p className="text-xl font-display font-bold truncate" style={{ color: "var(--color-text)" }}>
                {metric.value}
              </p>
            </div>
          ))}
        </div>

        {activeTab === "suppliers" && (
          <div className="space-y-4">
            <div className="relative max-w-md">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                style={{ color: "var(--color-muted)" }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search suppliers..."
                value={searchSupplier}
                onChange={(event) => setSearchSupplier(event.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
            </div>

            {loadingSuppliers ? (
              <div className="flex items-center justify-center h-40 rounded-2xl border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>Loading suppliers...</p>
              </div>
            ) : suppliers.length === 0 ? (
              <div className="flex items-center justify-center h-40 rounded-2xl border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>No suppliers found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {suppliers.map((supplier) => (
                  <div
                    key={supplier.id}
                    className="p-4 rounded-2xl border"
                    style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-display font-bold text-base truncate" style={{ color: "var(--color-text)" }}>
                          {supplier.name}
                        </h3>
                        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
                          {supplier.contact_person || "No contact person"}
                        </p>
                      </div>
                      {canManage && (
                        <button
                          onClick={() => {
                            setEditingSupplier(supplier);
                            setSupplierForm({
                              name: supplier.name,
                              contact_person: supplier.contact_person,
                              phone: supplier.phone,
                              email: supplier.email,
                              address: supplier.address,
                              payment_terms: supplier.payment_terms,
                              notes: supplier.notes,
                            });
                            setShowSupplierModal(true);
                          }}
                          className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-primary shrink-0"
                          style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Phone</p>
                        <p className="mt-1 font-semibold break-words" style={{ color: "var(--color-text)" }}>{supplier.phone || "—"}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Orders</p>
                        <p className="mt-1 font-semibold" style={{ color: "var(--color-text)" }}>{supplier.total_orders}</p>
                      </div>
                    </div>
                    {(supplier.payment_terms || supplier.email) && (
                      <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
                        <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                          {[supplier.payment_terms, supplier.email].filter(Boolean).join(" • ")}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "purchase_orders" && (
          <div className="space-y-4">
            {loadingPOs ? (
              <div className="flex items-center justify-center h-40 rounded-2xl border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>Loading purchase orders...</p>
              </div>
            ) : purchaseOrders.length === 0 ? (
              <div className="flex items-center justify-center h-40 rounded-2xl border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>No purchase orders found.</p>
              </div>
            ) : (
              <div
                className="rounded-2xl overflow-hidden"
                style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
              >
                <div className="md:hidden divide-y" style={{ borderColor: "var(--color-border)" }}>
                  {purchaseOrders.map((po) => (
                    <div key={po.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold" style={{ color: "var(--color-text)" }}>{po.order_number}</p>
                          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{po.supplier_name}</p>
                        </div>
                        <StatusBadge po={po} />
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Items</p>
                          <p className="mt-1 font-semibold" style={{ color: "var(--color-text)" }}>{po.items.length}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Total</p>
                          <p className="mt-1 font-semibold text-primary">{fmtCurrency(po.total_cost)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Date</p>
                          <p className="mt-1 font-semibold" style={{ color: "var(--color-text)" }}>{new Date(po.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {po.status === "draft" && (
                          <button onClick={() => handleMarkOrdered(po)} className="text-xs px-3 py-2 rounded-lg font-medium text-blue-700 bg-blue-100 border border-blue-200">
                            Mark Ordered
                          </button>
                        )}
                        {(po.status === "ordered" || po.status === "partially_received") && (
                          <button onClick={() => openReceiveModal(po)} className="text-xs px-3 py-2 rounded-lg font-medium text-primary bg-primary/10 border border-primary/20">
                            Receive Stock
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden md:block w-full overflow-x-auto">
                  <table className="w-full min-w-[780px]">
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        {["PO Number", "Supplier", "Status", "Items", "Total Cost", "Date", "Actions"].map((heading) => (
                          <th key={heading} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-muted)" }}>
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseOrders.map((po, index) => (
                        <tr key={po.id} style={{ borderBottom: index < purchaseOrders.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                          <td className="px-5 py-4 text-sm font-semibold" style={{ color: "var(--color-text)" }}>{po.order_number}</td>
                          <td className="px-5 py-4 text-sm" style={{ color: "var(--color-text)" }}>{po.supplier_name}</td>
                          <td className="px-5 py-4"><StatusBadge po={po} /></td>
                          <td className="px-5 py-4 text-sm" style={{ color: "var(--color-muted)" }}>{po.items.length} item(s)</td>
                          <td className="px-5 py-4 text-sm font-semibold text-primary">{fmtCurrency(po.total_cost)}</td>
                          <td className="px-5 py-4 text-sm" style={{ color: "var(--color-muted)" }}>{new Date(po.created_at).toLocaleDateString()}</td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              {po.status === "draft" && (
                                <button onClick={() => handleMarkOrdered(po)} className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-blue-700 bg-blue-100 border border-blue-200">
                                  Mark Ordered
                                </button>
                              )}
                              {(po.status === "ordered" || po.status === "partially_received") && (
                                <button onClick={() => openReceiveModal(po)} className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-primary bg-primary/10 border border-primary/20">
                                  Receive Stock
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {showSupplierModal && (
        <Modal
          title={editingSupplier ? "Edit Supplier" : "Add Supplier"}
          onClose={() => {
            setShowSupplierModal(false);
            setEditingSupplier(null);
          }}
        >
          <form onSubmit={handleSaveSupplier} className="space-y-4">
            <Field label="Supplier Name">
              <Input required value={supplierForm.name} onChange={(value) => setSupplierForm({ ...supplierForm, name: value })} placeholder="Apple Market Lagos" />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Contact Person">
                <Input value={supplierForm.contact_person} onChange={(value) => setSupplierForm({ ...supplierForm, contact_person: value })} placeholder="Mr. Ade" />
              </Field>
              <Field label="Phone">
                <Input value={supplierForm.phone} onChange={(value) => setSupplierForm({ ...supplierForm, phone: value })} placeholder="+234..." />
              </Field>
            </div>
            <Field label="Email">
              <Input type="email" value={supplierForm.email} onChange={(value) => setSupplierForm({ ...supplierForm, email: value })} placeholder="supplier@example.com" />
            </Field>
            <Field label="Payment Terms">
              <Input value={supplierForm.payment_terms} onChange={(value) => setSupplierForm({ ...supplierForm, payment_terms: value })} placeholder="Cash on delivery, Net 7" />
            </Field>
            <Field label="Address">
              <textarea
                value={supplierForm.address}
                onChange={(event) => setSupplierForm({ ...supplierForm, address: event.target.value })}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                rows={2}
                style={inputStyle}
                placeholder="Supplier address"
              />
            </Field>
            <Field label="Notes">
              <textarea
                value={supplierForm.notes}
                onChange={(event) => setSupplierForm({ ...supplierForm, notes: event.target.value })}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                rows={2}
                style={inputStyle}
                placeholder="Reliability, return terms, preferred products"
              />
            </Field>
            <div className="flex gap-3 pt-3">
              <button
                type="button"
                disabled={savingSupplier}
                onClick={() => setShowSupplierModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingSupplier}
                aria-busy={savingSupplier}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ background: "var(--color-primary)" }}
              >
                {savingSupplier ? "Saving..." : "Save Supplier"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showPOModal && (
        <Modal title="Create Purchase Order" subtitle="Choose supplier, products, quantity, and cost before stock arrives." onClose={() => setShowPOModal(false)} maxWidth="max-w-3xl">
          <form onSubmit={handleCreatePO} className="space-y-4">
            <Field label="Supplier">
              <select
                required
                value={poForm.supplier_id}
                onChange={(event) => setPoForm({ ...poForm, supplier_id: event.target.value })}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              >
                <option value="">Select a supplier...</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </Field>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Order Items</p>
                <button
                  type="button"
                  disabled={creatingPO}
                  onClick={() => setPoForm({ ...poForm, items: [...poForm.items, { product_id: "", quantity_ordered: 1, unit_cost: 0 }] })}
                  className="text-xs font-semibold text-primary px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  + Add Item
                </button>
              </div>
              {poForm.items.map((item, index) => (
                <div key={index} className="p-3 rounded-xl border" style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_96px_140px_40px] gap-3 items-end">
                    <Field label="Product">
                      <select
                        required
                        value={item.product_id}
                        onChange={(event) => updatePoItem(index, "product_id", event.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                        style={{ ...inputStyle, backgroundColor: "var(--color-surface)" }}
                      >
                        <option value="">Select product...</option>
                        {products.map((product) => (
                          <option key={product.id} value={product.id}>{product.name}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Qty">
                      <Input required type="number" min={1} value={item.quantity_ordered} onChange={(value) => updatePoItem(index, "quantity_ordered", value)} />
                    </Field>
                    <Field label="Unit Cost">
                      <Input required type="number" min={0} step="0.01" value={item.unit_cost} onChange={(value) => updatePoItem(index, "unit_cost", value)} />
                    </Field>
                    <button
                      type="button"
                      onClick={() => setPoForm((prev) => ({ ...prev, items: prev.items.filter((_, itemIndex) => itemIndex !== index) || prev.items }))}
                      disabled={poForm.items.length === 1 || creatingPO}
                      className="h-[42px] rounded-xl text-sm font-bold text-red-600 bg-red-50 border border-red-200 disabled:opacity-40"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <Field label="Notes">
              <textarea
                value={poForm.notes}
                onChange={(event) => setPoForm({ ...poForm, notes: event.target.value })}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                rows={2}
                style={inputStyle}
                placeholder="Supplier terms, delivery note, or batch remarks"
              />
            </Field>
            <div className="flex gap-3 pt-3">
              <button
                type="button"
                disabled={creatingPO}
                onClick={() => setShowPOModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingPO}
                aria-busy={creatingPO}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ background: "var(--color-primary)" }}
              >
                {creatingPO ? "Saving..." : "Save Order"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {receivingPO && (
        <Modal
          title={`Receive Stock — ${receivingPO.order_number}`}
          subtitle="Capture quantity and exact unit details for this delivery."
          onClose={() => setReceivingPO(null)}
          maxWidth="max-w-4xl"
        >
          <form onSubmit={handleReceivePO} className="space-y-4">
            {receiveForm.items.map((item, index) => {
              const poItem = receivingPO.items.find((orderItem) => orderItem.id === item.item_id);
              if (!poItem || poItem.is_fully_received) return null;
              const remaining = poItem.quantity_ordered - poItem.quantity_received;

              return (
                <div key={item.item_id} className="p-4 rounded-2xl border space-y-4" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-display font-bold text-base" style={{ color: "var(--color-text)" }}>{poItem.product_name}</p>
                      <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                        Ordered {poItem.quantity_ordered} • Received {poItem.quantity_received} • Remaining {remaining}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-primary">{fmtCurrency(poItem.unit_cost)} each</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Qty Receiving Now">
                      <Input
                        required
                        type="number"
                        min={1}
                        max={remaining}
                        value={item.quantity_received}
                        onChange={(value) => updateReceiveQuantity(index, value, remaining)}
                      />
                    </Field>
                    <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Receiving Value</p>
                      <p className="mt-1 text-sm font-bold" style={{ color: "var(--color-text)" }}>
                        {fmtCurrency(Number(poItem.unit_cost) * item.quantity_received)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Exact Unit Details</p>
                      <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                        Leave IMEI/serial blank for stock you do not track individually.
                      </p>
                    </div>

                    {item.units.map((unit, unitIndex) => (
                      <div key={unitIndex} className="p-3 rounded-xl border" style={{ backgroundColor: "var(--color-bg)", borderColor: "var(--color-border)" }}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <span className="text-xs font-bold" style={{ color: "var(--color-text)" }}>Unit {unitIndex + 1}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Optional</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          <Field label="IMEI / Serial">
                            <Input value={unit.identifier} onChange={(value) => updateReceiveUnit(index, unitIndex, "identifier", value)} placeholder="353456789012345 or SN-C02..." />
                          </Field>
                          <Field label="IMEI 2">
                            <Input value={unit.imei_2} onChange={(value) => updateReceiveUnit(index, unitIndex, "imei_2", value)} placeholder="Dual SIM IMEI" />
                          </Field>
                          <Field label="Condition">
                            <select
                              value={unit.condition}
                              onChange={(event) => updateReceiveUnit(index, unitIndex, "condition", event.target.value)}
                              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                              style={{ ...inputStyle, backgroundColor: "var(--color-surface)" }}
                            >
                              <option value="new">New</option>
                              <option value="refurbished">Refurbished</option>
                              <option value="used">Used</option>
                            </select>
                          </Field>
                          <Field label="Color">
                            <Input value={unit.color} onChange={(value) => updateReceiveUnit(index, unitIndex, "color", value)} placeholder="Purple, Black, Silver" />
                          </Field>
                          <Field label="Type / Storage / Spec">
                            <Input value={unit.storage} onChange={(value) => updateReceiveUnit(index, unitIndex, "storage", value)} placeholder="256GB, 16GB RAM, Wi-Fi" />
                          </Field>
                          <Field label="Notes">
                            <Input value={unit.notes} onChange={(value) => updateReceiveUnit(index, unitIndex, "notes", value)} placeholder="Box, defect, warranty note" />
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-3 pt-3">
              <button
                type="button"
                disabled={receivingItems}
                onClick={() => setReceivingPO(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={receivingItems}
                aria-busy={receivingItems}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-70 disabled:cursor-not-allowed"
                style={{ background: "var(--color-primary)" }}
              >
                {receivingItems ? "Saving..." : "Confirm Receipt"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
