import { useDeferredValue, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import api from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import type { Product, Category, ProductUnit, Supplier } from "../types";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import BarcodeScannerNotice from "../components/BarcodeScannerNotice";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { resolveAssetUrl } from "../utils/assets";
import { getApiErrorMessage, getPrimaryErrorMessage, parseApiErrors } from "../utils/http";

// ── Stock Log type ────────────────────────────────────────────────────────────
interface StockLog {
  id: number;
  change_amount: number;
  quantity_after: number;
  reason: string;
  reason_display: string;
  note: string;
  created_by_name: string;
  created_at: string;
}

// ── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, maxWidth = "max-w-lg" }: {
  title: string;
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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div className={`w-full ${maxWidth} rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col`}
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          maxHeight: "calc(100dvh - 2rem)",
        }}>
        <div className="flex justify-center pt-3 sm:hidden">
          <span className="h-1.5 w-14 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
        {/* Header — fixed */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b shrink-0"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <h2 className="font-display font-bold text-base" style={{ color: "var(--color-text)" }}>
            {title}
          </h2>
          <button onClick={onClose}
            className="p-1 rounded-lg transition-colors"
            style={{ color: "var(--color-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-4 sm:px-6 pt-5 sm:pt-5 pb-4 sm:pb-5 overflow-y-auto touch-scroll">
          {children}
        </div>
      </div>
    </div>
  );
}

// ── Input helper ─────────────────────────────────────────────────────────────
function Field({ label, error, hint, children }: {
  label: string; error?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs mt-1.5 font-medium" style={{ color: "var(--color-primary)" }}>{hint}</p>}
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}

const inputStyle = {
  backgroundColor: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
};

const fmtCurrency = (value: number | string | null | undefined) =>
  `₦${Number(value || 0).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

const fmtDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const getTrackedStock = (product: Product) =>
  product.tracked_stock_count ?? product.tracked_available_count ?? product.tracked_in_stock_count ?? 0;

const getUntrackedStock = (product: Product) =>
  product.untracked_stock_count ?? Math.max(product.quantity - getTrackedStock(product), 0);

const getTrackingStatusText = (product: Product) => {
  const tracked = getTrackedStock(product);
  const untracked = getUntrackedStock(product);
  if (tracked === 0 && untracked === 0) return "No stock";
  if (tracked === 0) return `${untracked} untracked`;
  if (untracked === 0) return `${tracked} tracked`;
  return `${tracked} tracked • ${untracked} untracked`;
};

const trackedStockStatuses = new Set<ProductUnit["status"]>(["in_stock", "returned", "reserved", "defective"]);
const trackedAvailableStatuses = new Set<ProductUnit["status"]>(["in_stock", "returned"]);

const mergeUnitCoverage = (product: Product, units: ProductUnit[]): Product => {
  const trackedStock = units.filter((unit) => trackedStockStatuses.has(unit.status)).length;
  const trackedAvailable = units.filter((unit) => trackedAvailableStatuses.has(unit.status)).length;
  const trackedSold = units.filter((unit) => unit.status === "sold").length;

  return {
    ...product,
    tracked_units_count: units.length,
    tracked_in_stock_count: trackedAvailable,
    tracked_available_count: trackedAvailable,
    tracked_stock_count: trackedStock,
    tracked_sold_count: trackedSold,
    untracked_stock_count: Math.max(product.quantity - trackedStock, 0),
  };
};

const unitStatusStyle: Record<ProductUnit["status"], string> = {
  in_stock: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  sold: "bg-blue-100 text-blue-700 border border-blue-200",
  reserved: "bg-amber-100 text-amber-700 border border-amber-200",
  returned: "bg-violet-100 text-violet-700 border border-violet-200",
  defective: "bg-red-100 text-red-700 border border-red-200",
};

const unitConditionStyle: Record<ProductUnit["condition"], string> = {
  new: "bg-cyan-100 text-cyan-700 border border-cyan-200",
  refurbished: "bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200",
  used: "bg-slate-100 text-slate-700 border border-slate-200",
};

type UnitSummary = {
  total: number;
  by_status: Partial<Record<ProductUnit["status"], number>>;
};

function Input({ name, value, onChange, type = "text", placeholder, step }: {
  name: string; value: string | number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; placeholder?: string; step?: string;
}) {
  return (
    <input
      name={name} value={value} onChange={onChange}
      type={type} placeholder={placeholder} step={step}
      className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
      style={inputStyle}
      onFocus={(e) => e.target.style.borderColor = "var(--color-primary)"}
      onBlur={(e) => e.target.style.borderColor = "var(--color-border)"}
    />
  );
}

// ── Types ────────────────────────────────────────────────────────────────────
type ProductForm = {
  name: string; description: string; sku: string;
  brand: string; product_model: string; color: string;
  category: string; new_category: string;
  cost_price: string; selling_price: string;
  quantity: string; low_stock_threshold: string;
  image: File | null;
};

const emptyForm: ProductForm = {
  name: "", description: "", sku: "",
  brand: "", product_model: "", color: "",
  category: "", new_category: "",
  cost_price: "", selling_price: "",
  quantity: "", low_stock_threshold: "5",
  image: null,
};

const createUnitForm = (product?: Product) => ({
  product: product?.id.toString() || "",
  identifier: "",
  imei_2: "",
  condition: "new",
  status: "in_stock",
  supplier: "",
  warranty_months: "0",
  color: product?.color || "",
  storage: product?.product_model || "",
  notes: "",
  imei_1: "",
  serial_number: "",
  purchase_price: product?.cost_price || "",
});

export default function Inventory() {
  const { user } = useAuth();
  const { success, error, warning } = useToast();
  const isAdmin = user?.role === "admin";
  const [staffCanManage, setStaffCanManage] = useState(false);
  const canManageInventory = isAdmin || staffCanManage;
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = useState("");

  const [viewMode, setViewMode] = useState<"aggregate" | "imei">("aggregate");
  const [productUnits, setProductUnits] = useState<ProductUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitSummary, setUnitSummary] = useState<UnitSummary>({ total: 0, by_status: {} });
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [unitStatusFilter, setUnitStatusFilter] = useState("");
  const [unitConditionFilter, setUnitConditionFilter] = useState("");
  const [unitSupplierFilter, setUnitSupplierFilter] = useState("");
  const [unitProductFilter, setUnitProductFilter] = useState("");

  // Modals
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAdjustStock, setShowAdjustStock] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [historyProduct, setHistoryProduct] = useState<Product | null>(null);
  const [stockLogs, setStockLogs] = useState<StockLog[]>([]);
  const [pendingScannedBarcode, setPendingScannedBarcode] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [showUnitModal, setShowUnitModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<ProductUnit | null>(null);
  const [unitForm, setUnitForm] = useState(createUnitForm());

  // Forms
  const [productForm, setProductForm] = useState<ProductForm>(emptyForm);
  const [categoryName, setCategoryName] = useState("");
  const [adjustForm, setAdjustForm] = useState({ change_amount: "", reason: "adjustment", note: "" });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);
  const [summary, setSummary] = useState({ total_value: 0, total_cost: 0 });

  const fetchSummary = async () => {
    try {
      const { data } = await api.get("/inventory/products/summary/");
      setSummary(data);
    } catch {
      // keep the last known summary if refresh fails
    }
  };

  const fetchCategories = async () => {
    try {
      const { data } = await api.get("/inventory/categories/");
      setCategories(data.results || data);
    } catch {
      // keep the last known categories if refresh fails
    }
  };

  const fetchSuppliers = async () => {
    try {
      const { data } = await api.get("/suppliers/suppliers/");
      setSuppliers(data.results || data);
    } catch {
      // supplier details are helpful but should not block inventory
    }
  };

  const fetchUnitCoverageForProducts = async (items: Product[]) => {
    if (items.length === 0) return;

    const results = await Promise.allSettled(
      items.map(async (product) => {
        const { data } = await api.get("/inventory/units/", {
          params: { product: product.id, page_size: 500 },
        });
        const units: ProductUnit[] = Array.isArray(data.results) ? data.results : Array.isArray(data) ? data : [];
        return { productId: product.id, units };
      }),
    );

    const coverage = new Map<number, ProductUnit[]>();
    results.forEach((result) => {
      if (result.status === "fulfilled") {
        coverage.set(result.value.productId, result.value.units);
      }
    });

    if (coverage.size === 0) return;

    setProducts((prev) =>
      prev.map((product) => {
        const units = coverage.get(product.id);
        return units ? mergeUnitCoverage(product, units) : product;
      }),
    );
  };

  const fetchProducts = async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial" || products.length === 0) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const prodRes = await api.get("/inventory/products/", {
        params: { search: deferredSearch, category: categoryFilter, page },
      });
      const fetchedProducts = prodRes.data.results || prodRes.data;
      setProducts(fetchedProducts);
      setCount(prodRes.data.count || 0);
      void fetchUnitCoverageForProducts(fetchedProducts);
    } catch {
      error("Failed to fetch products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchUnits = async () => {
    setUnitsLoading(true);
    try {
      const { data } = await api.get("/inventory/units/", {
        params: {
          search: deferredSearch,
          status: unitStatusFilter,
          condition: unitConditionFilter,
          supplier: unitSupplierFilter,
          product: unitProductFilter,
        },
      });
      setProductUnits(data.results || data);
    } catch {
      error("Failed to fetch unit details.");
    } finally {
      setUnitsLoading(false);
    }
  };

  const fetchUnitSummary = async () => {
    try {
      const { data } = await api.get("/inventory/units/summary/");
      setUnitSummary(data);
    } catch {
      // keep the last known unit summary if refresh fails
    }
  };

  useEffect(() => { fetchProducts(products.length === 0 ? "initial" : "refresh"); }, [deferredSearch, categoryFilter, page]);

  useEffect(() => {
    api.get("/shops/")
      .then(({ data }) => setStaffCanManage(data.allow_staff_inventory_management === true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void Promise.all([fetchCategories(), fetchSummary(), fetchSuppliers(), fetchUnitSummary()]);
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, categoryFilter]);

  useEffect(() => {
    if (viewMode === "imei") fetchUnits();
  }, [viewMode, deferredSearch, unitStatusFilter, unitConditionFilter, unitSupplierFilter, unitProductFilter]);

  // Barcode scanning logic
  useBarcodeScanner({
    onScan: (barcode) => {
      // If we are currently showing modals, ignore (could interfere with editing)
      if (showAddProduct || showAdjustStock || showHistory || showUnitModal || selectedUnit) return;

      if (viewMode === "imei") {
        void lookupUnitHistory(barcode);
        return;
      }
      
      const product = products.find((p) => p.sku === barcode);
      if (product) {
        // Highlight it or open edit modal
        openEdit(product);
      } else {
        // Fallback: use search filter to find server-side if paginated away
        setLoading(true);
        setPendingScannedBarcode(barcode);
        setSearch(barcode);
      }
    },
  });

  useEffect(() => {
    if (!pendingScannedBarcode || loading) return;

    const product = products.find((item) => item.sku === pendingScannedBarcode);
    if (product) {
      openEdit(product);
    } else if (search === pendingScannedBarcode) {
      warning(`No product found for scanned barcode: ${pendingScannedBarcode}`);
    }

    setPendingScannedBarcode(null);
  }, [pendingScannedBarcode, loading, products, search, warning]);

  const handleProductChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setProductForm({ ...productForm, [e.target.name]: e.target.value });
    setFormErrors({ ...formErrors, [e.target.name]: "" });
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name,
      description: product.description,
      sku: product.sku,
      brand: product.brand,
      product_model: product.product_model,
      color: product.color,
      category: product.category?.toString() || "",
      new_category: "",
      cost_price: product.cost_price,
      selling_price: product.selling_price,
      quantity: product.quantity.toString(),
      low_stock_threshold: product.low_stock_threshold.toString(),
      image: null,
    });
    setShowAddProduct(true);
  };

  const openAdjust = (product: Product) => {
    setAdjustingProduct(product);
    setAdjustForm({ change_amount: "", reason: "adjustment", note: "" });
    setShowAdjustStock(true);
  };

  const openHistory = async (product: Product) => {
    setHistoryProduct(product);
    setStockLogs([]);
    setShowHistory(true);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/inventory/products/${product.id}/stock-history/`);
      setStockLogs(res.data.results || res.data || []);
    } catch {
      // fail silently
    } finally {
      setHistoryLoading(false);
    }
  };

  const openRegisterUnit = (product?: Product) => {
    setUnitForm(createUnitForm(product));
    setShowUnitModal(true);
  };

  const lookupUnitHistory = async (identifier: string) => {
    try {
      const { data } = await api.get<ProductUnit>("/inventory/units/lookup/", {
        params: { imei: identifier },
      });
      setSelectedUnit(data);
    } catch {
      setSearch(identifier);
      warning(`No tracked unit found for: ${identifier}`);
    }
  };

  const handleSaveProduct = async () => {
  setSaving(true);
  setFormErrors({});
  try {
    let categoryId = productForm.category || null;
    let createdCategory: Category | null = null;

    // If user typed a new category, create it first
    if (productForm.new_category.trim()) {
      const catRes = await api.post("/inventory/categories/", {
        name: productForm.new_category.trim(),
      });
      categoryId = catRes.data.id;
      createdCategory = catRes.data;
    }

    const formData = new FormData();
    formData.append("name", productForm.name);
    formData.append("description", productForm.description);
    formData.append("sku", productForm.sku);
    formData.append("brand", productForm.brand);
    formData.append("product_model", productForm.product_model);
    formData.append("color", productForm.color);
    if (categoryId) formData.append("category", categoryId.toString());
    formData.append("cost_price", productForm.cost_price);
    formData.append("selling_price", productForm.selling_price);
    formData.append("quantity", productForm.quantity);
    formData.append("low_stock_threshold", productForm.low_stock_threshold);
    formData.append("is_active", "true");
    if (productForm.image) {
      formData.append("image", productForm.image);
    }

    if (createdCategory) {
      setCategories((prev) => {
        if (prev.some((category) => category.id === createdCategory?.id)) return prev;
        return [...prev, createdCategory].sort((a, b) => a.name.localeCompare(b.name));
      });
    }

    const { data: savedProduct } = editingProduct
      ? await api.put(`/inventory/products/${editingProduct.id}/`, formData, { headers: { "Content-Type": "multipart/form-data" }})
      : await api.post("/inventory/products/", formData, { headers: { "Content-Type": "multipart/form-data" }});

    if (editingProduct) {
      if (deferredSearch.trim() || categoryFilter) {
        void fetchProducts("refresh");
      } else {
        setProducts((prev) => prev.map((product) => (product.id === savedProduct.id ? savedProduct : product)));
      }
    } else if (page === 1 && !deferredSearch.trim() && !categoryFilter) {
      setProducts((prev) => {
        const next = [savedProduct, ...prev.filter((product) => product.id !== savedProduct.id)];
        return prev.length > 0 ? next.slice(0, prev.length) : next;
      });
      setCount((prev) => prev + 1);
    } else {
      void fetchProducts("refresh");
    }

    setShowAddProduct(false);
    setEditingProduct(null);
    setProductForm(emptyForm);
    success(editingProduct ? "Product updated successfully!" : "Product added successfully!");
    void fetchSummary();
  } catch (err: unknown) {
    const parsed = parseApiErrors(err, editingProduct ? "Failed to update product." : "Failed to add product.");
    setFormErrors(parsed.fieldErrors);
    error(getPrimaryErrorMessage(parsed, editingProduct ? "Failed to update product." : "Failed to add product."));
  } finally {
    setSaving(false);
  }
};

  const handleDeleteProduct = (id: number) => {
    setDeleteConfirmId(id);
  };

  const executeDeleteProduct = async () => {
    if (!deleteConfirmId) return;
    try {
      await api.delete(`/inventory/products/${deleteConfirmId}/`);
      setProducts((prev) => prev.filter((product) => product.id !== deleteConfirmId));
      setCount((prev) => Math.max(prev - 1, 0));
      success("Product removed from inventory.");
      void fetchSummary();
      if (page > 1 || products.length <= 1) {
        void fetchProducts("refresh");
      }
    } catch (err) {
      error("Failed to remove product.");
    } finally {
      setDeleteConfirmId(null);
    }
  };

  const handleSaveCategory = async () => {
    if (!categoryName.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post("/inventory/categories/", { name: categoryName });
      setCategories((prev) => {
        if (prev.some((category) => category.id === data.id)) return prev;
        return [...prev, data].sort((a, b) => a.name.localeCompare(b.name));
      });
      setCategoryName("");
      setShowAddCategory(false);
      success(`Category "${categoryName}" added.`);
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Failed to add category."));
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustStock = async () => {
    if (!adjustingProduct) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/inventory/products/${adjustingProduct.id}/adjust-stock/`, {
        change_amount: parseInt(adjustForm.change_amount),
        reason: adjustForm.reason,
        note: adjustForm.note,
      });
      if (data.product) {
        setProducts((prev) => prev.map((product) => (product.id === data.product.id ? data.product : product)));
      }
      setShowAdjustStock(false);
      setAdjustingProduct(null);
      success("Stock adjusted successfully.");
      void fetchSummary();
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Failed to adjust stock."));
    } finally {
      setSaving(false);
    }
  };

  const handleAddUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...unitForm,
        supplier: unitForm.supplier || null,
        purchase_price: unitForm.purchase_price || null,
        warranty_months: Number.parseInt(unitForm.warranty_months, 10) || 0,
      };
      await api.post("/inventory/units/", payload);
      success("Unit registered successfully");
      setShowUnitModal(false);
      void fetchUnits();
      void fetchUnitSummary();
      void fetchProducts("refresh");
    } catch (err: unknown) {
      const parsed = parseApiErrors(err, "Failed to register unit");
      error(getPrimaryErrorMessage(parsed, "Failed to register unit"));
    } finally {
      setSaving(false);
    }
  };

  const lowStockCount = products.filter((p) => p.is_low_stock).length;
  const totalCost = Number(summary.total_cost || 0);
  const totalValue = Number(summary.total_value || 0);
  const projectedProfit = Math.max(totalValue - totalCost, 0);
  const trackedInStock = unitSummary.by_status.in_stock || 0;
  const trackedSold = unitSummary.by_status.sold || 0;
  const trackedDefective = unitSummary.by_status.defective || 0;
  const unitsMissingSupplier = productUnits.filter((unit) => !unit.supplier_name).length;
  const selectedUnitProfit = selectedUnit
    ? Number(selectedUnit.selling_price_actual || 0) - Number(selectedUnit.purchase_price || 0)
    : 0;
  const selectedUnitProfitKnown = Boolean(selectedUnit?.selling_price_actual && selectedUnit?.purchase_price);

  return (
    <>
      <Helmet>
        <title>Inventory — Giztrack</title>
        <meta name="description" content="Manage your products, track stock levels, and organize items by category." />
      </Helmet>
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="rounded-2xl overflow-hidden border"
        style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="p-5 sm:p-6 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--color-primary)" }}>
                Advanced Inventory
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold" style={{ color: "var(--color-text)" }}>
                Inventory Command Center
              </h1>
              <p className="text-sm mt-2 max-w-2xl" style={{ color: "var(--color-muted)" }}>
                Product stock, exact IMEI/serial ownership, supplier source, warranty, and sale status in one place.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManageInventory && (
                <button onClick={() => setShowAddCategory(true)}
                  className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: "var(--color-bg)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}>
                  + Category
                </button>
              )}
              {canManageInventory && viewMode === "imei" && (
                <button onClick={() => openRegisterUnit()}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: "var(--color-primary)" }}>
                  + Register Existing Unit
                </button>
              )}
              {canManageInventory && viewMode === "aggregate" && (
                <button onClick={() => { setEditingProduct(null); setProductForm(emptyForm); setShowAddProduct(true); }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{ background: "var(--color-primary)" }}>
                  + Add Product
                </button>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex bg-surface p-1 rounded-xl w-fit">
              <button
                onClick={() => setViewMode("aggregate")}
                className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                  viewMode === "aggregate" ? "bg-accent" : "text-muted hover:text-text"
                }`}
              >
                Products
              </button>
              <button
                onClick={() => setViewMode("imei")}
                className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                  viewMode === "imei" ? "bg-accent" : "text-muted hover:text-text"
                }`}
              >
                Tracked Units
              </button>
            </div>

            <div className="flex flex-wrap gap-2 text-xs font-bold">
              {refreshing && (
                <span className="px-2.5 py-1 rounded-full" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-primary)" }}>
                  Refreshing...
                </span>
              )}
              {lowStockCount > 0 && (
                <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-600">
                  {lowStockCount} low stock
                </span>
              )}
              {trackedInStock > 0 && viewMode === "imei" && (
                <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  {trackedInStock} in stock
                </span>
              )}
              {trackedDefective > 0 && viewMode === "imei" && (
                <span className="px-2.5 py-1 rounded-full bg-red-100 text-red-600">
                  {trackedDefective} defective
                </span>
              )}
              {unitsMissingSupplier > 0 && viewMode === "imei" && (
                <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">
                  {unitsMissingSupplier} missing supplier
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        {[
          { label: "Products", value: count.toLocaleString("en-NG") },
          { label: "Stock Value", value: fmtCurrency(totalValue) },
          { label: "Stock Cost", value: fmtCurrency(totalCost) },
          { label: "Projected Profit", value: fmtCurrency(projectedProfit) },
          { label: "Tracked Units", value: unitSummary.total.toLocaleString("en-NG") },
          { label: "Sold Units", value: trackedSold.toLocaleString("en-NG") },
        ].map((metric) => (
          <div key={metric.label} className="p-4 rounded-2xl border min-w-0"
            style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--color-muted)" }}>
              {metric.label}
            </p>
            <p className="text-xl font-display font-bold truncate" style={{ color: "var(--color-text)" }}>
              {metric.value}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
              style={{ color: "var(--color-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={viewMode === "imei" ? "Search exact IMEI, serial, or product..." : "Search by name, SKU, brand, or model..."}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
              style={inputStyle}
            />
          </div>
          {viewMode === "aggregate" ? (
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm outline-none shrink-0"
              style={{ ...inputStyle, minWidth: "150px" }}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          ) : (
            <button
              onClick={() => {
                setSearch("");
                setUnitStatusFilter("");
                setUnitConditionFilter("");
                setUnitSupplierFilter("");
                setUnitProductFilter("");
              }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shrink-0"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}
            >
              Reset
            </button>
          )}
        </div>

        {viewMode === "imei" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <select value={unitStatusFilter} onChange={(e) => setUnitStatusFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
              <option value="">All statuses</option>
              <option value="in_stock">In stock</option>
              <option value="reserved">Reserved</option>
              <option value="sold">Sold</option>
              <option value="returned">Returned</option>
              <option value="defective">Defective</option>
            </select>
            <select value={unitConditionFilter} onChange={(e) => setUnitConditionFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
              <option value="">All conditions</option>
              <option value="new">New</option>
              <option value="refurbished">Refurbished</option>
              <option value="used">Used</option>
            </select>
            <select value={unitProductFilter} onChange={(e) => setUnitProductFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
              <option value="">All products</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
            <select value={unitSupplierFilter} onChange={(e) => setUnitSupplierFilter(e.target.value)}
              className="px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
              <option value="">All suppliers</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <BarcodeScannerNotice
        title="Use the barcode scanner on Inventory"
        description={viewMode === "imei"
          ? "Scan an IMEI or serial to open the exact unit history."
          : "Scan a SKU to open that product for review or editing."}
      />

      {/* Table */}
      <div className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
        {loading && products.length === 0 ? (
          <div className="flex items-center justify-center h-48">
            <svg className="animate-spin w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : products.length === 0 && viewMode === "aggregate" ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <svg className="w-10 h-10" style={{ color: "var(--color-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>No products found</p>
          </div>
        ) : (
          <>
          {viewMode === "aggregate" ? (
            <>
              <div className="md:hidden divide-y" style={{ borderColor: "var(--color-border)" }}>
                {products.map((product) => (
                  <div key={product.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      {product.image ? (
                        <div className="shrink-0 w-12 h-12 rounded-xl overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                          <img
                            src={resolveAssetUrl(product.image) || undefined}
                            alt={product.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                      ) : (
                        <div className="shrink-0 w-12 h-12 rounded-xl flex items-center justify-center font-bold text-sm bg-primary/10 text-primary">
                          {(product.brand || product.name).substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                          {product.name}
                        </p>
                        <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                          {product.category_name || "Uncategorized"}{product.sku ? ` • SKU: ${product.sku}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Price</p>
                        <p className="mt-1 font-semibold" style={{ color: "var(--color-text)" }}>₦{Number(product.selling_price).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Stock</p>
                        <p className={`mt-1 font-semibold ${product.is_low_stock ? "text-red-500" : ""}`} style={!product.is_low_stock ? { color: "var(--color-text)" } : {}}>
                          {product.quantity}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Margin</p>
                        <p className="mt-1 font-semibold text-green-600">{Number(product.profit_margin).toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="rounded-xl px-3 py-2" style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                          Unit Tracking
                        </p>
                        <p className="text-xs font-bold" style={{ color: getUntrackedStock(product) > 0 ? "#b45309" : "var(--color-primary)" }}>
                          {getTrackingStatusText(product)}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => openHistory(product)}
                        className="text-xs px-3 py-2 rounded-lg font-medium transition-colors"
                        style={{
                          backgroundColor: "var(--color-bg)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-muted)",
                        }}>
                        History
                      </button>
                      {canManageInventory && (
                        <button onClick={() => openAdjust(product)}
                          className="text-xs px-3 py-2 rounded-lg font-medium transition-colors"
                          style={{
                            backgroundColor: "var(--color-bg)",
                            border: "1px solid var(--color-border)",
                            color: "var(--color-text)",
                          }}>
                          Stock
                        </button>
                      )}
                      {canManageInventory && (
                        <button onClick={() => openRegisterUnit(product)}
                          className="text-xs px-3 py-2 rounded-lg font-medium text-primary transition-colors"
                          style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                          Register Unit
                        </button>
                      )}
                      {canManageInventory && (
                        <button onClick={() => openEdit(product)}
                          className="text-xs px-3 py-2 rounded-lg font-medium text-primary transition-colors"
                          style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
                          Edit
                        </button>
                      )}
                      {canManageInventory && (
                        <button onClick={() => handleDeleteProduct(product.id)}
                          className="text-xs px-3 py-2 rounded-lg font-medium text-red-600 transition-colors"
                          style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden md:block w-full overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                      {["Product", "Category", "Cost", "Price", "Margin", "Stock", "Actions"].map((h) => (
                        <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide"
                          style={{ color: "var(--color-muted)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product, i) => (
                      <tr key={product.id}
                        style={{
                          borderBottom: i < products.length - 1 ? "1px solid var(--color-border)" : "none",
                        }}>
                        <td className="px-5 py-4 flex items-center gap-3">
                          {product.image ? (
                            <div className="shrink-0 w-10 h-10 rounded-lg overflow-hidden border" style={{ borderColor: "var(--color-border)" }}>
                              <img
                                src={resolveAssetUrl(product.image) || undefined}
                                alt={product.name}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            </div>
                          ) : (
                            <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center font-bold text-sm bg-primary/10 text-primary">
                              {(product.brand || product.name).substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
                              {product.name}
                            </p>
                            {product.sku && (
                              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                                SKU: {product.sku}
                              </p>
                            )}
                            {(product.brand || product.product_model) && (
                              <p className="text-xs mt-0.5 font-semibold" style={{ color: "var(--color-muted)" }}>
                                {product.brand} {product.product_model}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs px-2 py-1 rounded-full font-medium"
                            style={{ backgroundColor: "var(--color-bg)", color: "var(--color-muted)" }}>
                            {product.category_name || "—"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm" style={{ color: "var(--color-text)" }}>
                          ₦{Number(product.cost_price).toLocaleString()}
                        </td>
                        <td className="px-5 py-4 text-sm" style={{ color: "var(--color-text)" }}>
                          ₦{Number(product.selling_price).toLocaleString()}
                        </td>
                        <td className="px-5 py-4">
                          <span className="text-xs font-medium text-green-600">
                            {Number(product.profit_margin).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${
                              product.is_low_stock ? "text-red-500" : ""
                            }`} style={!product.is_low_stock ? { color: "var(--color-text)" } : {}}>
                              {product.quantity}
                            </span>
                            {product.is_low_stock && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">
                                Low
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-1 font-medium" style={{ color: getUntrackedStock(product) > 0 ? "#b45309" : "var(--color-muted)" }}>
                            {getTrackingStatusText(product)}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button onClick={() => openHistory(product)}
                              className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                              style={{
                                backgroundColor: "var(--color-bg)",
                                border: "1px solid var(--color-border)",
                                color: "var(--color-muted)",
                              }}>
                              History
                            </button>
                            {canManageInventory && (
                              <button onClick={() => openAdjust(product)}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                                style={{
                                  backgroundColor: "var(--color-bg)",
                                  border: "1px solid var(--color-border)",
                                  color: "var(--color-text)",
                                }}>
                                Stock
                              </button>
                            )}
                            {canManageInventory && (
                              <button onClick={() => openRegisterUnit(product)}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-primary transition-colors"
                                style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                                Register Unit
                              </button>
                            )}
                            {canManageInventory && (
                              <button onClick={() => openEdit(product)}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-primary transition-colors"
                                style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
                                Edit
                              </button>
                            )}
                            {canManageInventory && (
                              <button onClick={() => handleDeleteProduct(product.id)}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-red-600 transition-colors"
                                style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
                                Remove
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div>
              {unitsLoading ? (
                <div className="p-8 text-center text-muted">Loading tracked units...</div>
              ) : productUnits.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-2">
                  <svg className="w-10 h-10" style={{ color: "var(--color-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <p className="text-sm" style={{ color: "var(--color-muted)" }}>No tracked units found.</p>
                </div>
              ) : (
                <>
                  <div className="md:hidden divide-y" style={{ borderColor: "var(--color-border)" }}>
                    {productUnits.map((unit) => (
                      <div key={unit.id} className="p-4 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                              {unit.imei_1 ? "IMEI" : "Serial"}
                            </p>
                            <p className="mt-1 text-sm font-bold break-all" style={{ color: "var(--color-text)" }}>
                              {unit.identifier}
                            </p>
                            <p className="mt-1 text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                              {unit.product_name}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 items-end shrink-0">
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${unitStatusStyle[unit.status]}`}>
                              {unit.status_display}
                            </span>
                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${unitConditionStyle[unit.condition]}`}>
                              {unit.condition_display}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Supplier</p>
                            <p className="mt-1 font-semibold break-words" style={{ color: "var(--color-text)" }}>{unit.supplier_name || "Not linked"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Buyer</p>
                            <p className="mt-1 font-semibold break-words" style={{ color: "var(--color-text)" }}>{unit.sold_to_name || "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Cost</p>
                            <p className="mt-1 font-semibold" style={{ color: "var(--color-text)" }}>{unit.purchase_price ? fmtCurrency(unit.purchase_price) : "—"}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Warranty</p>
                            <p className={`mt-1 font-semibold ${unit.warranty_is_active ? "text-green-600" : ""}`} style={!unit.warranty_is_active ? { color: "var(--color-text)" } : {}}>
                              {unit.warranty_is_active ? "Active" : unit.warranty_months > 0 ? `${unit.warranty_months} mo` : "None"}
                            </p>
                          </div>
                        </div>

                        {(unit.color || unit.storage || unit.imei_2 || unit.notes) && (
                          <div className="flex flex-wrap gap-2">
                            {unit.color && <span className="px-2 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-muted)" }}>{unit.color}</span>}
                            {unit.storage && <span className="px-2 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-muted)" }}>{unit.storage}</span>}
                            {unit.imei_2 && <span className="px-2 py-1 rounded-lg text-xs font-semibold" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-muted)" }}>IMEI 2: {unit.imei_2}</span>}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedUnit(unit)}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold text-primary"
                          style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}
                        >
                          View Item History
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="hidden md:block w-full overflow-x-auto">
                    <table className="w-full min-w-[1160px]">
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                          {["Unit", "Product", "Source", "Sale / Owner", "Financials", "Warranty", "Status", "Actions"].map((h) => (
                            <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide"
                              style={{ color: "var(--color-muted)" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {productUnits.map((unit, i) => (
                          <tr key={unit.id} style={{ borderBottom: i < productUnits.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                            <td className="px-5 py-4">
                              <p className="text-sm font-bold break-all" style={{ color: "var(--color-text)" }}>
                                {unit.identifier}
                              </p>
                              <div className="mt-1 flex flex-wrap gap-1.5">
                                {unit.imei_1 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-muted)" }}>
                                    IMEI 1
                                  </span>
                                )}
                                {unit.imei_2 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-muted)" }}>
                                    IMEI 2: {unit.imei_2}
                                  </span>
                                )}
                                {unit.serial_number && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold" style={{ backgroundColor: "var(--color-bg)", color: "var(--color-muted)" }}>
                                    Serial
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{unit.product_name}</p>
                              {(unit.color || unit.storage) && (
                                <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                                  {[unit.color, unit.storage].filter(Boolean).join(" • ")}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{unit.supplier_name || "Not linked"}</p>
                              {unit.purchase_order && (
                                <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>PO #{unit.purchase_order}</p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>{unit.sold_to_name || "—"}</p>
                              {unit.sale && (
                                <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                                  Sale #{unit.sale}{unit.sold_at ? ` • ${new Date(unit.sold_at).toLocaleDateString()}` : ""}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                                Cost: {unit.purchase_price ? fmtCurrency(unit.purchase_price) : "—"}
                              </p>
                              <p className="text-xs mt-1 text-green-600 font-semibold">
                                Sold: {unit.selling_price_actual ? fmtCurrency(unit.selling_price_actual) : "—"}
                              </p>
                            </td>
                            <td className="px-5 py-4">
                              <p className={`text-sm font-semibold ${unit.warranty_is_active ? "text-green-600" : ""}`} style={!unit.warranty_is_active ? { color: "var(--color-text)" } : {}}>
                                {unit.warranty_is_active ? "Active" : unit.warranty_months > 0 ? `${unit.warranty_months} month(s)` : "None"}
                              </p>
                              {unit.warranty_expiry && (
                                <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                                  Exp. {new Date(unit.warranty_expiry).toLocaleDateString()}
                                </p>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <div className="flex flex-col gap-1.5 items-start">
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${unitStatusStyle[unit.status]}`}>
                                  {unit.status_display}
                                </span>
                                <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${unitConditionStyle[unit.condition]}`}>
                                  {unit.condition_display}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-4">
                              <button
                                type="button"
                                onClick={() => setSelectedUnit(unit)}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-primary"
                                style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}
                              >
                                History
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
          </>
        )}
      </div>

      {/* Pagination */}
      {viewMode === "aggregate" && (
        <Pagination
          count={count}
          page={page}
          pageSize={20}
          onChange={setPage}
        />
      )}

      {/* Add/Edit Product Modal */}
      {showAddProduct && (
        <Modal
          title={editingProduct ? "Edit Product" : "Add Product"}
          onClose={() => { setShowAddProduct(false); setEditingProduct(null); setProductForm(emptyForm); }}
        >
            <div className="space-y-4">
            {/* Row 1 — name + sku */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Product Name" error={formErrors.name}>
                <Input name="name" value={productForm.name} onChange={handleProductChange}
                  placeholder="HP Laptop Charger" />
              </Field>
              <Field label="SKU (optional)" hint="Save the item's barcode value here if you want scanner support.">
                <Input name="sku" value={productForm.sku} onChange={handleProductChange}
                  placeholder="SKU-001" />
              </Field>
            </div>

            {/* Row 2 — brand + model */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Brand (optional)">
                <Input name="brand" value={productForm.brand} onChange={handleProductChange}
                  placeholder="HP, Samsung, Apple" />
              </Field>
              <Field label="Model (optional)">
                <Input name="product_model" value={productForm.product_model}
                  onChange={handleProductChange} placeholder="Pavilion 15, A52s" />
              </Field>
            </div>

            {/* Row 3 — color + image */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Color (optional)">
                <Input name="color" value={productForm.color} onChange={handleProductChange}
                  placeholder="Black, Silver, Red" />
              </Field>
              <Field label="Product Image (optional)" error={formErrors.image}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setProductForm({ ...productForm, image: file });
                  }}
                  className="w-full px-4 py-2 file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 text-sm outline-none cursor-pointer"
                  style={inputStyle}
                />
              </Field>
            </div>

            {/* Category — dropdown + inline create */}
            <Field label="Category">
              <div className="space-y-2">
                <select name="category" value={productForm.category}
                  onChange={handleProductChange}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                  style={inputStyle}>
                  <option value="">No category</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
                  <span className="text-xs" style={{ color: "var(--color-muted)" }}>or create new</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: "var(--color-border)" }} />
                </div>
                <Input name="new_category" value={productForm.new_category}
                  onChange={handleProductChange}
                  placeholder="Type new category name..." />
              </div>
            </Field>

            {/* Prices */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Cost Price (₦)" error={formErrors.cost_price}
                hint={productForm.cost_price ? `Preview: ₦${Number(productForm.cost_price).toLocaleString("en-NG")}` : undefined}>
                <Input name="cost_price" value={productForm.cost_price}
                  onChange={handleProductChange} type="number" placeholder="4000" step="0.01" />
              </Field>
              <Field label="Selling Price (₦)" error={formErrors.selling_price}
                hint={productForm.selling_price ? `Preview: ₦${Number(productForm.selling_price).toLocaleString("en-NG")}` : undefined}>
                <Input name="selling_price" value={productForm.selling_price}
                  onChange={handleProductChange} type="number" placeholder="6500" step="0.01" />
              </Field>
            </div>

            {/* Stock */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Quantity" error={formErrors.quantity}>
                <Input name="quantity" value={productForm.quantity}
                  onChange={handleProductChange} type="number" placeholder="20" />
              </Field>
              <Field label="Low Stock Alert At">
                <Input name="low_stock_threshold" value={productForm.low_stock_threshold}
                  onChange={handleProductChange} type="number" placeholder="5" />
              </Field>
            </div>

            {/* Description */}
            <Field label="Description (optional)">
              <textarea
                name="description" value={productForm.description}
                onChange={handleProductChange}
                placeholder="Optional product description"
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                style={inputStyle}
              />
            </Field>

            {/* Profit preview */}
            {productForm.cost_price && productForm.selling_price && (
              <div className="p-3 rounded-xl flex items-center justify-between"
                style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <span className="text-xs" style={{ color: "var(--color-muted)" }}>Profit margin preview</span>
                <span className="text-sm font-semibold text-green-600">
                  {(((parseFloat(productForm.selling_price) - parseFloat(productForm.cost_price)) /
                    parseFloat(productForm.selling_price)) * 100).toFixed(1)}%
                  {" "}(₦{(parseFloat(productForm.selling_price) - parseFloat(productForm.cost_price)).toLocaleString()})
                </span>
              </div>
            )}

            <div
              className="flex gap-3 pt-3 pb-1"
              style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
            >
              <button
                onClick={() => { setShowAddProduct(false); setEditingProduct(null); setProductForm(emptyForm); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}>
                Cancel
              </button>
              <button onClick={handleSaveProduct} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--color-primary)" }}>
                {saving ? "Saving..." : editingProduct ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Category Modal */}
      {showAddCategory && (
        <Modal title="Add Category" onClose={() => setShowAddCategory(false)}>
          <div className="space-y-4">
            <Field label="Category Name">
              <Input name="category" value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="e.g. Charger, Screen, Battery" />
            </Field>
            <div
              className="flex gap-3 pt-3 pb-1"
              style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
            >
              <button onClick={() => setShowAddCategory(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}>
                Cancel
              </button>
              <button onClick={handleSaveCategory} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--color-primary)" }}>
                {saving ? "Saving..." : "Add Category"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustStock && adjustingProduct && (
        <Modal title={`Adjust Stock — ${adjustingProduct.name}`}
          onClose={() => setShowAdjustStock(false)}>
          <div className="space-y-4">
            <div className="p-4 rounded-xl flex items-center justify-between"
              style={{ backgroundColor: "var(--color-bg)" }}>
              <div>
                <span className="text-sm block mb-0.5" style={{ color: "var(--color-muted)" }}>Current Stock</span>
                {adjustingProduct.selling_price && (
                  <span className="text-xs font-medium text-green-600">
                    Total Value: ₦{Number(parseFloat(adjustingProduct.selling_price) * adjustingProduct.quantity).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>
              <span className="font-display font-bold text-lg" style={{ color: "var(--color-text)" }}>
                {adjustingProduct.quantity} units
              </span>
            </div>

            <Field label="Change Amount (use negative to deduct)">
              <Input name="change_amount" value={adjustForm.change_amount}
                onChange={(e) => setAdjustForm({ ...adjustForm, change_amount: e.target.value })}
                type="number" placeholder="+10 or -5" />
            </Field>

            <Field label="Reason">
              <select value={adjustForm.reason}
                onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}>
                <option value="adjustment">Manual Adjustment</option>
                <option value="purchase">Stock Purchase</option>
                <option value="return">Customer Return</option>
                <option value="damage">Damaged / Written Off</option>
              </select>
            </Field>

            <Field label="Note (optional)">
              <Input name="note" value={adjustForm.note}
                onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })}
                placeholder="Optional note" />
            </Field>

            <div
              className="flex gap-3 pt-3 pb-1"
              style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
            >
              <button onClick={() => setShowAdjustStock(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}>
                Cancel
              </button>
              <button onClick={handleAdjustStock} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--color-primary)" }}>
                {saving ? "Saving..." : "Update Stock"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* Stock History Modal */}
      {showHistory && historyProduct && (
        <Modal
          title={`Stock History — ${historyProduct.name}`}
          onClose={() => { setShowHistory(false); setHistoryProduct(null); }}
        >
          {historyLoading ? (
            <div className="flex items-center justify-center h-32">
              <svg className="animate-spin w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : stockLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <p className="text-sm" style={{ color: "var(--color-muted)" }}>No stock movements recorded yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {stockLogs.map((log) => (
                <div key={log.id}
                  className="flex items-start justify-between gap-3 px-4 py-3 rounded-xl"
                  style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: log.change_amount > 0 ? "#dcfce7" : "#fef2f2",
                          color: log.change_amount > 0 ? "#166534" : "#dc2626",
                        }}>
                        {log.change_amount > 0 ? `+${log.change_amount}` : log.change_amount}
                      </span>
                      <span className="text-xs font-medium" style={{ color: "var(--color-text)" }}>
                        {log.reason_display || log.reason}
                      </span>
                    </div>
                    {log.note && (
                      <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>{log.note}</p>
                    )}
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                      by {log.created_by_name || "System"} · {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
                      {log.quantity_after}
                    </p>
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>in stock</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={deleteConfirmId !== null}
        title="Remove Product"
        message="Are you sure you want to remove this product from inventory?"
        confirmText="Remove Product"
        onConfirm={executeDeleteProduct}
        onCancel={() => setDeleteConfirmId(null)}
      />

      {showUnitModal && (
        <Modal title="Register Existing Unit" onClose={() => setShowUnitModal(false)}>
          <form onSubmit={handleAddUnit} className="space-y-4">
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)", color: "var(--color-muted)" }}
            >
              Use this for old stock, forgotten IMEIs, or one-off units that were not received through a purchase order.
            </div>
            <Field label="Product *">
              <select required value={unitForm.product} onChange={e => setUnitForm({ ...unitForm, product: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
                <option value="">Select a product...</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="IMEI / Serial *">
                <Input
                  name="identifier"
                  value={unitForm.identifier}
                  onChange={(e) => {
                    const value = e.target.value.trim();
                    const looksLikeImei = /^\d{14,17}$/.test(value);
                    setUnitForm({
                      ...unitForm,
                      identifier: value,
                      imei_1: looksLikeImei ? value : "",
                      serial_number: looksLikeImei ? "" : value,
                    });
                  }}
                  placeholder="353456789012345 or SN-C02..."
                />
              </Field>
              <Field label="IMEI 2 (optional)">
                <Input
                  name="imei_2"
                  value={unitForm.imei_2}
                  onChange={(e) => setUnitForm({ ...unitForm, imei_2: e.target.value })}
                  placeholder="Dual SIM IMEI"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Supplier">
                <select value={unitForm.supplier} onChange={e => setUnitForm({ ...unitForm, supplier: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
                  <option value="">No supplier linked</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Purchase Cost (₦)">
                <Input
                  name="purchase_price"
                  value={unitForm.purchase_price}
                  onChange={(e) => setUnitForm({ ...unitForm, purchase_price: e.target.value })}
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Field label="Condition">
                <select value={unitForm.condition} onChange={e => setUnitForm({ ...unitForm, condition: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
                  <option value="new">New</option>
                  <option value="refurbished">Refurbished</option>
                  <option value="used">Used</option>
                </select>
              </Field>
              <Field label="Status">
                <select value={unitForm.status} onChange={e => setUnitForm({ ...unitForm, status: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle}>
                  <option value="in_stock">In Stock</option>
                  <option value="defective">Defective</option>
                </select>
              </Field>
              <Field label="Warranty Months">
                <Input
                  name="warranty_months"
                  value={unitForm.warranty_months}
                  onChange={(e) => setUnitForm({ ...unitForm, warranty_months: e.target.value })}
                  type="number"
                  placeholder="0"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Color">
                <Input
                  name="color"
                  value={unitForm.color}
                  onChange={(e) => setUnitForm({ ...unitForm, color: e.target.value })}
                  placeholder="Natural Titanium"
                />
              </Field>
              <Field label="Storage / Spec">
                <Input
                  name="storage"
                  value={unitForm.storage}
                  onChange={(e) => setUnitForm({ ...unitForm, storage: e.target.value })}
                  placeholder="256GB, 16GB RAM"
                />
              </Field>
            </div>

            <Field label="Notes">
              <textarea
                value={unitForm.notes}
                onChange={e => setUnitForm({ ...unitForm, notes: e.target.value })}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none"
                rows={2}
                style={inputStyle}
                placeholder="Box condition, warranty notes, defects, or supplier remarks"
              />
            </Field>

            <div className="flex gap-3 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
              <button type="button" onClick={() => setShowUnitModal(false)} disabled={saving}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}>
                Cancel
              </button>
              <button type="submit" disabled={saving || !unitForm.identifier.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--color-primary)" }}>
                {saving ? "Saving..." : "Register Unit"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selectedUnit && (
        <Modal
          title={`Item History — ${selectedUnit.identifier}`}
          onClose={() => setSelectedUnit(null)}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                    {selectedUnit.imei_1 ? "IMEI" : "Serial"}
                  </p>
                  <p className="mt-1 text-lg font-display font-bold break-all" style={{ color: "var(--color-text)" }}>
                    {selectedUnit.identifier}
                  </p>
                  <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
                    {selectedUnit.product_name}
                    {[selectedUnit.color, selectedUnit.storage].filter(Boolean).length > 0
                      ? ` • ${[selectedUnit.color, selectedUnit.storage].filter(Boolean).join(" • ")}`
                      : ""}
                  </p>
                </div>
                <div className="flex flex-wrap sm:flex-col gap-1.5 sm:items-end">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${unitStatusStyle[selectedUnit.status]}`}>
                    {selectedUnit.status_display}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${unitConditionStyle[selectedUnit.condition]}`}>
                    {selectedUnit.condition_display}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { label: "Supplier", value: selectedUnit.supplier_name || "Not linked" },
                { label: "Purchase Order", value: selectedUnit.purchase_order ? `PO #${selectedUnit.purchase_order}` : "Not linked" },
                { label: "Registered", value: fmtDate(selectedUnit.created_at) },
                { label: "Purchase Cost", value: selectedUnit.purchase_price ? fmtCurrency(selectedUnit.purchase_price) : "—" },
                { label: "Customer", value: selectedUnit.sold_to_name || "Not sold yet" },
                { label: "Sale", value: selectedUnit.sale ? `Sale #${selectedUnit.sale}` : "—" },
                { label: "Sold Date", value: fmtDate(selectedUnit.sold_at) },
                { label: "Sold Price", value: selectedUnit.selling_price_actual ? fmtCurrency(selectedUnit.selling_price_actual) : "—" },
              ].map((item) => (
                <div key={item.label} className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                    {item.label}
                  </p>
                  <p className="mt-1 text-sm font-semibold break-words" style={{ color: "var(--color-text)" }}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              <p className="text-sm font-display font-bold mb-3" style={{ color: "var(--color-text)" }}>
                Lifecycle
              </p>
              <div className="space-y-3">
                {[
                  {
                    title: selectedUnit.purchase_order ? "Received from supplier" : "Registered manually",
                    meta: `${selectedUnit.supplier_name || "No supplier linked"} • ${fmtDate(selectedUnit.created_at)}`,
                    tone: "bg-blue-100 text-blue-700 border-blue-200",
                  },
                  {
                    title: selectedUnit.status === "sold" ? "Sold to customer" : "Current stock status",
                    meta: selectedUnit.status === "sold"
                      ? `${selectedUnit.sold_to_name || "Customer not linked"} • ${fmtDate(selectedUnit.sold_at)}`
                      : selectedUnit.status_display,
                    tone: selectedUnit.status === "sold"
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : "bg-slate-100 text-slate-700 border-slate-200",
                  },
                  {
                    title: selectedUnit.warranty_months > 0 ? "Warranty" : "No warranty recorded",
                    meta: selectedUnit.warranty_months > 0
                      ? `${selectedUnit.warranty_months} month(s)${selectedUnit.warranty_expiry ? ` • expires ${fmtDate(selectedUnit.warranty_expiry)}` : ""}`
                      : "—",
                    tone: selectedUnit.warranty_is_active
                      ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                      : "bg-amber-100 text-amber-700 border-amber-200",
                  },
                ].map((step, index) => (
                  <div key={step.title} className="flex gap-3">
                    <span className={`mt-0.5 h-6 w-6 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 ${step.tone}`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>{step.title}</p>
                      <p className="text-xs mt-0.5 break-words" style={{ color: "var(--color-muted)" }}>{step.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>Profit On Unit</p>
                <p className={`mt-1 text-sm font-bold ${selectedUnitProfitKnown && selectedUnitProfit >= 0 ? "text-green-600" : ""}`} style={!selectedUnitProfitKnown || selectedUnitProfit < 0 ? { color: "var(--color-text)" } : {}}>
                  {selectedUnitProfitKnown ? fmtCurrency(selectedUnitProfit) : "—"}
                </p>
              </div>
              <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>IMEI 2 / Notes</p>
                <p className="mt-1 text-sm font-semibold break-words" style={{ color: "var(--color-text)" }}>
                  {[selectedUnit.imei_2 ? `IMEI 2: ${selectedUnit.imei_2}` : "", selectedUnit.notes].filter(Boolean).join(" • ") || "—"}
                </p>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
    </>
  );
}
