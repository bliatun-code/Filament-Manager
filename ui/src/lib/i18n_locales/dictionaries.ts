import type { DictionaryNode, Locale } from "../i18n_types";
import { enDictionary } from "./locales/en";
import { nbDictionary } from "./locales/nb";

export const dictionaries: Record<Locale, DictionaryNode> = {
  en: enDictionary,
  nb: nbDictionary,
};
