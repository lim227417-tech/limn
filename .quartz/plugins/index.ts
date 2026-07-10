import { componentRegistry } from "../../quartz/components/registry"

export type { CitationsOptions } from "./citations"
export type { CrawlLinksOptions } from "./crawl-links"
export type { CreatedModifiedDateOptions } from "./created-modified-date"
export type { DescriptionOptions } from "./description"
export type { GfmOptions } from "./github-flavored-markdown"
export type { Args, LatexOptions } from "./latex"
export type { ObsidianFlavoredMarkdownOptions } from "./obsidian-flavored-markdown"
export type { SyntaxHighlightingOptions } from "./syntax-highlighting"
export type { TableOfContentsTransformerOptions, TocEntry } from "./table-of-contents"
export { tokenClassifierTransformer } from "./syntax-highlighting"
export { TableOfContents } from "./table-of-contents"

export { CustomOgImagesEmitterName } from "../plugins/og-image"
export const plugins: Record<string, Record<string, (...args: unknown[]) => void>> = {
  "citations": {
    Citations: (...args: unknown[]) => { componentRegistry.setOptionOverrides("citations", args[0] as Record<string, unknown>); },
  },
  "crawl-links": {
    CrawlLinks: (...args: unknown[]) => { componentRegistry.setOptionOverrides("crawl-links", args[0] as Record<string, unknown>); },
  },
  "created-modified-date": {
    CreatedModifiedDate: (...args: unknown[]) => { componentRegistry.setOptionOverrides("created-modified-date", args[0] as Record<string, unknown>); },
  },
  "description": {
    Description: (...args: unknown[]) => { componentRegistry.setOptionOverrides("description", args[0] as Record<string, unknown>); },
  },
  "github-flavored-markdown": {
    GitHubFlavoredMarkdown: (...args: unknown[]) => { componentRegistry.setOptionOverrides("github-flavored-markdown", args[0] as Record<string, unknown>); },
  },
  "hard-line-breaks": {
    HardLineBreaks: (...args: unknown[]) => { componentRegistry.setOptionOverrides("hard-line-breaks", args[0] as Record<string, unknown>); },
  },
  "latex": {
    Latex: (...args: unknown[]) => { componentRegistry.setOptionOverrides("latex", args[0] as Record<string, unknown>); },
  },
  "obsidian-flavored-markdown": {
    ObsidianFlavoredMarkdown: (...args: unknown[]) => { componentRegistry.setOptionOverrides("obsidian-flavored-markdown", args[0] as Record<string, unknown>); },
  },
  "syntax-highlighting": {
    SyntaxHighlighting: (...args: unknown[]) => { componentRegistry.setOptionOverrides("syntax-highlighting", args[0] as Record<string, unknown>); },
  },
  "table-of-contents": {
    TableOfContentsTransformer: (...args: unknown[]) => { componentRegistry.setOptionOverrides("table-of-contents", args[0] as Record<string, unknown>); },
  },
}

export const Citations = plugins["citations"].Citations
export const CrawlLinks = plugins["crawl-links"].CrawlLinks
export const CreatedModifiedDate = plugins["created-modified-date"].CreatedModifiedDate
export const Description = plugins["description"].Description
export const GitHubFlavoredMarkdown = plugins["github-flavored-markdown"].GitHubFlavoredMarkdown
export const HardLineBreaks = plugins["hard-line-breaks"].HardLineBreaks
export const Latex = plugins["latex"].Latex
export const ObsidianFlavoredMarkdown = plugins["obsidian-flavored-markdown"].ObsidianFlavoredMarkdown
export const SyntaxHighlighting = plugins["syntax-highlighting"].SyntaxHighlighting
export const TableOfContentsTransformer = plugins["table-of-contents"].TableOfContentsTransformer
