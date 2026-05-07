import { useDeferredValue, useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import type { Customer, Product, Sale, SaleItem } from "../types";
import api from "../api/axios";
import CustomerLookup from "../components/CustomerLookup";
import Pagination from "../components/Pagination";
import BarcodeScannerNotice from "../components/BarcodeScannerNotice";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { resolveAssetUrl } from "../utils/assets";
import { getApiErrorMessage } from "../utils/http";

// ── Types ─────────────────────────────────────────────────────────────────────
interface CartItem {
  product: Product | null;
  product_name: string;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  is_custom: boolean;
  product_image?: string | null;
}

interface ReceiptShop {
  name: string;
  address: string;
  phone: string;
  email: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 sm:px-4 print:inset-auto print:relative print:bg-transparent print:p-0"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
      <div className="w-full max-w-lg rounded-t-3xl sm:rounded-2xl shadow-xl flex flex-col print:shadow-none print:border-none print:w-auto print:max-h-full"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          maxHeight: "calc(100dvh - 2rem)",
        }}>
        <div className="flex justify-center pt-3 sm:hidden print:hidden">
          <span className="h-1.5 w-14 rounded-full" style={{ backgroundColor: "var(--color-border)" }} />
        </div>
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 border-b shrink-0 print:hidden"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
          <h2 className="font-display font-bold text-base" style={{ color: "var(--color-text)" }}>
            {title}
          </h2>
          <button onClick={onClose} style={{ color: "var(--color-muted)" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto touch-scroll print:overflow-visible print:p-0">{children}</div>
      </div>
    </div>
  );
}

const inputStyle = {
  backgroundColor: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
};

