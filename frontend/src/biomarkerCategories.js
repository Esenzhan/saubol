// Показатели группируются по ключевым словам в названии, а не по жёсткому
// списку — так группировка не ломается на новых показателях, которые
// извлечёт AI из будущих загруженных документов.
const CATEGORIES = [
  { label: "Общий анализ крови (ОАК)", re: /гемоглобин|эритроцит|тромбоцит|лейкоцит|нейтрофил|эозинофил|базофил|моноцит|лимфоцит|соэ|цветной показатель|гематокрит|\bmcv\b|\bmch\b|\bmchc\b|\brdw\b|\bmpv\b|\bpdw\b|p-lcr/i },
  { label: "Общий анализ мочи (ОАМ)", re: /\(моча\)|мочи|уробилиноген/i },
  { label: "Коагулограмма", re: /ачтв|\bмно\b|протромбин|тромбиновое время/i },
  { label: "Витамины и микроэлементы", re: /витамин|фолиевая кислота|\bb12\b|йод/i },
  { label: "Гормоны", re: /ттг|\bлг\b|фсг|пролактин|эстрадиол|тестостерон|гспг/i },
  { label: "Иммунология", re: /иммуноглобулин/i },
  { label: "Инфекции и серология", re: /igg|igm|iga|\(кп\)|гепатит|hbsag|антитела/i },
  { label: "Биохимия крови", re: /белок|мочевина|креатинин|глюкоза|кальций|магний|фосфор|железо|ферритин|\bалт\b|\bаст\b|билирубин|ггтп|щелочная фосфатаза|\bлдг\b|холестерин|триглицериды|амилаза|калий|хлориды|натрий|церулоплазмин|c-реактивный|ревматоидный|гликированный/i },
];

const OTHER_LABEL = "Другое";

export function getCategoryLabel(name) {
  const match = CATEGORIES.find((c) => c.re.test(name));
  return match ? match.label : OTHER_LABEL;
}

export function groupNamesByCategory(names) {
  const byLabel = new Map();
  for (const n of names) {
    const label = getCategoryLabel(n);
    if (!byLabel.has(label)) byLabel.set(label, []);
    byLabel.get(label).push(n);
  }
  const orderedLabels = [...CATEGORIES.map((c) => c.label), OTHER_LABEL];
  return orderedLabels.filter((label) => byLabel.has(label)).map((label) => ({ label, names: byLabel.get(label) }));
}
