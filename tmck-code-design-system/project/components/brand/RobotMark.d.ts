/**
 * The tmck-code robot. Minimum 24px; below 48px always use the simplified vector (this component).
 * @startingPoint section="Brand" subtitle="The mark, static and animated, at every size" viewport="700x200"
 */
export interface RobotMarkProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Rendered size in px. Never below 24. */
  size?: number;
  /** mark = transparent background. avatar = mark on the moss + hex field, circular. */
  variant?: 'mark' | 'avatar';
  /** Idle loop: bob, antenna pulse, eye scan + blink, mouth flicker. */
  animated?: boolean;
  /** 3px ink outline + hard offset shadow — the sticker treatment. */
  framed?: boolean;
  /** Accessible label. */
  title?: string;
}
export declare function RobotMark(props: RobotMarkProps): JSX.Element;
