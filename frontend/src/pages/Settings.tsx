import { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useToast } from "../context/ToastContext";
import api from "../api/axios";
import { parseApiErrors, getApiErrorMessage, getPrimaryErrorMessage } from "../utils/http";
import ConfirmModal from "../components/ConfirmModal";
import { PasswordInput } from "../components/PasswordInput";

// ── Helpers ───────────────────────────────────────────────────────────────────
const inputStyle = {
  backgroundColor: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text)",
};

function Field({ label, hint, error, children }: {
  label: string; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs mt-1.5 text-red-500 font-medium">{error}</p>
      ) : hint ? (
        <p className="text-xs mt-1.5" style={{ color: "var(--color-muted)" }}>{hint}</p>
      ) : null}
    </div>
  );
}

function Input({ name, value, onChange, type = "text", placeholder, disabled, hasError }: {
  name: string; value: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string; placeholder?: string; disabled?: boolean; hasError?: boolean;
}) {
  return (
    <input
      name={name} value={value} onChange={onChange}
      type={type} placeholder={placeholder} disabled={disabled}
      className={`w-full px-4 py-2.5 rounded-xl text-sm outline-none disabled:opacity-50 transition-colors ${
        hasError ? "border-red-500 focus:border-red-500" : ""
      }`}
      style={{
        ...inputStyle,
        borderColor: hasError ? "var(--color-danger, #ef4444)" : "var(--color-border)",
      }}
      onFocus={(e) => !disabled && (e.target.style.borderColor = hasError ? "var(--color-danger, #ef4444)" : "var(--color-primary)")}
      onBlur={(e) => (e.target.style.borderColor = hasError ? "var(--color-danger, #ef4444)" : "var(--color-border)")}
    />
  );
}

function Card({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
      <div className="px-6 py-5 border-b" style={{ borderColor: "var(--color-border)" }}>
        <h2 className="font-display font-bold text-base" style={{ color: "var(--color-text)" }}>
          {title}
        </h2>
        {description && (
          <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>{description}</p>
        )}
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function SaveButton({ onClick, saving, saved }: {
  onClick: () => void; saving: boolean; saved: boolean;
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button onClick={onClick} disabled={saving}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
        style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-primary))" }}>
        {saving ? "Saving..." : "Save Changes"}
      </button>
      {saved && (
        <span className="text-sm font-medium text-green-600 flex items-center gap-1.5">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Saved
        </span>
      )}
    </div>
  );
}

// ── Staff Row ─────────────────────────────────────────────────────────────────
interface StaffMember {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: string;
  is_active: boolean;
}

function StaffRow({ staff, onDeactivate, onResetPassword }: {
  staff: StaffMember;
  onDeactivate: (id: number) => void;
  onResetPassword: (id: number, name: string) => void;
}) {
  const roleColors: Record<string, { bg: string; text: string }> = {
    admin:      { bg: "#eff6ff", text: "var(--color-primary)" },
    staff:      { bg: "#f0fdf4", text: "#16a34a" },
    technician: { bg: "#fef9c3", text: "#854d0e" },
  };
  const cfg = roleColors[staff.role] || { bg: "#f1f5f9", text: "#475569" };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0 py-3 border-b last:border-0"
      style={{ borderColor: "var(--color-border)" }}>
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center
          text-white text-xs font-bold shrink-0">
          {staff.first_name?.[0]}{staff.last_name?.[0]}
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>
            {staff.first_name} {staff.last_name}
          </p>
          <p className="text-xs break-all sm:break-normal" style={{ color: "var(--color-muted)" }}>{staff.email}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0">
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
          style={{ backgroundColor: cfg.bg, color: cfg.text }}>
          {staff.role}
        </span>
        {staff.is_active && staff.role !== "admin" && (
          <>
            <button onClick={() => onResetPassword(staff.id, `${staff.first_name} ${staff.last_name}`)}
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium transition-colors"
              style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-text)" }}>
              Reset PW
            </button>
            <button onClick={() => onDeactivate(staff.id)}
              className="text-xs px-2.5 py-1.5 rounded-lg font-medium text-red-600 transition-colors"
              style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca" }}>
              Remove
            </button>
          </>
        )}
        {!staff.is_active && (
          <span className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ backgroundColor: "var(--color-bg)", color: "var(--color-muted)" }}>
            Inactive
          </span>
        )}
      </div>
    </div>
  );
}

interface BackupPreviewDataset {
  key: string;
  label: string;
  file_name: string;
  headers: string[];
  row_count: number;
  preview_rows: Record<string, string>[];
}

interface BackupPreviewResponse {
  message: string;
  filename: string;
  shop_name: string;
  generated_at: string;
  confirmation_phrase: string;
  missing_optional_files: string[];
  totals: Record<string, number>;
  datasets: BackupPreviewDataset[];
}

const normalizeRestoreConfirmation = (value: string) =>
  value.trim().replace(/\s+/g, " ").toUpperCase();

