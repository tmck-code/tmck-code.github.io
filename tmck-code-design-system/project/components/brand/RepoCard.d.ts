/**
 * A repository summary — the primary content type on the profile and the blog.
 * @startingPoint section="Brand" subtitle="Repo listing card with language and stars" viewport="700x200"
 */
export interface RepoCardProps {
  /** Always the real lowercase hyphenated repo name. */
  name: string;
  /** One line, no adjectives — match the repo's own description voice. */
  description?: string;
  language?: 'Python' | 'Go' | 'Rust' | 'Shell' | 'HTML' | 'JavaScript' | string;
  stars?: number;
  forks?: number;
  visibility?: string;
  featured?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function RepoCard(props: RepoCardProps): JSX.Element;
