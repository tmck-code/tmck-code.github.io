/** A small status marker: mono, pill, soft tinted fill. */
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: 'neutral' | 'accent' | 'brand' | 'success' | 'warning' | 'danger';
  /** Leading status dot. */
  dot?: boolean;
}
export declare function Badge(props: BadgeProps): JSX.Element;
