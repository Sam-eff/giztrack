import { useDeferredValue, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import type { Product, Category } from "../types";
import api from "../api/axios";
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
function Modal({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
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
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col"
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
      setProducts(prodRes.data.results || prodRes.data);
      setCount(prodRes.data.count || 0);
    } catch {
      error("Failed to fetch products.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchProducts(products.length === 0 ? "initial" : "refresh"); }, [deferredSearch, categoryFilter, page]);

  useEffect(() => {
    api.get("/shops/")
      .then(({ data }) => setStaffCanManage(data.allow_staff_inventory_management === true))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void Promise.all([fetchCategories(), fetchSummary()]);
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [search, categoryFilter]);

  // Barcode scanning logic
  useBarcodeScanner({
    onScan: (barcode) => {
      // If we are currently showing modals, ignore (could interfere with editing)
      if (showAddProduct || showAdjustStock || showHistory) return;
      
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

  const lowStockCount = products.filter((p) => p.is_low_stock).length;

  return (
    <>
      <Helmet>
        <title>Inventory — Giztrack</title>
        <meta name="description" content="Manage your products, track stock levels, and organize items by category." />
      </Helmet>
    <div className="space-y-6 max-w-7xl mx-auto">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--color-text)" }}>
            Inventory
          </h1>
          <p className="text-sm mt-1 flex flex-wrap items-center gap-2" style={{ color: "var(--color-muted)" }}>
            <span>{count} product(s)</span>
            {refreshing && (
              <span className="text-xs font-semibold" style={{ color: "var(--color-primary)" }}>
                Refreshing...
              </span>
            )}
            {lowStockCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">
                {lowStockCount} low stock
              </span>
            )}
            {summary.total_value > 0 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap" style={{ background: "var(--color-primary)", color: "white", opacity: 0.9 }}>
                Stock Value: ₦{summary.total_value.toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {canManageInventory && (
            <button onClick={() => setShowAddCategory(true)}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{
                backgroundColor: "var(--color-surface)",
                border: "1px solid var(--color-border)",
                color: "var(--color-text)",
              }}>
              + Category
            </button>
          )}
          {canManageInventory && (
            <button onClick={() => { setEditingProduct(null); setProductForm(emptyForm); setShowAddProduct(true); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: "var(--color-primary)" }}>
              + Add Product
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
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
            placeholder="Search by name, SKU, brand, or model..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
            style={inputStyle}
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2.5 rounded-xl text-sm outline-none shrink-0"
          style={{ ...inputStyle, minWidth: "120px" }}
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <BarcodeScannerNotice
        title="Use the barcode scanner on Inventory"
        description="Scan while your cursor is not inside any form field. If the SKU matches a product, Giztrack opens that item for review or editing. If it is not on the current page, the scanned code is used to search for it."
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
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2">
            <svg className="w-10 h-10" style={{ color: "var(--color-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm" style={{ color: "var(--color-muted)" }}>No products found</p>
          </div>
        ) : (
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
        )}
      </div>

      {/* Pagination */}
      <Pagination
        count={count}
        page={page}
        pageSize={20}
        onChange={setPage}
      />

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
    </div>
    </>
  );
}
