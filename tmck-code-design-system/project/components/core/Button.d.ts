/**
 * The primary action control.
 * @startingPoint section="Core" subtitle="Buttons in every variant and size" viewport="700x220"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** primary = amber (one per view). brand = moss. secondary = steel outline. ghost = bare. danger = red outline. */
  variant?: 'primary' | 'secondary' | 'brand' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Lucide icon name shown before the label. */
  icon?: string;
  /** Lucide icon name shown after the label. */
  iconAfter?: string;
  /** Adds the hard ink offset shadow. Brand-forward moments only. */
  sticker?: boolean;
  disabled?: boolean;
}
export declare function Button(props: ButtonProps): JSX.Element;
