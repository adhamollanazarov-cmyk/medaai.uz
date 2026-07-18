// Single source of truth for specialties (RU + UZ names) and their trigger keywords.
// Keywords cover Russian and Uzbek (latin) plus common transliterations.
// Matching is substring-based on a normalised lowercase string, so partial stems work
// (e.g. "zub" matches "zubi", "zubnoy"; "tish" matches "tishim").

export const SPECIALTIES = [
  {
    code: 'therapist',
    name_ru: 'Терапевт',
    name_uz: 'Terapevt',
    emoji: '🩺',
    keywords: ['температур', 'слабост', 'простуд', 'орви', 'грипп', 'озноб', 'ломота',
      'harorat', 'shamollash', 'zaiflik', 'gripp', 'isitma', 'umumiy'],
  },
  {
    code: 'dentist',
    name_ru: 'Стоматолог',
    name_uz: 'Stomatolog',
    emoji: '🦷',
    keywords: ['зуб', 'десн', 'кариес', 'эмал', 'пломб', 'челюст',
      'tish', 'milk', 'kariyes', 'jag', 'ogʻiz', 'ogiz'],
  },
  {
    code: 'cardiologist',
    name_ru: 'Кардиолог',
    name_uz: 'Kardiolog',
    emoji: '❤️',
    keywords: ['сердц', 'давлен', 'пульс', 'аритм', 'одышк', 'груд', 'тахикард',
      'yura', 'bosim', 'puls', 'nafas', 'koʻkrak', 'kokrak'],
  },
  {
    code: 'dermatologist',
    name_ru: 'Дерматолог',
    name_uz: 'Dermatolog',
    emoji: '🧴',
    keywords: ['кож', 'сыпь', 'зуд', 'прыщ', 'акне', 'экзем', 'родинк', 'аллерг',
      'teri', 'toshma', 'qichish', 'husnbuzar', 'allergi'],
  },
  {
    code: 'gastroenterologist',
    name_ru: 'Гастроэнтеролог',
    name_uz: 'Gastroenterolog',
    emoji: '🫃',
    keywords: ['живот', 'желуд', 'тошнот', 'изжог', 'кишеч', 'стул', 'печен', 'гастрит',
      'qorin', 'oshqozon', 'koʻngil aynish', 'kongil', 'ich', 'jigar'],
  },
  {
    code: 'neurologist',
    name_ru: 'Невролог',
    name_uz: 'Nevrolog',
    emoji: '🧠',
    keywords: ['голов', 'мигрен', 'головокруж', 'онемен', 'невралг', 'бессонн', 'судорог',
      'bosh', 'migren', 'aylanish', 'uyqu', 'uvishish'],
  },
  {
    code: 'ent',
    name_ru: 'ЛОР (отоларинголог)',
    name_uz: 'LOR (otolaringolog)',
    emoji: '👂',
    keywords: ['горл', 'ухо', 'уш', 'насморк', 'нос', 'кашел', 'гайморит', 'ангин', 'глот',
      'tomoq', 'quloq', 'burun', 'yoʻtal', 'yotal', 'tumov', 'angina'],
  },
  {
    code: 'ophthalmologist',
    name_ru: 'Офтальмолог',
    name_uz: 'Oftalmolog',
    emoji: '👁️',
    keywords: ['глаз', 'зрен', 'видит', 'близорук', 'дальнозор', 'слезот',
      'koʻz', 'koz', 'koʻrish', 'korish'],
  },
  {
    code: 'pediatrician',
    name_ru: 'Педиатр',
    name_uz: 'Pediatr',
    emoji: '🧒',
    keywords: ['ребен', 'ребёнок', 'детск', 'малыш', 'грудничок', 'младенц',
      'bola', 'bolam', 'chaqaloq', 'goʻdak', 'godak'],
  },
  {
    code: 'orthopedist',
    name_ru: 'Ортопед-травматолог',
    name_uz: 'Ortoped-travmatolog',
    emoji: '🦴',
    keywords: ['спин', 'сустав', 'колен', 'перелом', 'вывих', 'позвоноч', 'кост', 'растяжен', 'плеч',
      'bel', 'boʻgʻim', 'bogim', 'tizza', 'singan', 'suyak', 'yelka'],
  },
  {
    code: 'gynecologist',
    name_ru: 'Гинеколог',
    name_uz: 'Ginekolog',
    emoji: '🌸',
    keywords: ['беремен', 'месячн', 'гинеколог', 'выделен', 'цикл', 'яичник', 'матк',
      'homilador', 'hayz', 'ginekolog', 'bachadon'],
  },
  {
    code: 'urologist',
    name_ru: 'Уролог',
    name_uz: 'Urolog',
    emoji: '💧',
    keywords: ['мочеиспуск', 'почк', 'урин', 'простат', 'мочев', 'пузыр',
      'siydik', 'buyrak', 'prostata', 'qovuq'],
  },
  {
    code: 'endocrinologist',
    name_ru: 'Эндокринолог',
    name_uz: 'Endokrinolog',
    emoji: '🧬',
    keywords: ['щитовид', 'сахар', 'диабет', 'гормон', 'вес', 'похуд', 'полнот',
      'qalqonsimon', 'qand', 'diabet', 'gormon', 'vazn'],
  },
  {
    code: 'psychotherapist',
    name_ru: 'Психотерапевт',
    name_uz: 'Psixoterapevt',
    emoji: '🫶',
    keywords: ['тревог', 'депресс', 'паник', 'стресс', 'настроен', 'бессонниц', 'выгоран',
      'xavotir', 'depressiya', 'stress', 'kayfiyat', 'panika'],
  },
];

export const SPECIALTY_BY_CODE = Object.fromEntries(SPECIALTIES.map((s) => [s.code, s]));

export function specialtyName(code, lang = 'ru') {
  const s = SPECIALTY_BY_CODE[code];
  if (!s) return code;
  return lang === 'uz' ? s.name_uz : s.name_ru;
}
