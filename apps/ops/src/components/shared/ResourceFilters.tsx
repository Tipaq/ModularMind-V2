import { ArrowUpDown, Search } from "lucide-react";
import { Input, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@modularmind/ui";
import type { ResourceFilterConfig } from "@modularmind/ui";

interface ResourceFiltersProps {
  filters: ResourceFilterConfig[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function ResourceFilters({ filters, values, onChange }: ResourceFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {filters.map((filter) => {
        if (filter.type === "search") {
          return (
            <div key={filter.key} className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={values[filter.key] || ""}
                onChange={(e) => onChange(filter.key, e.target.value)}
                placeholder={filter.placeholder || "Search..."}
                className="pl-9"
              />
            </div>
          );
        }

        if (filter.type === "select" && filter.options) {
          const allOptions = [
            { value: "", label: filter.placeholder || filter.label },
            ...filter.options,
          ];
          return (
            <div key={filter.key} className="w-[160px]">
              <Select value={values[filter.key] || ""} onValueChange={(v) => onChange(filter.key, v)}>
                <SelectTrigger>
                  <SelectValue placeholder={filter.placeholder || filter.label} />
                </SelectTrigger>
                <SelectContent>
                  {allOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value || "__all__"}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        if (filter.type === "sort" && filter.options) {
          const allOptions = [
            { value: "", label: filter.placeholder || "Sort by" },
            ...filter.options,
          ];
          return (
            <div key={filter.key} className="flex items-center gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Select value={values[filter.key] || ""} onValueChange={(v) => onChange(filter.key, v)}>
                <SelectTrigger>
                  <SelectValue placeholder={filter.placeholder || "Sort by"} />
                </SelectTrigger>
                <SelectContent>
                  {allOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value || "__all__"}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}