const fmt = (n: number | string) =>
  `₦${Number(n).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

const getBalanceOwed = (sale: Pick<Sale, "balance_owed">) =>
  Number.parseFloat(sale.balance_owed || "0");

const hasOutstandingBalance = (sale: Sale) =>
  sale.is_credit && getBalanceOwed(sale) > 0;

// ── Receipt Component ─────────────────────────────────────────────────────────
function Receipt({
  sale,
  onClose,
  onReturnItem,
  onCollectPayment,
}: {
  sale: Sale;
  onClose: () => void;
  onReturnItem?: (item: SaleItem) => void;
  onCollectPayment?: (sale: Sale) => void;
}) {
  const { user } = useAuth();
  const [shop, setShop] = useState<ReceiptShop | null>(null);

  useEffect(() => {
    api.get("/shops/").then(({ data }) => setShop(data)).catch(() => {});
  }, []);

  return (
    <Modal title="Sale Receipt" onClose={onClose}>
      <div className="w-full max-w-[320px] mx-auto bg-white p-4 print:p-0 print:m-0 text-gray-900 font-mono text-xs sm:text-sm">
        {/* Receipt header */}
        <div className="text-center mb-4">
          <h2 className="text-xl font-bold uppercase tracking-wider">{shop?.name || user?.shop_name || "Receipt"}</h2>
          {shop?.address && <p className="mt-1 whitespace-pre-line leading-tight">{shop.address}</p>}
          {shop?.phone && <p className="mt-1">Tel: {shop.phone}</p>}
          {shop?.email && <p>{shop.email}</p>}
        </div>

        <div className="border-b border-dashed border-gray-400 mb-3" />

        <div className="mb-3 space-y-1">
          <div className="flex justify-between">
            <span>Receipt No:</span>
            <span className="font-semibold">#{sale.id.toString().padStart(5, "0")}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{new Date(sale.created_at).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>
          <div className="flex justify-between">
            <span>Cashier:</span>
            <span>{sale.staff_name}</span>
          </div>
          <div className="flex justify-between">
            <span>Customer:</span>
            <span>{sale.customer_name || "Walk-in"}</span>
          </div>
        </div>

        <div className="border-b border-dashed border-gray-400 mb-3" />

        {/* Items */}
        <div className="space-y-2 mb-3">
          <div className="flex justify-between font-bold mb-1">
            <span>Item</span>
            <span>Total</span>
          </div>
          {sale.items.map((item) => {
            const returned = item.returned_quantity || 0;
            const canReturn = item.quantity > returned;
            
            return (
              <div key={item.id} className="flex flex-col mb-2 pb-1 border-b border-gray-100 border-dashed last:border-0 last:mb-0 last:pb-0">
                <div className="flex items-start gap-2">
                  {item.product_image ? (
                    <div className="w-8 h-8 rounded shrink-0 border border-gray-200 overflow-hidden print:w-6 print:h-6">
                      <img
                        src={resolveAssetUrl(item.product_image) || undefined}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded shrink-0 bg-gray-100 border border-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-400 print:w-6 print:h-6 print:hidden">
                      {item.product_name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex justify-between font-medium">
                      <span className="pr-2 text-gray-800">
                        {item.product_name}
                        {returned > 0 && (
                          <span className="ml-1.5 inline-block text-[9px] text-red-600 bg-red-50 border border-red-200 px-1 py-0.5 rounded-sm font-bold uppercase tracking-wider">
                            {returned} Returned
                          </span>
                        )}
                      </span>
                      <span className={returned > 0 ? "line-through text-gray-400" : ""}>{fmt(item.subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-gray-600 mt-1">
                      <span>{item.quantity} x {fmt(item.unit_price)}</span>
                      
                      {onReturnItem && canReturn && (
                        <button
                          onClick={() => onReturnItem(item)}
                          className="print:hidden text-[10px] font-bold px-2 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 hover:text-red-700 transition-colors"
                        >
                          Return
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="border-b border-dashed border-gray-400 mb-3" />

        {/* Totals */}
        <div className="space-y-1 mb-6">
          <div className="flex justify-between font-medium text-sm">
            <span>Subtotal:</span>
            <span>{fmt(parseFloat(sale.total_amount) + parseFloat(sale.discount_amount || "0"))}</span>
          </div>
          {parseFloat(sale.discount_amount) > 0 && (
            <div className="flex justify-between font-medium text-sm text-red-600">
              <span>Discount:</span>
              <span>-{fmt(sale.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base border-t border-dashed border-gray-400 pt-1 mt-1">
            <span>Total:</span>
            <span>{fmt(sale.total_amount)}</span>
          </div>
          {sale.is_credit && (
            <>
              <div className="flex justify-between text-sm">
                <span>Amount Paid:</span>
                <span className="text-green-700 font-semibold">{fmt(sale.amount_paid || "0")}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-red-600 border-t border-dashed border-gray-400 pt-1 mt-1">
                <span>Balance Owed:</span>
                <span>{fmt(sale.balance_owed || "0")}</span>
              </div>
            </>
          )}
        </div>

        {sale.is_credit && (
          <div className="text-center mb-4 py-1.5 border border-dashed border-red-400 rounded text-red-600">
            <p className="text-xs font-bold uppercase tracking-wider">⚠ Credit Sale</p>
            <p className="text-xs">Balance owed: {fmt(sale.balance_owed || "0")}</p>
          </div>
        )}

        {sale.payments.length > 0 && (
          <>
            <div className="border-b border-dashed border-gray-400 mb-3" />
            <div className="mb-4">
              <div className="flex justify-between font-bold mb-2">
                <span>Payments</span>
                <span>{sale.payments.length} entry(s)</span>
              </div>
              <div className="space-y-2">
                {sale.payments.map((payment) => {
                  const amount = Number.parseFloat(payment.amount);
                  const isNegative = amount < 0;

                  return (
                    <div key={payment.id} className="flex justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {new Date(payment.created_at).toLocaleString("en-GB", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                        <p className="text-[11px] text-gray-600 break-words">
                          {payment.note || (isNegative ? "Adjustment" : "Payment received")}
                          {payment.received_by_name ? ` • ${payment.received_by_name}` : ""}
                        </p>
                      </div>
                      <span className={`font-bold whitespace-nowrap ${isNegative ? "text-red-600" : "text-green-700"}`}>
                        {isNegative ? "-" : "+"}
                        {fmt(Math.abs(amount))}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div className="text-center text-gray-800 space-y-1">
          <p className="font-semibold">Thank you for your business!</p>
          <p>Please come again.</p>
        </div>

        <div className="flex gap-3 pt-6 print:hidden">
          {onCollectPayment && hasOutstandingBalance(sale) && (
            <button
              onClick={() => onCollectPayment(sale)}
              className="flex-1 py-2.5 rounded-xl font-semibold transition-colors bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200"
            >
              Collect Payment
            </button>
          )}
          <button onClick={() => window.print()}
            className="flex-1 py-2.5 rounded-xl font-semibold transition-colors bg-gray-100 text-gray-800 border border-gray-200 hover:bg-gray-200">
            Print
          </button>
          <button onClick={onClose}
            className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-accent hover:bg-primary">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function Sales() {
  const { user, isPro } = useAuth();
  const { success, error, warning } = useToast();
  const [tab, setTab] = useState<"pos" | "history">("pos");
  const [staffCanMakeSales, setStaffCanMakeSales] = useState(true);
  const canMakeSales = user?.role !== "staff" || staffCanMakeSales;
  const availableTabs: Array<"pos" | "history"> = canMakeSales ? ["pos", "history"] : ["history"];

  // POS state
  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [pendingScannedBarcode, setPendingScannedBarcode] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [discountAmount, setDiscountAmount] = useState<string>("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  // Credit sale
  const [isCredit, setIsCredit] = useState(false);
  const [amountPaid, setAmountPaid] = useState<string>("");

  // Custom Item Modal state
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [customItem, setCustomItem] = useState({ name: "", price: "" });

  // History state
  const [sales, setSales] = useState<Sale[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [collectingPayment, setCollectingPayment] = useState<Sale | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);

  // Return state
  const [returningItem, setReturningItem] = useState<{sale: Sale, item: SaleItem} | null>(null);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnRestock, setReturnRestock] = useState(true);
  const [returnSubmitting, setReturnSubmitting] = useState(false);

  // Pagination state
  const [page, setPage] = useState(1);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (user?.role !== "staff") {
      setStaffCanMakeSales(true);
      return;
    }

    let ignore = false;

    api.get("/shops/")
      .then(({ data }) => {
        if (!ignore) {
          setStaffCanMakeSales(data.allow_staff_sales !== false);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [user?.role]);

  useEffect(() => {
    if (!canMakeSales && tab === "pos") {
      setTab("history");
    }
  }, [canMakeSales, tab]);

  // Load products for POS
  useEffect(() => {
    let ignore = false;

    if (!canMakeSales) {
      setProducts([]);
      setProductsLoading(false);
      return;
    }

    setProductsLoading(true);

    api.get("/inventory/products/", { params: { search: deferredSearch } })
      .then(({ data }) => {
        if (ignore) return;
        setProducts(data.results || data);
      })
      .catch(() => {
        if (ignore) return;
        setProducts([]);
      })
      .finally(() => {
        if (!ignore) {
          setProductsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [deferredSearch, canMakeSales]);

  // Load sales history
  const fetchSales = () => {
    setHistoryLoading(true);
    api.get("/sales/", {
      params: { from: dateFrom, to: dateTo, page },
    })
      .then(({ data }) => {
        setSales(data.results || data);
        setCount(data.count || 0);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  };

  const syncSaleInState = (updatedSale: Sale) => {
    setSales((prev) => prev.map((sale) => (sale.id === updatedSale.id ? updatedSale : sale)));
    setSelectedSale((prev) => (prev?.id === updatedSale.id ? updatedSale : prev));
    setReceipt((prev) => (prev?.id === updatedSale.id ? updatedSale : prev));
    setCollectingPayment((prev) => (prev?.id === updatedSale.id ? updatedSale : prev));
  };

  const openCollectPayment = (sale: Sale) => {
    if (!canMakeSales) {
      error("Staff sales access is disabled for this shop.");
      return;
    }

    setPaymentAmount("");
    setPaymentNote("");
    setCollectingPayment(sale);
  };

  const handleRecordPayment = async () => {
    if (!collectingPayment) return;
    if (!canMakeSales) {
      error("Staff sales access is disabled for this shop.");
      return;
    }

    const amount = Number.parseFloat(paymentAmount);
    const balance = getBalanceOwed(collectingPayment);

    if (!amount || amount <= 0) {
      error("Enter a valid payment amount.");
      return;
    }

    if (amount > balance) {
      error("Payment cannot exceed the balance owed.");
      return;
    }

    setPaymentSubmitting(true);
    try {
      const { data } = await api.post(`/sales/${collectingPayment.id}/record-payment/`, {
        amount,
        note: paymentNote.trim(),
      });
      syncSaleInState(data.sale);
      success("Payment recorded successfully.");
      setCollectingPayment(null);
      fetchSales();
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Failed to record payment."));
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleReturnItem = async () => {
    if (!returningItem) return;
    if (!canMakeSales) {
      error("Staff sales access is disabled for this shop.");
      return;
    }

    setReturnSubmitting(true);
    try {
      const { data } = await api.post(`/sales/${returningItem.sale.id}/return_item/`, {
        sale_item_id: returningItem.item.id,
        quantity: parseInt(returnQuantity),
        restock: returnRestock
      });
      syncSaleInState(data.sale);
      success("Item returned successfully");
      setReturningItem(null);
      setSelectedSale(null);
      fetchSales();
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Failed to return item."));
    } finally {
      setReturnSubmitting(false);
    }
  };

  useEffect(() => {
    if (tab === "history") fetchSales();
  }, [tab, dateFrom, dateTo, page]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [dateFrom, dateTo]);

  const maxReturnableQuantity = returningItem
    ? returningItem.item.quantity - (returningItem.item.returned_quantity || 0)
    : 0;
  const parsedReturnQuantity = Number.parseInt(returnQuantity, 10) || 0;
  const returnRefundAmount = returningItem
    ? Math.max(0, parsedReturnQuantity) * Number.parseFloat(returningItem.item.unit_price)
    : 0;

  const handleCustomerSelect = (customer: Customer) => {
    setSelectedCustomer(customer);
    setCustomerPhone(customer.phone);
    setCustomerName(customer.name);
  };

  const handleCustomerPhoneChange = (value: string) => {
    setCustomerPhone(value);
    if (selectedCustomer && value !== selectedCustomer.phone) {
      setSelectedCustomer(null);
    }
  };

  const handleCustomerNameChange = (value: string) => {
    setCustomerName(value);
    if (selectedCustomer && value !== selectedCustomer.name) {
      setSelectedCustomer(null);
    }
  };

  // Cart operations
  const addToCart = (product: Product) => {
    if (!canMakeSales) return;
    if (product.quantity === 0) return;
    setCart((prev) => {
      const existing = prev.find((i) => i.product?.id === product.id && !i.is_custom);
      if (existing) {
        if (existing.quantity >= product.quantity) return prev;
        return prev.map((i) =>
          i.product?.id === product.id && !i.is_custom ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        product,
        product_name: product.name,
        unit_price: parseFloat(product.selling_price),
        unit_cost: parseFloat(product.cost_price),
        quantity: 1,
        is_custom: false,
        product_image: product.image,
      }];
    });
  };

  const addCustomToCart = () => {
    if (!canMakeSales) return;
    if (!customItem.name.trim() || isNaN(parseFloat(customItem.price))) return;
    setCart((prev) => [...prev, {
      product: null,
      product_name: customItem.name.trim(),
      unit_price: parseFloat(customItem.price),
      unit_cost: 0,
      quantity: 1,
      is_custom: true,
      product_image: null,
    }]);
    setShowCustomItem(false);
    setCustomItem({ name: "", price: "" });
  };

  // Barcode scanning logic
  useBarcodeScanner({
    onScan: (barcode) => {
      if (!canMakeSales) return;
      if (tab !== "pos") return;
      // Find product by SKU
      const product = products.find((p) => p.sku === barcode);
      if (product) {
        addToCart(product);
      } else {
        setProductsLoading(true);
        setPendingScannedBarcode(barcode);
        setSearch(barcode);
      }
    },
  });

  useEffect(() => {
    if (!pendingScannedBarcode || productsLoading) return;

    const product = products.find((item) => item.sku === pendingScannedBarcode);
    if (product) {
      addToCart(product);
    } else if (search === pendingScannedBarcode) {
      warning(`Scanned product not found: ${pendingScannedBarcode}`);
    }

    setPendingScannedBarcode(null);
  }, [pendingScannedBarcode, productsLoading, products, search, warning]);

  const updateQty = (index: number, quantity: number) => {
    if (quantity < 1) {
      removeFromCart(index);
      return;
    }
    setCart((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        // Check stock limit for inventory items
        if (!item.is_custom && item.product && quantity > item.product.quantity) return item;
        return { ...item, quantity };
      })
    );
  };

  const updatePrice = (index: number, price: string) => {
    const val = parseFloat(price);
    if (isNaN(val) || val < 0) return;
    setCart((prev) =>
      prev.map((item, i) => i === index ? { ...item, unit_price: val } : item)
    );
  };

  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const cartSubtotal = cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  const cartProfit = cart.reduce((sum, item) => sum + (item.unit_price - item.unit_cost) * item.quantity, 0);
  
  const discount = parseFloat(discountAmount) || 0;
  const cartTotal = Math.max(0, cartSubtotal - discount);
  const finalProfit = cartProfit - discount;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (!canMakeSales) {
      error("Staff sales access is disabled for this shop.");
      return;
    }

    if (isCredit && !customerPhone) {
      error("Credit sales require a customer phone number.");
      return;
    }
    const phoneRegex = /^(\+\d{1,3}\s?)?\d{10,11}$/;
    if (customerPhone && !phoneRegex.test(customerPhone)) {
      error("Phone must be exactly 10 or 11 digits (with optional country code, e.g., +234)");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post("/sales/", {
        items: cart.map((i) => ({
          product_id: i.product?.id || null,
          product_name: i.product_name,
          // send custom_price only when the price was changed from default
          custom_price: (!i.is_custom && i.product && i.unit_price !== parseFloat(i.product.selling_price))
            ? i.unit_price
            : undefined,
          unit_price: i.unit_price,
          quantity: i.quantity
        })),
        customer_phone: customerPhone,
        customer_name: customerName || customerPhone,
        discount_amount: discount,
        note,
        is_credit: isCredit,
        amount_paid: isCredit ? (parseFloat(amountPaid) || 0) : undefined,
      });
      setReceipt(data.sale);
      setCart([]);
      setCustomerPhone("");
      setCustomerName("");
      setSelectedCustomer(null);
      setDiscountAmount("");
      setNote("");
      setIsCredit(false);
      setAmountPaid("");
      success("Sale completed successfully!");
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Sale failed. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Point of Sale — Giztrack</title>
        <meta name="description" content="Process unrecorded sales, manage returns, and view sale history." />
      </Helmet>
      <div className="space-y-6 max-w-7xl mx-auto print:hidden">

      {/* Header + tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--color-text)" }}>
            Sales
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
            Point of sale and transaction history
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex overflow-x-auto hide-scrollbar rounded-xl p-1 gap-1"
          style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          {availableTabs.map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize"
              style={{
                backgroundColor: tab === t ? "var(--color-primary)" : "transparent",
                color: tab === t ? "white" : "var(--color-muted)",
              }}>
              {t === "pos" ? "New Sale" : "History"}
            </button>
          ))}
        </div>
      </div>

      {!canMakeSales && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Staff sales access is disabled for this shop. You can review sales history, but only admins can process sales actions.
        </div>
      )}

      {/* ── POS Tab ── */}
      {tab === "pos" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Product search + grid */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4"
                  style={{ color: "var(--color-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search products by name or SKU..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm outline-none"
                  style={inputStyle}
                />
              </div>
              <button onClick={() => setShowCustomItem(true)}
                disabled={!isPro}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors border shrink-0
                  ${isPro ? "bg-gray-100 hover:bg-accent text-gray-800 border-gray-200" 
                          : "bg-gray-100 text-gray-400 border-gray-200 opacity-50 cursor-not-allowed hidden sm:block"}`}>
                + Custom Item {!isPro && '🔒'}
              </button>
            </div>

            <BarcodeScannerNotice
              title="Use the barcode scanner on New Sale"
              description="Scan while your cursor is not inside any input box. If the scanned code matches a product SKU, Giztrack adds the item to the cart automatically. If the item is not already visible, Giztrack searches for it first."
            />

            {/* Product grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {products.map((product) => {
                const inCart = cart.find((i) => !i.is_custom && i.product?.id === product.id);
                const outOfStock = product.quantity === 0;
                return (
                  <button key={product.id} onClick={() => addToCart(product)}
                    disabled={outOfStock}
                    className="text-left p-4 rounded-xl transition-all relative"
                    style={{
                      backgroundColor: "var(--color-surface)",
                      border: `1px solid ${inCart ? "var(--color-accent)" : "var(--color-secondary)"}`,
                      opacity: outOfStock ? 0.5 : 1,
                      cursor: outOfStock ? "not-allowed" : "pointer",
                    }}>
                    {inCart && (
                      <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary z-10 box-content
                        text-white text-xs flex items-center justify-center font-bold">
                        {inCart.quantity}
                      </span>
                    )}
                    {product.image && (
                      <div className="w-full h-24 mb-2 rounded border bg-gray-50 flex items-center justify-center overflow-hidden"
                           style={{ borderColor: "var(--color-border)" }}>
                        <img
                          src={resolveAssetUrl(product.image) || undefined}
                          alt={product.name}
                          className="max-w-full max-h-full object-contain"
                          loading="lazy"
                          decoding="async"
                        />
                      </div>
                    )}
                    <p className="text-sm font-medium leading-tight" style={{ color: "var(--color-text)" }}>
                      {product.name}
                    </p>
                    {product.brand && (
                      <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                        {product.brand}
                      </p>
                    )}
                    <p className="text-sm font-bold mt-2 text-primary">
                      {fmt(product.selling_price)}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: product.is_low_stock ? "#dc2626" : "var(--color-muted)" }}>
                      {outOfStock ? "Out of stock" : `${product.quantity} in stock`}
                    </p>
                  </button>
                );
              })}

              {products.length === 0 && (
                <div className="col-span-3 flex items-center justify-center h-32 rounded-xl"
                  style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                  <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                    {search ? "No products found" : "No products in inventory"}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Cart */}
          <div className="rounded-2xl flex flex-col border border-app bg-surface lg:sticky lg:top-[80px] lg:h-[calc(100vh-120px)] min-h-0 overflow-hidden">

            {/* ── Cart header (always visible) ── */}
            <div className="px-5 py-4 border-b shrink-0 flex items-center justify-between"
              style={{ borderColor: "var(--color-border)" }}>
              <h2 className="font-display font-bold text-base" style={{ color: "var(--color-text)" }}>
                Cart
              </h2>
              {cart.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-full font-bold"
                    style={{ backgroundColor: "var(--color-primary)", color: "white" }}>
                    {cart.length} item{cart.length > 1 ? "s" : ""}
                  </span>
                  <button onClick={() => setCart([])}
                    className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors hover:bg-red-100"
                    style={{ color: "#dc2626", border: "1px solid #fecaca" }}>
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* ── Scrollable body: items + all form fields ── */}
            <div className="flex-1 lg:overflow-y-auto touch-scroll">

              {/* Cart items */}
              <div className="px-4 py-3 space-y-2">
                {cart.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ backgroundColor: "var(--color-bg)" }}>
                      <svg className="w-8 h-8" style={{ color: "var(--color-muted)" }}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                    </div>
                    <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>Cart is empty</p>
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>Click a product to add it</p>
                  </div>
                ) : (
                  cart.map((item, index) => (
                    <div key={index} className="rounded-xl p-3 space-y-2"
                      style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                      {/* Row 1: name + delete */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-snug" style={{ color: "var(--color-text)" }}>
                            {item.product_name}
                          </p>
                          {item.is_custom && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-200 font-semibold">
                              Custom Item
                            </span>
                          )}
                        </div>
                        <button onClick={() => removeFromCart(index)}
                          className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-100"
                          style={{ color: "#dc2626" }}>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      {/* Row 2: qty + subtotal */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button onClick={() => updateQty(index, item.quantity - 1)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-bold"
                            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-bold" style={{ color: "var(--color-text)" }}>
                            {item.quantity}
                          </span>
                          <button onClick={() => updateQty(index, item.quantity + 1)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-base font-bold"
                            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
                            +
                          </button>
                        </div>
                        <p className="font-display font-bold text-base" style={{ color: "var(--color-primary)" }}>
                          {fmt(item.unit_price * item.quantity)}
                        </p>
                      </div>
                      {/* Row 3: editable price */}
                      <div className="flex items-center gap-2 pt-1 border-t" style={{ borderColor: "var(--color-border)" }}>
                        <span className="text-xs font-medium shrink-0" style={{ color: "var(--color-muted)" }}>Price (₦)</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updatePrice(index, e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg text-sm font-semibold outline-none"
                          style={inputStyle}
                        />
                        {!item.is_custom && item.product && item.unit_price !== parseFloat(item.product.selling_price) && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200 shrink-0 font-semibold">
                            Custom
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* ── Checkout fields ── */}
              <div className="px-4 pb-4 pt-3 space-y-2 border-t" style={{ borderColor: "var(--color-border)" }}>
                {/* Totals card */}
                {cart.length > 0 && (
                  <div className="rounded-xl px-4 py-3 space-y-1.5"
                    style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}>
                    <div className="flex justify-between text-sm" style={{ color: "var(--color-text)" }}>
                      <span>Subtotal</span><span>{fmt(cartSubtotal)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-sm text-red-500">
                        <span>Discount</span><span>−{fmt(discount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs" style={{ color: "var(--color-muted)" }}>
                      <span>Net Profit</span>
                      <span className="text-green-600 font-semibold">{fmt(finalProfit)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t pt-1.5"
                      style={{ color: "var(--color-text)", borderColor: "var(--color-border)" }}>
                      <span>Total</span>
                      <span style={{ color: "var(--color-primary)" }}>{fmt(cartTotal)}</span>
                    </div>
                  </div>
                )}

                <CustomerLookup
                  selectedCustomer={selectedCustomer}
                  onSelect={handleCustomerSelect}
                  onClear={() => setSelectedCustomer(null)}
                  inputStyle={inputStyle}
                  helperText="Select an existing customer first, especially for repeat credit buyers."
                />

                <input value={customerPhone} onChange={(e) => handleCustomerPhoneChange(e.target.value)}
                  placeholder="Customer phone (e.g. +234901234567)"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />

                {customerPhone && (
                  <input value={customerName} onChange={(e) => handleCustomerNameChange(e.target.value)}
                    placeholder="Customer name"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
                )}

                <div className="relative">
                  <input value={discountAmount} disabled={!isPro}
                    onChange={(e) => setDiscountAmount(e.target.value)}
                    placeholder="Discount (₦)" type="number" min="0" step="0.01"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    style={inputStyle} />
                  {!isPro && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200">
                      PRO 🔒
                    </div>
                  )}
                </div>

                {/* Credit sale toggle */}
                <div className="flex items-center justify-between px-4 py-3 rounded-xl" style={inputStyle}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>Credit Sale</p>
                    <p className="text-xs" style={{ color: "var(--color-muted)" }}>Customer pays later</p>
                  </div>
                  <button type="button"
                    onClick={() => { setIsCredit(!isCredit); setAmountPaid(""); }}
                    className="relative w-11 h-6 rounded-full transition-colors duration-300 shrink-0"
                    style={{ backgroundColor: isCredit ? "var(--color-primary)" : "var(--color-border)" }}>
                    <span className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300"
                      style={{ left: isCredit ? "calc(100% - 20px)" : "4px" }} />
                  </button>
                </div>

                {isCredit && (
                  <div className="rounded-xl p-3 space-y-2"
                    style={{ backgroundColor: "#fffbeb", border: "1px solid #fcd34d" }}>
                    <p className="text-xs font-semibold" style={{ color: "#92400e" }}>Amount paid now (₦)</p>
                    <input value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)}
                      placeholder="0 — if fully on credit"
                      type="number" min="0" step="0.01"
                      className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
                      style={{ backgroundColor: "white", border: "1px solid #fcd34d", color: "#1c1c1c" }} />
                    {cartTotal > 0 && (
                      <div className="flex justify-between text-sm font-bold" style={{ color: "#b45309" }}>
                        <span>Balance owed:</span>
                        <span>{fmt(Math.max(0, cartTotal - (parseFloat(amountPaid) || 0)))}</span>
                      </div>
                    )}
                  </div>
                )}

                <input value={note} onChange={(e) => setNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
              </div>
            </div>

            {/* ── Complete Sale — always pinned at bottom ── */}
            <div className="px-4 py-4 border-t shrink-0"
              style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}>
              <button onClick={handleCheckout} disabled={cart.length === 0 || submitting}
                className="w-full py-3.5 rounded-xl text-sm font-bold text-white transition-all"
                style={{
                  background: cart.length === 0 ? "var(--color-border)"
                    : "linear-gradient(135deg, var(--color-primary))",
                  cursor: cart.length === 0 || submitting ? "not-allowed" : "pointer",
                  opacity: cart.length === 0 ? 0.6 : 1,
                }}>
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Processing...
                  </span>
                ) : cart.length === 0 ? "Add items to cart" : `Complete Sale • ${fmt(cartTotal)}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── History Tab ── */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* Date filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm shrink-0" style={{ color: "var(--color-muted)" }}>From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
            </div>
            <div className="flex items-center gap-2 flex-1">
              <label className="text-sm shrink-0" style={{ color: "var(--color-muted)" }}>To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 px-4 py-2.5 rounded-xl text-sm outline-none" style={inputStyle} />
            </div>
          </div>

          {/* Sales table */}
          <div className="rounded-2xl overflow-hidden"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
            {historyLoading ? (
              <div className="flex items-center justify-center h-48">
                <svg className="animate-spin w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              </div>
            ) : sales.length === 0 ? (
              <div className="flex items-center justify-center h-48">
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>No sales found</p>
              </div>
            ) : (
              <>
                <div className="divide-y md:hidden" style={{ borderColor: "var(--color-border)" }}>
                  {sales.map((sale) => (
                    <div key={sale.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
                              Sale #{sale.id}
                            </p>
                            {sale.is_credit && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200">
                                CREDIT
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                            {new Date(sale.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-primary">{fmt(sale.total_amount)}</p>
                          {hasOutstandingBalance(sale) && (
                            <p className="text-[11px] text-red-500 font-medium mt-0.5">
                              Bal: {fmt(sale.balance_owed)}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                            Customer
                          </p>
                          <p className="mt-1 font-medium break-words" style={{ color: "var(--color-text)" }}>
                            {sale.customer_name}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                            Staff
                          </p>
                          <p className="mt-1 font-medium break-words" style={{ color: "var(--color-text)" }}>
                            {sale.staff_name}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                            Items
                          </p>
                          <p className="mt-1 font-medium" style={{ color: "var(--color-text)" }}>
                            {sale.items.length} item(s)
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--color-muted)" }}>
                            Profit
                          </p>
                          <p className="mt-1 font-medium text-green-600">
                            {fmt(sale.total_profit)}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => setSelectedSale(sale)}
                          className="text-xs px-3 py-2 rounded-lg font-medium text-primary"
                          style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
                          View
                        </button>
                        {canMakeSales && hasOutstandingBalance(sale) && (
                          <button
                            onClick={() => openCollectPayment(sale)}
                            className="text-xs px-3 py-2 rounded-lg font-medium text-amber-800"
                            style={{ backgroundColor: "#fef3c7", border: "1px solid #fcd34d" }}
                          >
                            Collect
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
                        {["Sale #", "Customer", "Items", "Total", "Profit", "Staff", "Date", ""].map((h) => (
                          <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide"
                            style={{ color: "var(--color-muted)" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((sale, i) => (
                        <tr key={sale.id}
                          style={{ borderBottom: i < sales.length - 1 ? "1px solid var(--color-border)" : "none" }}>
                          <td className="px-5 py-4 text-sm font-medium" style={{ color: "var(--color-text)" }}>
                            <div className="flex items-center gap-2">
                              #{sale.id}
                              {sale.is_credit && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 border border-amber-200">
                                  CREDIT
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-5 py-4 text-sm" style={{ color: "var(--color-text)" }}>
                            {sale.customer_name}
                          </td>
                          <td className="px-5 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
                            {sale.items.length} item(s)
                          </td>
                          <td className="px-5 py-4 text-sm">
                            <p className="font-semibold text-primary">{fmt(sale.total_amount)}</p>
                            {hasOutstandingBalance(sale) && (
                              <p className="text-[11px] text-red-500 font-medium mt-0.5">
                                Bal: {fmt(sale.balance_owed)}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-4 text-sm font-medium text-green-600">
                            {fmt(sale.total_profit)}
                          </td>
                          <td className="px-5 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
                            {sale.staff_name}
                          </td>
                          <td className="px-5 py-4 text-sm" style={{ color: "var(--color-muted)" }}>
                            {new Date(sale.created_at).toLocaleDateString()}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <button onClick={() => setSelectedSale(sale)}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-primary"
                                style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
                                View
                              </button>
                              {canMakeSales && hasOutstandingBalance(sale) && (
                                <button
                                  onClick={() => openCollectPayment(sale)}
                                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-amber-800"
                                  style={{ backgroundColor: "#fef3c7", border: "1px solid #fcd34d" }}
                                >
                                  Collect
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
            onChange={setPage}
            pageSize={20}
          />
        </div>
      )}
      </div>

      {/* Custom Item Modal */}
      {showCustomItem && (
        <Modal title="Add Custom Item" onClose={() => setShowCustomItem(false)}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
                Item Name
              </label>
              <input
                value={customItem.name}
                onChange={(e) => setCustomItem({ ...customItem, name: e.target.value })}
                placeholder="e.g. Screen repair fee"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
                Price (₦)
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={customItem.price}
                onChange={(e) => setCustomItem({ ...customItem, price: e.target.value })}
                placeholder="0.00"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
            </div>
            <button
              onClick={addCustomToCart}
              disabled={!customItem.name.trim() || !customItem.price}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: "var(--color-primary)" }}>
              Add to Cart
            </button>
          </div>
        </Modal>
      )}

      {/* Receipt modal after sale */}
      {receipt && (
        <Receipt
          sale={receipt}
          onClose={() => setReceipt(null)}
          onCollectPayment={canMakeSales ? (sale) => {
            setReceipt(null);
            openCollectPayment(sale);
          } : undefined}
        />
      )}

      {/* View sale detail modal */}
      {selectedSale && (
        <Receipt 
          sale={selectedSale} 
          onClose={() => setSelectedSale(null)} 
          onCollectPayment={canMakeSales ? (sale) => {
            setSelectedSale(null);
            openCollectPayment(sale);
          } : undefined}
          onReturnItem={canMakeSales ? (item) => {
            setReturningItem({ sale: selectedSale, item });
            setReturnQuantity("1");
            setReturnRestock(true);
          } : undefined}
        />
      )}

      {collectingPayment && (
        <Modal title="Collect Credit Payment" onClose={() => !paymentSubmitting && setCollectingPayment(null)}>
          <div className="space-y-4">
            <div className="rounded-xl p-4" style={{ backgroundColor: "#fffbeb", border: "1px solid #fcd34d" }}>
              <p className="text-sm font-semibold" style={{ color: "#92400e" }}>
                {collectingPayment.customer_name || "Walk-in Customer"}
              </p>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span style={{ color: "#92400e" }}>Sale #{collectingPayment.id}</span>
                <span className="font-bold text-red-600">
                  Balance: {fmt(collectingPayment.balance_owed)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
                Amount received (₦)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-text)" }}>
                Note (optional)
              </label>
              <input
                value={paymentNote}
                onChange={(e) => setPaymentNote(e.target.value)}
                placeholder="e.g. Customer paid transfer today"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
            </div>

            {paymentAmount && (
              <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
                Remaining balance after payment:{" "}
                <span className="font-bold text-primary">
                  {fmt(Math.max(0, getBalanceOwed(collectingPayment) - (Number.parseFloat(paymentAmount) || 0)))}
                </span>
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCollectingPayment(null)}
                disabled={paymentSubmitting}
                className="flex-1 py-2.5 rounded-xl font-semibold transition-colors bg-gray-100 text-gray-800 border border-gray-200 hover:bg-gray-200 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={paymentSubmitting}
                className="flex-1 py-2.5 rounded-xl font-semibold text-white bg-accent hover:bg-primary disabled:opacity-60"
              >
                {paymentSubmitting ? "Saving..." : "Record Payment"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Return Item Confirmation Modal */}
      {returningItem && (
        <Modal title="Return Item" onClose={() => setReturningItem(null)}>
          <div className="space-y-4">
            <div
              className="p-4 rounded-2xl mb-2"
              style={{
                backgroundColor: "color-mix(in srgb, #dc2626 12%, var(--color-surface))",
                border: "1px solid color-mix(in srgb, #dc2626 28%, var(--color-border))",
              }}
            >
              <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                Returning: {returningItem.item.product_name}
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                Refunding {fmt(returningItem.item.unit_price)} per item.
              </p>
              {parsedReturnQuantity > 0 && (
                <div
                  className="mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-sm"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--color-surface) 82%, transparent)",
                    border: "1px solid var(--color-border)",
                  }}
                >
                  <span style={{ color: "var(--color-muted)" }}>Estimated refund</span>
                  <span className="font-bold" style={{ color: "#dc2626" }}>
                    {fmt(returnRefundAmount)}
                  </span>
                </div>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-muted)" }}>
                Quantity to Return
              </label>
              <input
                type="number"
                min="1"
                max={maxReturnableQuantity}
                value={returnQuantity}
                onChange={(e) => setReturnQuantity(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                style={inputStyle}
              />
              <p className="text-[11px] mt-1" style={{ color: "var(--color-muted)" }}>
                Max available to return: {maxReturnableQuantity}
              </p>
            </div>

            {/* Only show restock option for physical products */}
            {!returningItem.item.is_custom && (
              <label
                className="flex items-start gap-3 mt-4 p-3 rounded-2xl cursor-pointer transition-colors"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                }}
              >
                <input
                  type="checkbox"
                  checked={returnRestock}
                  onChange={(e) => setReturnRestock(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded"
                  style={{ accentColor: "var(--color-primary)" }}
                />
                <div className="flex-1">
                  <p className="text-sm font-semibold" style={{ color: "var(--color-text)" }}>
                    Restock Item
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                    Add the returned quantity back into your inventory.
                  </p>
                </div>
              </label>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setReturningItem(null)}
                disabled={returnSubmitting}
                className="flex-1 py-3 rounded-xl font-semibold transition-colors disabled:opacity-60"
                style={{
                  backgroundColor: "var(--color-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--color-text)",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleReturnItem}
                disabled={
                  returnSubmitting ||
                  !returnQuantity ||
                  parsedReturnQuantity < 1 ||
                  parsedReturnQuantity > maxReturnableQuantity
                }
                className="flex-1 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                style={{ background: "#dc2626" }}
              >
                {returnSubmitting ? "Processing..." : "Confirm Return"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
