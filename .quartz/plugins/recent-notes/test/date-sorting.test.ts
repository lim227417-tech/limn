import { describe, expect, it } from "vitest";
import { resolveDefaultDateType, withResolvedDateType } from "../src/index";
import { byDateAndAlphabetical, getDate } from "@quartz-community/utils/sort";
import type { FullSlug, GlobalConfiguration, QuartzPluginData } from "@quartz-community/types";

function makePage(
  slug: string,
  title: string,
  dates: { created: Date; modified: Date; published: Date },
  defaultDateType?: string,
): QuartzPluginData & Record<string, unknown> {
  return {
    slug: slug as FullSlug,
    frontmatter: { title, tags: [] },
    dates,
    defaultDateType,
  } as unknown as QuartzPluginData & Record<string, unknown>;
}

const jan = new Date("2025-01-15T00:00:00");
const mar = new Date("2025-03-20T00:00:00");
const may = new Date("2025-05-10T00:00:00");

describe("resolveDefaultDateType", () => {
  const cfgWithout = { locale: "en-US" } as GlobalConfiguration;
  const cfgWith = { locale: "en-US", defaultDateType: "created" } as GlobalConfiguration & {
    defaultDateType: string;
  };

  it("returns the per-file defaultDateType when set", () => {
    const page = makePage("a", "A", { created: jan, modified: mar, published: may }, "modified");
    expect(resolveDefaultDateType(page, cfgWithout)).toBe("modified");
  });

  it("falls back to cfg.defaultDateType when per-file value is missing", () => {
    const page = makePage("a", "A", { created: jan, modified: mar, published: may });
    expect(resolveDefaultDateType(page, cfgWith)).toBe("created");
  });

  it("returns undefined when neither per-file nor cfg has defaultDateType", () => {
    const page = makePage("a", "A", { created: jan, modified: mar, published: may });
    expect(resolveDefaultDateType(page, cfgWithout)).toBeUndefined();
  });

  it("prefers per-file value over cfg value", () => {
    const page = makePage("a", "A", { created: jan, modified: mar, published: may }, "published");
    expect(resolveDefaultDateType(page, cfgWith)).toBe("published");
  });
});

describe("withResolvedDateType", () => {
  const cfg = { locale: "en-US" } as GlobalConfiguration;

  it("preserves per-file defaultDateType so getDate() works", () => {
    const page = makePage("a", "A", { created: jan, modified: mar, published: may }, "modified");
    const resolved = withResolvedDateType(page, cfg);
    const date = getDate(resolved);
    expect(date).toEqual(mar);
  });

  it("does not overwrite per-file defaultDateType with undefined from cfg", () => {
    const page = makePage("a", "A", { created: jan, modified: mar, published: may }, "created");
    const resolved = withResolvedDateType(page, cfg);
    expect(resolved.defaultDateType).toBe("created");
    expect(getDate(resolved)).toEqual(jan);
  });

  it("returns data as-is when no defaultDateType can be resolved", () => {
    const page = makePage("a", "A", { created: jan, modified: mar, published: may });
    const resolved = withResolvedDateType(page, cfg);
    expect(getDate(resolved)).toBeUndefined();
  });
});

describe("date sorting regression", () => {
  const cfg = { locale: "en-US" } as GlobalConfiguration;

  it("sorts by date descending when per-file defaultDateType is set (no cfg.defaultDateType)", () => {
    const older = makePage(
      "a",
      "Alpha",
      { created: jan, modified: jan, published: jan },
      "modified",
    );
    const middle = makePage(
      "b",
      "Bravo",
      { created: mar, modified: mar, published: mar },
      "modified",
    );
    const newer = makePage(
      "c",
      "Charlie",
      { created: may, modified: may, published: may },
      "modified",
    );

    const sortFn = byDateAndAlphabetical();
    const pages = [older, middle, newer].map((p) => withResolvedDateType(p, cfg)).sort(sortFn);

    expect(pages.map((p) => p.slug)).toEqual(["c", "b", "a"]);
  });

  it("does not fall back to alphabetical when per-file dates exist", () => {
    const olderButFirst = makePage(
      "a",
      "AAA",
      { created: jan, modified: jan, published: jan },
      "modified",
    );
    const newerButLast = makePage(
      "b",
      "ZZZ",
      { created: may, modified: may, published: may },
      "modified",
    );

    const sortFn = byDateAndAlphabetical();
    const pages = [olderButFirst, newerButLast]
      .map((p) => withResolvedDateType(p, cfg))
      .sort(sortFn);

    expect(pages.at(0)?.slug).toBe("b");
    expect(pages.at(1)?.slug).toBe("a");
  });

  it("falls back to alphabetical only when no dates can be resolved", () => {
    const pageZ = makePage("z", "Zulu", { created: jan, modified: mar, published: may });
    const pageA = makePage("a", "Alpha", { created: jan, modified: mar, published: may });

    const sortFn = byDateAndAlphabetical();
    const pages = [pageZ, pageA].map((p) => withResolvedDateType(p, cfg)).sort(sortFn);

    expect(pages.at(0)?.slug).toBe("a");
    expect(pages.at(1)?.slug).toBe("z");
  });

  it("uses the correct date field based on defaultDateType", () => {
    const createdOld = makePage(
      "a",
      "A",
      { created: jan, modified: may, published: mar },
      "created",
    );
    const createdNew = makePage(
      "b",
      "B",
      { created: may, modified: jan, published: mar },
      "created",
    );

    const sortFn = byDateAndAlphabetical();
    const pages = [createdOld, createdNew].map((p) => withResolvedDateType(p, cfg)).sort(sortFn);

    expect(pages.at(0)?.slug).toBe("b");
    expect(pages.at(1)?.slug).toBe("a");
  });

  it("falls back to alphabetical only when no dates can be resolved", () => {
    const pageZ = makePage("z", "Zulu", { created: jan, modified: mar, published: may });
    const pageA = makePage("a", "Alpha", { created: jan, modified: mar, published: may });

    const sortFn = byDateAndAlphabetical();
    const pages = [pageZ, pageA].map((p) => withResolvedDateType(p, cfg)).sort(sortFn);

    expect(pages.at(0)?.slug).toBe("a");
    expect(pages.at(1)?.slug).toBe("z");
  });

  it("uses the correct date field based on defaultDateType", () => {
    const createdOld = makePage(
      "a",
      "A",
      { created: jan, modified: may, published: mar },
      "created",
    );
    const createdNew = makePage(
      "b",
      "B",
      { created: may, modified: jan, published: mar },
      "created",
    );

    const sortFn = byDateAndAlphabetical();
    const pages = [createdOld, createdNew].map((p) => withResolvedDateType(p, cfg)).sort(sortFn);

    expect(pages.at(0)?.slug).toBe("b");
    expect(pages.at(1)?.slug).toBe("a");
  });
});
