/**
 * The site header: 56px, mark + wordmark left, links, slot on the right.
 * @startingPoint section="Navigation" subtitle="56px site header with the robot mark" viewport="700x120"
 */
export interface NavLink { id: string; label?: string; href?: string }
export interface NavBarProps {
  title?: string;
  links?: (NavLink | string)[];
  active?: string;
  onNavigate?: (id: string) => void;
  /** Right-hand slot — icon buttons, a CTA. */
  right?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function NavBar(props: NavBarProps): JSX.Element;
