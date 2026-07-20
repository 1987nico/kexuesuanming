/**
 * 天赋原型 / 特质的中英文名称统一：
 * - original-sync 模式下 PrinciplesYou 返回英文 display_name；
 * - local 模式下已是中文；
 * 报告展示统一为「中文 / English」。
 */

import { zhArchetypeNameByKey, zhName } from "./principlesyouLocal";

function isAscii(text: string) {
  return /^[\x20-\x7e]*$/.test(text);
}

function capitalizeKey(key: string) {
  return key.charAt(0).toUpperCase() + key.slice(1);
}

/** 中文名（找不到映射时退回原名） */
export function traitZhName(key: string, name: string) {
  if (!isAscii(name)) return name;
  return zhName(key, name);
}

export function archetypeZhName(key: string, name: string) {
  if (!isAscii(name)) return name;
  return zhArchetypeNameByKey(key, name);
}

/** 英文名（原名是英文就用原名，否则用 key 首字母大写） */
export function englishName(key: string, name: string) {
  return isAscii(name) ? name : capitalizeKey(key);
}

/** 「中文 / English」展示；中英文相同（没有映射）时只显示一个 */
export function traitDisplayLabel(key: string, name: string) {
  const zh = traitZhName(key, name);
  const en = englishName(key, name);
  return zh === en ? zh : `${zh} / ${en}`;
}

export function archetypeDisplayLabel(key: string, name: string) {
  const zh = archetypeZhName(key, name);
  const en = englishName(key, name);
  return zh === en ? zh : `${zh} / ${en}`;
}
