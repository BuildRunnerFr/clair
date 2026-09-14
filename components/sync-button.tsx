"use client";

import { useTranslate } from "@/components/i18n-provider";

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

export function SyncButton() {
  const t = useTranslate();
  const { pending } = useFormStatus();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!pending) { setSlow(false); return; }
    const timer = window.setTimeout(() => setSlow(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return <span className="sync-control">
    <button className="primary" disabled={pending}>
      {/* « Synchroniser maintenant » ne tient pas au bout d'une ligne de banque sur un
          téléphone : le bouton passait alors sous le nom, et la ligne coûtait le double. */}
      <span className="nav-long">{pending ? t("sync.running") : t("sync.action")}</span>
      <span className="nav-short">{pending ? t("sync.runningShort") : t("sync.actionShort")}</span>
    </button>
    {slow && <small>{t("sync.slow")}</small>}
  </span>;
}
