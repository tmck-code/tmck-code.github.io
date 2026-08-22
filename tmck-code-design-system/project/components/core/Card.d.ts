/**
 * The default content container: flat surface, 1px border, no shadow.
 * @startingPoint section="Core" subtitle="Surface container with eyebrow and title" viewport="700x260"
 */
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Mono uppercase label above the title. */
  eyebrow?: string;
  title?: string;
  /** Mono metadata row under a hairline rule. */
  footer?: React.ReactNode;
  /** Amber border + hard ink shadow. One per view, maximum. */
  featured?: boolean;
  /** Border brightens on hover. */
  interactive?: boolean;
}
export declare function Card(props: CardProps): JSX.Element;
