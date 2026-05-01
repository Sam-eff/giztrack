
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = true,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-sm rounded-2xl shadow-xl flex flex-col overflow-hidden"
        style={{
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          maxHeight: "calc(100svh - 2rem)",
        }}
      >
        <div className="px-6 pt-6 pb-5 overflow-y-auto">
          <h2 className="font-display font-bold text-lg mb-2" style={{ color: "var(--color-text)" }}>
            {title}
          </h2>
          <p className="text-sm font-medium" style={{ color: "var(--color-muted)" }}>
            {message}
          </p>
        </div>
        <div
          className="px-6 py-4 flex gap-3 justify-end border-t"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-bg)" }}
        >
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors"
            style={{
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
            }}
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90`}
            style={{
              backgroundColor: isDestructive ? "#dc2626" : "var(--color-primary)",
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