// ── Main Component ─────────────────────────────────────────────────────────────
export default function Settings() {
  const { user, isPro, setCurrentUser } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { success, error } = useToast();
  const isAdmin = user?.role === "admin";

  const [activeTab, setActiveTab] = useState("profile");

  const tabs = [
    { id: "profile", label: "Profile" },
    { id: "security", label: "Security" },
  ];
  if (isAdmin) {
    tabs.push({ id: "shop", label: "Shop Details" });
    tabs.push({ id: "team", label: "Team" });
    tabs.push({ id: "advanced", label: "Advanced" });
  }

  // Profile
  const [profile, setProfile] = useState({
    first_name: user?.first_name || "",
    last_name: user?.last_name || "",
    email: user?.email || "",
    phone: user?.phone || "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});

  // Password
  const [passwords, setPasswords] = useState({
    old_password: "", new_password: "", confirm_password: "",
  });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

  // Shop
  const [shop, setShop] = useState({
    name: "", address: "", phone: "", email: "", description: "",
    enable_sms_notifications: false,
    allow_staff_inventory_management: false,
    allow_staff_sales: true,
  });
  const [shopSaving, setShopSaving] = useState(false);
  const [shopSaved, setShopSaved] = useState(false);
  const [shopErrors, setShopErrors] = useState<Record<string, string>>({});

  // Staff
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", password: "", role: "staff",
  });
  const [staffErrors, setStaffErrors] = useState<Record<string, string>>({});
  const [staffSaving, setStaffSaving] = useState(false);
  const [deactivateConfirmId, setDeactivateConfirmId] = useState<number | null>(null);
  const [backupPreviewFile, setBackupPreviewFile] = useState<File | null>(null);
  const [backupPreviewLoading, setBackupPreviewLoading] = useState(false);
  const [backupPreview, setBackupPreview] = useState<BackupPreviewResponse | null>(null);
  const [backupRestoreConfirmation, setBackupRestoreConfirmation] = useState("");
  const [backupRestoreLoading, setBackupRestoreLoading] = useState(false);
  const [backupFileInputKey, setBackupFileInputKey] = useState(0);

  // Reset Password for staff
  const [resetPasswordId, setResetPasswordId] = useState<number | null>(null);
  const [resetPasswordName, setResetPasswordName] = useState("");
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetPasswordErrors, setResetPasswordErrors] = useState<Record<string, string>>({});
  const [resetPasswordSaving, setResetPasswordSaving] = useState(false);

  useEffect(() => {
    setProfile({
      first_name: user?.first_name || "",
      last_name: user?.last_name || "",
      email: user?.email || "",
      phone: user?.phone || "",
    });
  }, [user]);

  // Load shop info + staff
  useEffect(() => {
    api.get("/shops/")
      .then(({ data }) => setShop({
        name: data.name || "",
        address: data.address || "",
        phone: data.phone || "",
        email: data.email || "",
        description: data.description || "",
        enable_sms_notifications: data.enable_sms_notifications || false,
        allow_staff_inventory_management: data.allow_staff_inventory_management || false,
        allow_staff_sales: data.allow_staff_sales !== false,
      }))
      .catch(() => {});

    if (isAdmin) {
      api.get("/auth/staff/")
        .then(({ data }) => setStaff(data.results || data))
        .catch(() => {});
    }
  }, []);

  // Save profile
  const handleSaveProfile = async () => {
    setProfileErrors({});

    // Client-side validation for required fields
    const clientErrors: Record<string, string> = {};
    if (!profile.first_name.trim()) clientErrors.first_name = "First name is required.";
    if (!profile.last_name.trim()) clientErrors.last_name = "Last name is required.";
    if (Object.keys(clientErrors).length > 0) {
      setProfileErrors(clientErrors);
      return;
    }

    setProfileSaving(true);
    try {
      const payload: Record<string, string> = {
        first_name: profile.first_name.trim(),
        last_name: profile.last_name.trim(),
      };
      // Only include phone if user has entered something
      if (profile.phone.trim()) payload.phone = profile.phone.trim();

      const { data } = await api.patch("/auth/me/", payload);
      setCurrentUser(data);
      setProfileSaved(true);
      success("Profile updated successfully!");
      setTimeout(() => setProfileSaved(false), 3000);
    } catch (err: unknown) {
      const parsed = parseApiErrors(err, "Failed to update profile.");
      setProfileErrors(parsed.fieldErrors);
      error(getPrimaryErrorMessage(parsed, "Failed to update profile."));
    } finally {
      setProfileSaving(false);
    }
  };

  // Save password
  const handleSavePassword = async () => {
    setPwErrors({});
    if (passwords.new_password !== passwords.confirm_password) {
      setPwErrors({ confirm_password: "Passwords do not match." });
      return;
    }
    if (passwords.new_password.length < 8) {
      setPwErrors({ new_password: "Password must be at least 8 characters." });
      return;
    }
    setPwSaving(true);
    try {
      await api.post("/auth/change-password/", {
        old_password: passwords.old_password,
        new_password: passwords.new_password,
        confirm_new_password: passwords.confirm_password,
      });
      setPasswords({ old_password: "", new_password: "", confirm_password: "" });
      setPwSaved(true);
      success("Password changed successfully!");
      setTimeout(() => setPwSaved(false), 3000);
    } catch (err: unknown) {
      const parsed = parseApiErrors(err, "Failed to change password.");
      setPwErrors(parsed.fieldErrors);
      error(getPrimaryErrorMessage(parsed, "Failed to change password."));
    } finally {
      setPwSaving(false);
    }
  };

  // Save shop
  const handleSaveShop = async () => {
    setShopErrors({});
    const clientErrors: Record<string, string> = {};
    if (!shop.name.trim()) clientErrors.name = "Shop name is required.";
    const phoneRegex = /^(\+\d{1,3}\s?)?\d{10,11}$/;
    if (shop.phone && !phoneRegex.test(shop.phone)) {
      clientErrors.phone = "Shop phone must be exactly 10 or 11 digits (with optional country code, e.g., +234)";
    }
    if (Object.keys(clientErrors).length > 0) {
      setShopErrors(clientErrors);
      return;
    }
    setShopSaving(true);
    try {
      await api.put("/shops/", shop);
      setShopSaved(true);
      success("Shop information updated!");
      setTimeout(() => setShopSaved(false), 3000);
    } catch (err: unknown) {
      const parsed = parseApiErrors(err, "Failed to update shop.");
      setShopErrors(parsed.fieldErrors);
      error(getPrimaryErrorMessage(parsed, "Failed to update shop."));
    } finally {
      setShopSaving(false);
    }
  };

  // Add staff
  const handleAddStaff = async () => {
    setStaffErrors({});
    const clientErrors: Record<string, string> = {};
    if (!staffForm.first_name.trim()) clientErrors.first_name = "First name is required.";
    if (!staffForm.last_name.trim()) clientErrors.last_name = "Last name is required.";
    if (!staffForm.email.trim()) clientErrors.email = "Email address is required.";
    if (!staffForm.password.trim()) clientErrors.password = "Temporary password is required.";
    else if (staffForm.password.length < 8) clientErrors.password = "Password must be at least 8 characters.";
    const phoneRegex = /^(\+\d{1,3}\s?)?\d{10,11}$/;
    if (staffForm.phone && !phoneRegex.test(staffForm.phone)) {
      clientErrors.phone = "Phone must be exactly 10 or 11 digits (with optional country code, e.g., +234)";
    }
    if (Object.keys(clientErrors).length > 0) {
      setStaffErrors(clientErrors);
      return;
    }
    setStaffSaving(true);
    try {
      const { data } = await api.post("/auth/staff/", staffForm);
      setStaff((prev) => [...prev, data]);
      setStaffForm({ first_name: "", last_name: "", email: "", phone: "", password: "", role: "staff" });
      setShowAddStaff(false);
      success(`Added ${data.first_name} as ${data.role} successfully!`);
    } catch (err: unknown) {
      const parsed = parseApiErrors(err, "Failed to add staff member.");
      setStaffErrors(parsed.fieldErrors);
      error(getPrimaryErrorMessage(parsed, "Failed to add staff member."));
    } finally {
      setStaffSaving(false);
    }
  };

  // Deactivate staff
  const handleDeactivate = (id: number) => {
    setDeactivateConfirmId(id);
  };

  const executeDeactivate = async () => {
    if (!deactivateConfirmId) return;
    try {
      await api.patch(`/auth/staff/${deactivateConfirmId}/`, { is_active: false });
      setStaff((prev) => prev.map((s) => s.id === deactivateConfirmId ? { ...s, is_active: false } : s));
      success("Staff member access revoked.");
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Failed to deactivate staff."));
    } finally {
      setDeactivateConfirmId(null);
    }
  };

  const handleResetStaffPasswordSubmit = async () => {
    if (!resetPasswordId) return;
    setResetPasswordErrors({});
    if (resetPasswordValue.length < 8) {
      const message = "Password must be at least 8 characters.";
      setResetPasswordErrors({ new_password: message });
      error(message);
      return;
    }
    setResetPasswordSaving(true);
    try {
      await api.post(`/auth/staff/${resetPasswordId}/reset-password/`, { new_password: resetPasswordValue });
      success(`Password for ${resetPasswordName} reset successfully.`);
      setResetPasswordId(null);
      setResetPasswordValue("");
      setResetPasswordErrors({});
    } catch (err: unknown) {
      const parsed = parseApiErrors(err, "Failed to reset password.");
      setResetPasswordErrors(parsed.fieldErrors);
      error(getPrimaryErrorMessage(parsed, "Failed to reset password."));
    } finally {
      setResetPasswordSaving(false);
    }
  };

  const handleResetPasswordClick = (id: number, name: string) => {
    setResetPasswordId(id);
    setResetPasswordName(name);
    setResetPasswordValue("");
    setResetPasswordErrors({});
  };

  const handleExport = async (fmt: "pdf" | "zip") => {
    try {
      const response = await api.get(`/reports/export/backup/?download_format=${fmt}`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `shop_backup_${new Date().toISOString().split("T")[0]}.${fmt}`;
      a.click();
      window.URL.revokeObjectURL(url);
      success(`Exported shop backup as ${fmt.toUpperCase()} successfully.`);
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Export failed. Please try again."));
    }
  };

  const handlePreviewBackup = async () => {
    if (!backupPreviewFile) {
      error("Choose a backup ZIP file first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", backupPreviewFile);

    setBackupPreviewLoading(true);
    try {
      const { data } = await api.post("/reports/import/preview/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBackupPreview(data);
      setBackupRestoreConfirmation("");
      success("Backup preview generated. No data has been imported.");
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Could not preview this backup file."));
      setBackupPreview(null);
      setBackupRestoreConfirmation("");
    } finally {
      setBackupPreviewLoading(false);
    }
  };

  const handleApplyBackupRestore = async () => {
    if (!backupPreviewFile || !backupPreview) {
      error("Preview a backup file first before restoring.");
      return;
    }

    const confirmationPhrase = backupPreview.confirmation_phrase || "RESTORE MY SHOP DATA";
    if (
      normalizeRestoreConfirmation(backupRestoreConfirmation) !==
      normalizeRestoreConfirmation(confirmationPhrase)
    ) {
      error(`Type "${confirmationPhrase}" exactly to confirm the restore.`);
      return;
    }

    const formData = new FormData();
    formData.append("file", backupPreviewFile);
    formData.append("confirmation", confirmationPhrase);

    setBackupRestoreLoading(true);
    try {
      const { data } = await api.post("/reports/import/apply/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      success(data.message || "Backup restored successfully.");
      setBackupRestoreConfirmation("");
      setBackupPreview(null);
      setBackupPreviewFile(null);
      setBackupFileInputKey((current) => current + 1);
    } catch (err: unknown) {
      error(getApiErrorMessage(err, "Could not restore this backup."));
    } finally {
      setBackupRestoreLoading(false);
    }
  };

  const expectedRestoreConfirmation = backupPreview?.confirmation_phrase || "RESTORE MY SHOP DATA";
  const restoreConfirmationMatches = backupPreview
    ? normalizeRestoreConfirmation(backupRestoreConfirmation) ===
      normalizeRestoreConfirmation(expectedRestoreConfirmation)
    : false;

  return (
    <div className="flex flex-col md:flex-row gap-8 max-w-5xl mx-auto pb-10">
      {/* Sidebar Navigation */}
      <div className="md:w-56 shrink-0 space-y-1">
        <div className="mb-6 hidden md:block">
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--color-text)" }}>Settings</h1>
          <p className="text-sm mt-1" style={{ color: "var(--color-muted)" }}>Manage your account</p>
        </div>
        
        <div className="flex overflow-x-auto md:block pb-3 md:pb-0 hide-scrollbar space-x-2 md:space-x-0 md:space-y-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className="text-sm font-medium px-4 py-2.5 rounded-xl transition-all whitespace-nowrap md:w-full md:text-left"
              style={{
                backgroundColor: activeTab === t.id ? "var(--color-primary)" : "transparent",
                color: activeTab === t.id ? "white" : "var(--color-muted)",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 space-y-6">
        <div className="md:hidden mb-2">
          <h1 className="font-display text-2xl font-bold" style={{ color: "var(--color-text)" }}>Settings</h1>
        </div>

        {activeTab === "profile" && (
          <div className="space-y-6 animate-fade-in">
            {/* Appearance */}
            <Card title="Appearance" description="Customize how the app looks">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--color-text)" }}>Dark Mode</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--color-muted)" }}>
                    {isDark ? "Currently using dark theme" : "Currently using light theme"}
                  </p>
                </div>
                <button onClick={toggleTheme}
                  className="relative w-12 h-6 rounded-full transition-colors duration-300"
                  style={{ backgroundColor: isDark ? "var(--color-primary)" : "var(--color-border)" }}>
                  <span
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all duration-300"
                    style={{ left: isDark ? "calc(100% - 20px)" : "4px" }}
                  />
                </button>
              </div>
            </Card>

            {/* Profile */}
            <Card title="Your Profile" description="Update your personal information">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="First Name" error={profileErrors.first_name}>
                  <Input name="first_name" value={profile.first_name} hasError={!!profileErrors.first_name}
                    onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} />
                </Field>
                <Field label="Last Name" error={profileErrors.last_name}>
                  <Input name="last_name" value={profile.last_name} hasError={!!profileErrors.last_name}
                    onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} />
                </Field>
              </div>
              <Field label="Email Address">
                <Input name="email" value={profile.email} type="email"
                  disabled />
              </Field>
              <Field label="Phone" error={profileErrors.phone}>
                <Input name="phone" value={profile.phone} type="tel" hasError={!!profileErrors.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </Field>
              <Field label="Role">
                <Input name="role" value={user?.role || ""} disabled />
              </Field>
              <SaveButton onClick={handleSaveProfile} saving={profileSaving} saved={profileSaved} />
            </Card>
          </div>
        )}

        {activeTab === "security" && (
          <div className="space-y-6 animate-fade-in">
            {/* Password */}
            <Card title="Change Password" description="Update your security credentials">
              <Field label="Current Password" error={pwErrors.old_password}>
                <PasswordInput name="old_password" value={passwords.old_password} hasError={!!pwErrors.old_password}
                  onChange={(e) => setPasswords({ ...passwords, old_password: e.target.value })} />
              </Field>
              <Field label="New Password" error={pwErrors.new_password} hint="Must be at least 8 characters.">
                <PasswordInput name="new_password" value={passwords.new_password} hasError={!!pwErrors.new_password}
                  onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} />
              </Field>
              <Field label="Confirm New Password" error={pwErrors.confirm_new_password || pwErrors.confirm_password}>
                <PasswordInput name="confirm_password" value={passwords.confirm_password} hasError={!!(pwErrors.confirm_new_password || pwErrors.confirm_password)}
                  onChange={(e) => setPasswords({ ...passwords, confirm_password: e.target.value })} />
              </Field>
              <SaveButton onClick={handleSavePassword} saving={pwSaving} saved={pwSaved} />
            </Card>
          </div>
        )}

        {activeTab === "shop" && isAdmin && (
          <div className="space-y-6 animate-fade-in">
            {/* Shop info */}
            <Card title="Shop Information" description="Update your business entity details">
              <Field label="Shop Name" error={shopErrors.name}>
                <Input name="name" value={shop.name} disabled={!isAdmin} hasError={!!shopErrors.name}
                  onChange={(e) => setShop({ ...shop, name: e.target.value })} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Phone" error={shopErrors.phone} hint="Required for SMS notifications.">
                  <Input name="phone" value={shop.phone} placeholder="+234901234567 or 901234567"
                    disabled={!isAdmin} hasError={!!shopErrors.phone}
                    onChange={(e) => setShop({ ...shop, phone: e.target.value })} />
                </Field>
                <Field label="Email" error={shopErrors.email}>
                  <Input name="email" value={shop.email} type="email" disabled={!isAdmin} hasError={!!shopErrors.email}
                    onChange={(e) => setShop({ ...shop, email: e.target.value })} />
                </Field>
              </div>
              <Field label="Physical Address" error={shopErrors.address}>
                <Input name="address" value={shop.address} disabled={!isAdmin} hasError={!!shopErrors.address}
                  onChange={(e) => setShop({ ...shop, address: e.target.value })} />
              </Field>
              <Field label="Shop Description" error={shopErrors.description} hint="Displays on customer receipts and invoices.">
                <textarea
                  value={shop.description}
                  onChange={(e) => setShop({ ...shop, description: e.target.value })}
                  rows={2}
                  placeholder="Brief description of your shop"
                  className="w-full px-4 py-2.5 rounded-xl text-sm outline-none resize-none transition-colors"
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = "var(--color-primary)")}
                  onBlur={(e) => (e.target.style.borderColor = "var(--color-border)")}
                />
              </Field>
              
              <div className="pt-4 pb-2 border-t mt-4" style={{ borderColor: 'var(--color-border)' }}>
                <label className={`flex items-start sm:items-center gap-3 ${!isPro ? "cursor-not-allowed" : "cursor-pointer"}`}>
                  <input
                    type="checkbox"
                    disabled={!isPro}
                    checked={shop.enable_sms_notifications}
                    onChange={(e) => setShop({ ...shop, enable_sms_notifications: e.target.checked })}
                    className="w-5 h-5 mt-0.5 sm:mt-0 rounded text-primary focus:ring-primary disabled:opacity-50 shrink-0 border"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                  <div>
                    <span className="text-sm font-medium flex items-center gap-2" style={{ color: "var(--color-text)" }}>
                      Customer Notifications
                      {!isPro && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          PRO
                        </span>
                      )}
                    </span>
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                      Send automated SMS text messages to customers when their repairs are marked as Fixed.
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-4 pb-2 border-t mt-4" style={{ borderColor: 'var(--color-border)' }}>
                <label className="flex items-start sm:items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shop.allow_staff_inventory_management}
                    onChange={(e) => setShop({ ...shop, allow_staff_inventory_management: e.target.checked })}
                    className="w-5 h-5 mt-0.5 sm:mt-0 rounded text-primary focus:ring-primary shrink-0 border"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                  <div>
                    <span className="text-sm font-medium flex items-center gap-2" style={{ color: "var(--color-text)" }}>
                      Allow Staff Inventory Access
                    </span>
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                      When enabled, staff members can add, edit, delete products and adjust stock. When disabled, staff can only view inventory and check stock history.
                    </p>
                  </div>
                </label>
              </div>

              <div className="pt-4 pb-2 border-t mt-4" style={{ borderColor: 'var(--color-border)' }}>
                <label className="flex items-start sm:items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shop.allow_staff_sales}
                    onChange={(e) => setShop({ ...shop, allow_staff_sales: e.target.checked })}
                    className="w-5 h-5 mt-0.5 sm:mt-0 rounded text-primary focus:ring-primary shrink-0 border"
                    style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
                  />
                  <div>
                    <span className="text-sm font-medium flex items-center gap-2" style={{ color: "var(--color-text)" }}>
                      Allow Staff Sales Access
                    </span>
                    <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                      When enabled, staff members can use POS, collect credit payments, and process returns. When disabled, admins handle sales actions.
                    </p>
                  </div>
                </label>
              </div>

              <SaveButton onClick={handleSaveShop} saving={shopSaving} saved={shopSaved} />
            </Card>
          </div>
        )}

        {activeTab === "team" && isAdmin && (
          <div className="space-y-6 animate-fade-in">
            {/* Staff management */}
            <Card title="Team Management" description="Add and manage your technicians and staff">
              {/* Staff list */}
              <div>
                {staff.length === 0 ? (
                  <p className="text-sm py-4 text-center" style={{ color: "var(--color-muted)" }}>
                    No staff members yet.
                  </p>
                ) : (
                  staff.map((s) => (
                    <StaffRow key={s.id} staff={s} onDeactivate={handleDeactivate} onResetPassword={handleResetPasswordClick} />
                  ))
                )}
              </div>

              {/* Add staff form */}
              {showAddStaff ? (
                <div className="pt-6 border-t mt-4" style={{ borderColor: "var(--color-border)" }}>
                  <p className="text-sm font-semibold mb-4" style={{ color: "var(--color-text)" }}>
                    Invite New Staff Member
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="First Name" error={staffErrors.first_name}>
                        <Input name="first_name" value={staffForm.first_name} hasError={!!staffErrors.first_name}
                          onChange={(e) => setStaffForm({ ...staffForm, first_name: e.target.value })} />
                      </Field>
                      <Field label="Last Name" error={staffErrors.last_name}>
                        <Input name="last_name" value={staffForm.last_name} hasError={!!staffErrors.last_name}
                          onChange={(e) => setStaffForm({ ...staffForm, last_name: e.target.value })} />
                      </Field>
                    </div>
                    <Field label="Email Address" error={staffErrors.email}>
                      <Input name="email" placeholder="samuel@techstore.com" value={staffForm.email} type="email" hasError={!!staffErrors.email}
                        onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })} />
                    </Field>
                    <Field label="Phone Number (Optional)" error={staffErrors.phone}>
                      <Input name="phone" value={staffForm.phone} type="tel" placeholder="+234901234567 or 901234567" hasError={!!staffErrors.phone}
                        onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })} />
                    </Field>
                    <Field label="Temporary Password" error={staffErrors.password}>
                      <PasswordInput name="password" value={staffForm.password} hasError={!!staffErrors.password}
                        onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })} />
                    </Field>
                    <Field label="Account Role">
                      <select value={staffForm.role}
                        onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                        className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                        style={inputStyle}>
                        <option value="staff">Staff (permissions from Shop Details)</option>
                        <option value="technician">Technician (Repairs)</option>
                      </select>
                    </Field>
                    <div className="flex gap-3 pt-2">
                      <button onClick={() => { setShowAddStaff(false); }}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: "var(--color-bg)",
                          border: "1px solid var(--color-border)",
                          color: "var(--color-text)",
                        }}>
                        Cancel
                      </button>
                      <button onClick={handleAddStaff} disabled={staffSaving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all"
                        style={{ background: "linear-gradient(135deg, var(--color-primary), var(--color-primary))" }}>
                        {staffSaving ? "Sending Invite..." : "Add Staff"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="pt-2">
                  <button onClick={() => setShowAddStaff(true)}
                    className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-colors flex justify-center items-center gap-2"
                    style={{ backgroundColor: "var(--color-primary)" }}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    Invite New Staff
                  </button>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeTab === "advanced" && isAdmin && (
          <div className="space-y-6 animate-fade-in">
            <Card
              title="Preview Backup Before Import"
              description="Review the backup contents first. This step does not import or change any live data."
            >
              <div className="space-y-4">
                <div className="rounded-2xl p-4 border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg)" }}>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--color-text)" }}>
                    Backup ZIP File
                  </label>
                  <input
                    key={backupFileInputKey}
                    type="file"
                    accept=".zip,application/zip"
                    disabled={!isPro}
                    onChange={(e) => {
                      setBackupPreviewFile(e.target.files?.[0] || null);
                      setBackupPreview(null);
                      setBackupRestoreConfirmation("");
                    }}
                    className="block w-full text-sm"
                    style={{ color: "var(--color-text)" }}
                  />
                  <p className="text-xs mt-2" style={{ color: "var(--color-muted)" }}>
                    Upload a Giztrack backup ZIP to inspect the datasets and sample rows before any restore step.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handlePreviewBackup}
                    disabled={!isPro || !backupPreviewFile || backupPreviewLoading}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{
                      background: "linear-gradient(135deg, var(--color-primary), var(--color-primary))",
                      opacity: !isPro || !backupPreviewFile || backupPreviewLoading ? 0.6 : 1,
                      cursor: !isPro || !backupPreviewFile || backupPreviewLoading ? "not-allowed" : "pointer",
                    }}
                  >
                    {backupPreviewLoading ? "Generating Preview..." : "Preview Backup"}
                  </button>

                  {backupPreview ? (
                    <button
                      onClick={() => {
                        setBackupPreview(null);
                        setBackupPreviewFile(null);
                        setBackupRestoreConfirmation("");
                        setBackupFileInputKey((current) => current + 1);
                      }}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                      style={{
                        backgroundColor: "var(--color-bg)",
                        border: "1px solid var(--color-border)",
                        color: "var(--color-text)",
                      }}
                    >
                      Clear Preview
                    </button>
                  ) : null}
                </div>

                {!isPro ? (
                  <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                    Backup preview tools are available on the Pro plan.
                  </p>
                ) : null}

                {backupPreview ? (
                  <div className="space-y-5 pt-2">
                    <div className="rounded-2xl p-4 border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg)" }}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
                            Preview Only
                          </p>
                          <p className="text-xs mt-1" style={{ color: "var(--color-muted)" }}>
                            {backupPreview.message}
                          </p>
                        </div>
                        <div className="text-xs" style={{ color: "var(--color-muted)" }}>
                          {backupPreview.filename}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
                        {[
                          { label: "Shop", value: backupPreview.shop_name || "Unknown" },
                          { label: "Generated", value: backupPreview.generated_at || "Unknown" },
                          { label: "Datasets", value: String(backupPreview.datasets.length) },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className="rounded-xl p-3 border"
                            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
                          >
                            <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-muted)" }}>
                              {item.label}
                            </p>
                            <p className="mt-2 text-sm font-semibold break-words" style={{ color: "var(--color-text)" }}>
                              {item.value}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {backupPreview.missing_optional_files?.length ? (
                      <div
                        className="rounded-2xl p-4 border"
                        style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb" }}
                      >
                        <p className="text-sm font-semibold text-amber-800">
                          Older backup detected
                        </p>
                        <p className="text-xs mt-1 text-amber-700">
                          Some newer optional datasets are missing: {backupPreview.missing_optional_files.join(", ")}.
                          Core data can still be restored, but some history may be unavailable.
                        </p>
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                      {Object.entries(backupPreview.totals).map(([key, count]) => (
                        <div
                          key={key}
                          className="rounded-xl p-3 border"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg)" }}
                        >
                          <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-muted)" }}>
                            {key.replace("_", " ")}
                          </p>
                          <p className="mt-2 text-lg font-bold" style={{ color: "var(--color-primary)" }}>
                            {count}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div
                      className="rounded-2xl p-4 border"
                      style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}
                    >
                      <p className="text-sm font-bold text-red-700">
                        Restore will replace current business data
                      </p>
                      <p className="text-xs mt-1 text-red-600">
                        This restore replaces the current shop&apos;s categories, products, customers, sales, payments,
                        expenses, repairs, and related history from the uploaded backup. It does not change users,
                        subscription status, or billing records.
                      </p>

                      <div className="mt-4 space-y-3">
                        <label className="block text-sm font-medium" style={{ color: "var(--color-text)" }}>
                          Type <span className="font-bold">{backupPreview.confirmation_phrase}</span> to confirm
                        </label>
                        <input
                          type="text"
                          value={backupRestoreConfirmation}
                          onChange={(e) => setBackupRestoreConfirmation(e.target.value)}
                          placeholder={expectedRestoreConfirmation}
                          className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                          style={{
                            ...inputStyle,
                            border: restoreConfirmationMatches
                              ? "1px solid #16a34a"
                              : inputStyle.border,
                          }}
                        />
                        <div className="flex flex-wrap items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setBackupRestoreConfirmation(expectedRestoreConfirmation)}
                            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
                            style={{
                              backgroundColor: "var(--color-bg)",
                              border: "1px solid var(--color-border)",
                              color: "var(--color-text)",
                            }}
                          >
                            Use Exact Phrase
                          </button>
                          <button
                            onClick={handleApplyBackupRestore}
                            disabled={backupRestoreLoading || !backupPreviewFile}
                            className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                            style={{
                              backgroundColor: "#dc2626",
                              opacity: backupRestoreLoading || !backupPreviewFile ? 0.6 : 1,
                              cursor: backupRestoreLoading || !backupPreviewFile ? "not-allowed" : "pointer",
                            }}
                          >
                            {backupRestoreLoading ? "Restoring Backup..." : "Restore Backup"}
                          </button>
                        </div>
                        <p
                          className="text-xs"
                          style={{ color: restoreConfirmationMatches ? "#15803d" : "var(--color-muted)" }}
                        >
                          {restoreConfirmationMatches
                            ? "Confirmation phrase looks good. Restore is ready."
                            : "Type the phrase above or use the button to fill it automatically."}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {backupPreview.datasets.map((dataset) => (
                        <div
                          key={dataset.key}
                          className="rounded-2xl overflow-hidden border"
                          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-surface)" }}
                        >
                          <div className="px-4 py-3 border-b flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--color-border)" }}>
                            <div>
                              <p className="text-sm font-bold" style={{ color: "var(--color-text)" }}>
                                {dataset.label}
                              </p>
                              <p className="text-xs" style={{ color: "var(--color-muted)" }}>
                                {dataset.file_name} · {dataset.row_count} row{dataset.row_count === 1 ? "" : "s"}
                              </p>
                            </div>
                            <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                              Showing up to 5 rows
                            </p>
                          </div>

                          {dataset.preview_rows.length === 0 ? (
                            <div className="px-4 py-5 text-sm" style={{ color: "var(--color-muted)" }}>
                              No rows found in this dataset.
                            </div>
                          ) : (
                            <>
                              <div className="space-y-3 p-4 md:hidden">
                                {dataset.preview_rows.map((row, index) => (
                                  <div
                                    key={`${dataset.key}-${index}`}
                                    className="rounded-2xl border p-3"
                                    style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg)" }}
                                  >
                                    <div className="space-y-2">
                                      {dataset.headers.map((header) => (
                                        <div key={`${dataset.key}-${index}-${header}`} className="grid grid-cols-[minmax(0,110px)_1fr] gap-3 text-sm">
                                          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--color-muted)" }}>
                                            {header}
                                          </p>
                                          <p className="break-words" style={{ color: "var(--color-text)" }}>
                                            {row[header] || "—"}
                                          </p>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <div className="hidden md:block overflow-x-auto">
                                <table className="w-full min-w-[640px] text-left">
                                  <thead style={{ backgroundColor: "var(--color-bg)" }}>
                                    <tr>
                                      {dataset.headers.map((header) => (
                                        <th key={header} className="px-4 py-3 text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-muted)" }}>
                                          {header}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dataset.preview_rows.map((row, index) => (
                                      <tr key={`${dataset.key}-${index}`} className="border-t" style={{ borderColor: "var(--color-border)" }}>
                                        {dataset.headers.map((header) => (
                                          <td key={`${dataset.key}-${index}-${header}`} className="px-4 py-3 text-sm align-top" style={{ color: "var(--color-text)" }}>
                                            {row[header] || "—"}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </Card>

            {/* Danger zone */}
            <div className="rounded-2xl overflow-hidden shadow-sm"
              style={{ border: "1px solid #fecaca" }}>
              <div className="px-6 py-5 border-b" style={{ borderColor: "#fecaca", backgroundColor: "#fef2f2" }}>
                <h2 className="font-display font-bold text-base text-red-600 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  Danger Zone
                </h2>
                <p className="text-sm mt-1 text-red-500">
                  Irreversible actions — proceed with caution.
                </p>
              </div>
              <div className="px-6 py-6" style={{ backgroundColor: "var(--color-surface)" }}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold flex items-center gap-2" style={{ color: "var(--color-text)" }}>
                      Backup Shop Data
                      {!isPro && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                          PRO
                        </span>
                      )}
                    </p>
                    <p className="text-xs mt-1 max-w-sm" style={{ color: "var(--color-muted)" }}>
                      Download a complete shop backup. ZIP gives you cleaner spreadsheet-ready files, while PDF gives you a readable archive summary.
                      {!isPro ? " Export tools are available on the Pro plan." : ""}
                    </p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button
                      onClick={() => handleExport("pdf")}
                      disabled={!isPro}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors shadow-sm"
                      style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", opacity: !isPro ? 0.6 : 1, cursor: !isPro ? "not-allowed" : "pointer" }}>
                      PDF
                    </button>
                    <button
                      onClick={() => handleExport("zip")}
                      disabled={!isPro}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors shadow-sm"
                      style={{ backgroundColor: "#fef2f2", border: "1px solid #fecaca", opacity: !isPro ? 0.6 : 1, cursor: !isPro ? "not-allowed" : "pointer" }}>
                      ZIP
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={deactivateConfirmId !== null}
        title="Revoke Access"
        message="Are you sure you want to remove this staff member's access from your shop?"
        confirmText="Revoke Access"
        onConfirm={executeDeactivate}
        onCancel={() => setDeactivateConfirmId(null)}
      />

      {/* Reset Password Modal */}
      {resetPasswordId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 animate-fade-in backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl p-6 shadow-xl"
            style={{ backgroundColor: "var(--color-surface)", border: "1px solid var(--color-border)" }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2" style={{ color: "var(--color-text)" }}>
              Reset Password for {resetPasswordName}
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--color-muted)" }}>
              Enter a new temporary password for this user (minimum 8 characters).
            </p>

            <div className="mb-6">
              <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--color-text)" }}>
                New Password
              </label>
              <input
                type="text"
                value={resetPasswordValue}
                onChange={(e) => {
                  setResetPasswordValue(e.target.value);
                  setResetPasswordErrors((prev) => ({ ...prev, new_password: "", password: "" }));
                }}
                placeholder="New password"
                className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
                style={{
                  ...inputStyle,
                  borderColor: resetPasswordErrors.new_password || resetPasswordErrors.password
                    ? "var(--color-danger, #ef4444)"
                    : "var(--color-border)",
                }}
                onFocus={(e) => {
                  e.target.style.borderColor =
                    resetPasswordErrors.new_password || resetPasswordErrors.password
                      ? "var(--color-danger, #ef4444)"
                      : "var(--color-primary)";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor =
                    resetPasswordErrors.new_password || resetPasswordErrors.password
                      ? "var(--color-danger, #ef4444)"
                      : "var(--color-border)";
                }}
              />
              {(resetPasswordErrors.new_password || resetPasswordErrors.password) && (
                <p className="text-xs mt-1.5 text-red-500 font-medium">
                  {resetPasswordErrors.new_password || resetPasswordErrors.password}
                </p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setResetPasswordId(null)}
                className="py-2.5 rounded-xl text-sm font-medium transition-colors"
                style={{ flex: 1, backgroundColor: "var(--color-bg)", color: "var(--color-text)" }}>
                Cancel
              </button>
              <button
  
  onClick={handleResetStaffPasswordSubmit}
                disabled={resetPasswordSaving}
                className="py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all"
                style={{ flex: 2, background: "linear-gradient(135deg, var(--color-primary), var(--color-primary))" }}>
                {resetPasswordSaving ? "Saving..." : "Change Password"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
