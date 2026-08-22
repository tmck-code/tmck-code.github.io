/** A modal. Renders into its positioned ancestor, so wrap kits in position:relative. */
export interface DialogProps {
  open?: boolean;
  title?: string;
  description?: string;
  /** Action row, right-aligned. */
  footer?: React.ReactNode;
  onClose?: () => void;
  width?: number;
}
export declare function Dialog(props: DialogProps): JSX.Element | null;
