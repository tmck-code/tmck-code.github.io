/** A mono keyword chip — topics, languages, post tags. */
export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Amber outline + tint when selected. */
  active?: boolean;
  /** Shows an × affordance. */
  onRemove?: () => void;
}
export declare function Tag(props: TagProps): JSX.Element;
