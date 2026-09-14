"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isLocale } from "@/lib/i18n/catalogue";
import { LOCALE_COOKIE } from "@/lib/i18n/server";

/**
 * Enregistre la langue choisie.
 *
 * Dans un cookie et non en base : la langue est une préférence d'affichage, pas une donnée de
 * compte. Elle doit valoir avant même d'être connecté — l'écran de connexion se lit dans une
 * langue lui aussi — et un appareil partagé peut légitimement en vouloir une autre.
 *
 * Un an de durée de vie, sans lecture par le navigateur : rien côté client n'a besoin de la
 * connaître, tout le rendu se décide sur le serveur.
 */
export async function setLocale(formData: FormData) {
  const chosen = formData.get("locale");
  if (!isLocale(chosen)) return;
  (await cookies()).set(LOCALE_COOKIE, chosen, {
    path: "/",
    maxAge: 31_536_000,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production"
  });
  // Toutes les pages sont rendues sur le serveur : sans cette invalidation, celles déjà en cache
  // resteraient dans l'ancienne langue jusqu'à leur prochaine régénération.
  revalidatePath("/", "layout");
}
