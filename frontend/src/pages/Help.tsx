import { useState } from "react";
import { Link } from "react-router-dom";
import {
  SUPPORT_EMAIL,
  SUPPORT_EMAIL_LINK,
  SUPPORT_PHONE,
  SUPPORT_PHONE_LINK,
} from "../config/site";

export default function Help() {
  const [activeTab, setActiveTab] = useState("inventory");

  const tabs = [
    { id: "inventory", label: "Inventory & Tracking" },
    { id: "procurement", label: "Procurement & Suppliers" },
    { id: "sales", label: "Sales (POS)" },
    { id: "repairs", label: "Repairs" },
    { id: "general", label: "General & Admin" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6 lg:space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold" style={{ color: "var(--color-text)" }}>
          Help & Instructions
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>
          Guidance on how to use Giztrack properly for inventory control, sales, repairs, reporting, and day-to-day shop administration in Nigeria.
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Sidebar Nav for Help */}
        <div className="w-full md:w-64 shrink-0">
          <div className="flex md:flex-col overflow-x-auto hide-scrollbar sm:gap-1 p-1 md:p-0 rounded-xl md:rounded-none md:bg-transparent bg-surface md:border-0 border"
            style={{ backgroundColor: "var(--color-surface)", borderColor: "var(--color-border)" }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2.5 md:py-3 text-sm font-medium rounded-lg text-left transition-all whitespace-nowrap md:whitespace-normal
                  ${activeTab === tab.id ? "bg-primary text-white shadow" : "hover:bg-primary/5"}`}
                style={activeTab !== tab.id ? { color: "var(--color-text)" } : {}}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 rounded-2xl p-6 md:p-8" style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
          {activeTab === "inventory" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: "var(--color-primary)" }}>Inventory Management</h2>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Adding Products</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Select <strong>Add Product</strong> on the Inventory page to register a new item for sale. Enter the product name, category, selling price, cost price, SKU where available, and the opening quantity in stock. You may also upload a product image for easier identification by your staff.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Adjusting Stock</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Use the stock adjustment controls on each product row to record goods received, stock losses, breakages, or other quantity changes. Every adjustment is logged automatically so you can track who updated the quantity and why the stock level changed.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Stock History</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Open the <strong>History</strong> view for any product to review previous stock movements. This is useful for internal control, reconciliation, and verifying whether stock was added, sold, removed, or damaged.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Serialized Tracking (IMEI / Serial Numbers)</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Giztrack supports tracking individual units (e.g., phones, laptops) using their exact IMEI or serial number. Switch to the <strong>Tracked Units</strong> view to add or manage these individual items. Serialized items allow you to track the exact supplier it was purchased from, the customer it was sold to, and the warranty status of that specific device.
                </p>
              </div>
            </div>
          )}

          {activeTab === "procurement" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: "var(--color-primary)" }}>Procurement & Suppliers</h2>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Managing Suppliers</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Keep track of all the vendors and wholesalers you do business with. From the Procurement page, select the <strong>Suppliers</strong> tab to add new suppliers, including their contact information and payment terms. This helps you track exactly who provides your stock.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Creating Purchase Orders</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Switch to the <strong>Purchase Orders</strong> tab to create new orders. You can select a supplier and add multiple products to the order, specifying the quantity ordered and the agreed-upon unit cost. This creates a formal record of your planned stock purchases.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Receiving Items</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  When the ordered items arrive at your shop, click <strong>Receive Items</strong> on the corresponding Purchase Order. You can enter the quantity received to automatically update your general inventory stock levels. If the items are tracked by serial number (like phones), you can enter the list of IMEIs directly during receiving, and the system will register each unique device into your Tracked Units inventory automatically linked to the supplier!
                </p>
              </div>
            </div>
          )}

          {activeTab === "sales" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: "var(--color-primary)" }}>Sales and Point of Sale</h2>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Recording a Sale</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Open the <strong>Sales</strong> page and search for items by name, SKU, or barcode. Add the required products to the cart, confirm the quantity, and complete checkout. If you are selling an IMEI-tracked item, the system will prompt you to select the exact serial number being sold to ensure it is correctly marked as sold and removed from inventory.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Credit Sales and Customer Balances</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  If a customer is buying on credit, enable the <strong>Credit Sale</strong> option during checkout and enter the amount paid immediately, if any. Giztrack will record the outstanding balance and keep the debt under that customer profile for later follow-up and payment collection.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Receipts, History, and Returns</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Use the sales history section to review previous transactions, print receipts again, and process returns where applicable. Approved returns update inventory automatically so that the returned item quantity is added back into stock.
                </p>
              </div>
            </div>
          )}

          {activeTab === "repairs" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: "var(--color-primary)" }}>Repair Job Management</h2>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Booking in Customer Devices</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Select <strong>New Repair</strong> to register a customer device or item for service. Enter the customer details, device type, model, reported fault, estimated repair cost, and any upfront payment collected. You may also attach an image of the device condition at drop-off.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Updating Repair Status</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Open the repair ticket and update the status as work progresses. This helps your team know whether a job has been received, is under repair, is waiting for parts, is ready for pickup, or has been completed and delivered.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Adding Replacement Parts</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Where replacement parts are used, add them directly from your inventory to the repair ticket. This helps you keep correct stock records and include the part cost in the final amount to be paid by the customer.
                </p>
              </div>
            </div>
          )}

          {activeTab === "general" && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold mb-4" style={{ color: "var(--color-primary)" }}>General Administration</h2>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Users and Access Control</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Shop Administrators can manage users from <strong>Settings</strong>. Staff accounts may be created for sales attendants, storekeepers, or technicians, while access remains controlled according to the role assigned to each user.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Reports, Billing, and Records</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  Use the Reports section to review sales performance, customer debts, payments received, and other business records available on your plan. Subscription payments and renewals should be managed from the Billing page to keep the account active after the free trial period.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Recommended Business Practice</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  To maintain clean records, use the same customer profile whenever a returning customer buys on credit, pays an outstanding balance, or brings in another device for repair. This will help your shop keep a complete history of purchases, debts, and repair jobs under one customer record.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Barcode Scanner Usage</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                  The barcode scanner works on the <strong>Inventory</strong> page and the <strong>New Sale</strong> page. It is designed for a USB or Bluetooth barcode scanner that types very quickly like a keyboard. For the scanner to work correctly, save the barcode value in the product <strong>SKU</strong> field and scan only when your cursor is not inside an input box.
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-lg" style={{ color: "var(--color-text)" }}>Further Enquiries and Feedback</h3>
                <div
                  className="rounded-2xl p-4 sm:p-5 space-y-3"
                  style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}
                >
                  <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                    For account support, product enquiries, technical assistance, or feedback, please send an email to{" "}
                    <a href={SUPPORT_EMAIL_LINK} className="font-semibold hover:underline" style={{ color: "var(--color-primary)" }}>
                      {SUPPORT_EMAIL}
                    </a>
                    . Please include your shop name, registered email address, and a short description of the issue so that we can assist you more quickly.
                  </p>

                  {SUPPORT_PHONE && SUPPORT_PHONE_LINK ? (
                    <p className="text-sm leading-relaxed" style={{ color: "var(--color-muted)" }}>
                      You may also call{" "}
                      <a href={SUPPORT_PHONE_LINK} className="font-semibold hover:underline" style={{ color: "var(--color-primary)" }}>
                        {SUPPORT_PHONE}
                      </a>
                      {" "}during support hours for urgent assistance.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-3 text-sm">
                    <Link to="/terms" className="font-semibold hover:underline" style={{ color: "var(--color-primary)" }}>
                      Terms of Service
                    </Link>
                    <Link
                      to="/privacy-policy"
                      className="font-semibold hover:underline"
                      style={{ color: "var(--color-primary)" }}
                    >
                      Privacy Policy
                    </Link>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
