/** A transient notification. Stack bottom-right, 16px gap, auto-dismiss ~4s. */
export interface ToastProps {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: string;
  /** Detail line — set in mono, often a command or a path. */
  message?: string;
  onDismiss?: () => void;
  style?: React.CSSProperties;
}
export declare function Toast(props: ToastProps): JSX.Element;
