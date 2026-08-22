/** A square, label-less control for toolbars and card corners. */
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Lucide icon name. */
  icon: string;
  /** Accessible name — required, also used as the tooltip. */
  label: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'ghost' | 'solid';
  /** Amber-tinted pressed/on state. */
  active?: boolean;
}
export declare function IconButton(props: IconButtonProps): JSX.Element;
