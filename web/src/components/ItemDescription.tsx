import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { itemDetailByName } from "../lib/items";
import { PROPERTY_TEXT, propertyKey } from "../lib/weaponProperties";
import type { Item } from "../lib/types";
import { Markdown } from "./ui";

/** An item's rules text: its stats, description and what its weapon properties mean. */
export function ItemDescription({ item }: { item: Item }) {
  const { data, isLoading } = useQuery({
    queryKey: item.ref ? ["detail", "item", item.ref.source, item.ref.key] : ["itemByName", item.name.toLowerCase()],
    queryFn: () => (item.ref ? api.detail("item", item.ref.source, item.ref.key) : itemDetailByName(item.name)),
    staleTime: Infinity,
    retry: false,
    enabled: !!item.name,
  });
  if (isLoading) return <p className="text-xs text-ink-600">Looking it up…</p>;
  const meta = Object.entries(data?.meta ?? {}).filter(([k, v]) => v && k !== "Properties");
  const props = item.data?.weapon?.properties ?? [];
  const explained = [...new Set(props.map(propertyKey))].filter((k) => PROPERTY_TEXT[k]);
  if (!data && !explained.length) return <p className="text-xs text-ink-600">No description in the rules data{item.ref ? "" : " for this name"}.</p>;
  return (
    <div className="space-y-2 text-sm">
      {meta.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
          {meta.map(([k, v]) => <span key={k}><span className="text-ink-600">{k}</span> {v}</span>)}
        </div>
      )}
      {data?.description && <Markdown text={data.description} />}
      {explained.length > 0 && (
        <dl className="space-y-0.5 text-xs">
          {explained.map((k) => (
            <div key={k}>
              <dt className="inline font-semibold capitalize text-ink-200">{props.find((p) => propertyKey(p) === k)}.</dt>{" "}
              <dd className="inline text-ink-400">{PROPERTY_TEXT[k]}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
