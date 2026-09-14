"use client";
import { Select } from "@/components/select";
import { useId, useState } from "react";
import { CATEGORY_TAXONOMY, CATEGORY_NAMES, type CategoryName } from "@/lib/categories/taxonomy";
import { categoryLabel, subcategoryLabel } from "@/lib/categories/labels";
import { useIntlLocale, useTranslate } from "@/components/i18n-provider";
export function ClassificationPicker({ category, subcategory }: { category: string; subcategory: string }) {
  const locale = useIntlLocale();
  const t = useTranslate();
  const id = useId();
  const initial = CATEGORY_NAMES.includes(category as CategoryName) ? category as CategoryName : "Uncategorized";
  const [selected, setSelected] = useState<CategoryName>(initial);
  const [sub, setSub] = useState((CATEGORY_TAXONOMY[initial] as readonly string[]).includes(subcategory) ? subcategory : "Other");
  return <div className="classification-picker">
    <input type="hidden" name="classification" value={`${selected}|${sub}`}/>
    <Select name={`${id}-category`} label={t("common.category")} value={selected}
      onChange={(valeur) => { setSelected(valeur as CategoryName); setSub("Other"); }}
      options={CATEGORY_NAMES.map((name) => ({ value: name, label: categoryLabel(name, locale) }))} />
    <Select name={`${id}-subcategory`} label={t("transactions.subcategory")} value={sub}
      onChange={(valeur) => setSub(valeur)}
      options={CATEGORY_TAXONOMY[selected].map((name) => ({ value: name, label: subcategoryLabel(name, locale) }))} />
  </div>;
}
