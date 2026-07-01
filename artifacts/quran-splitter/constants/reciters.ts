// Reference reciters for the "reference alignment" split method. Ids must match
// the api-server RECITERS editions (alquran.cloud verse-by-verse audio).
export interface Reciter {
  id: string;
  name: string;
  latinName: string;
}

export const RECITERS: Reciter[] = [
  { id: "ar.alafasy", name: "مشاري راشد العفاسي", latinName: "Mishary Rashid Alafasy" },
  { id: "ar.husary", name: "محمود خليل الحصري", latinName: "Mahmoud Khalil Al-Husary" },
  { id: "ar.husarymujawwad", name: "الحصري (المجوّد)", latinName: "Al-Husary (Mujawwad)" },
  { id: "ar.abdulsamad", name: "عبد الباسط عبد الصمد", latinName: "Abdul Basit Abdus-Samad" },
  { id: "ar.abdurrahmaansudais", name: "عبد الرحمن السديس", latinName: "Abdurrahman As-Sudais" },
  { id: "ar.shaatree", name: "أبو بكر الشاطري", latinName: "Abu Bakr Ash-Shatri" },
  { id: "ar.ahmedajamy", name: "أحمد بن علي العجمي", latinName: "Ahmed Al-Ajamy" },
  { id: "ar.mahermuaiqly", name: "ماهر المعيقلي", latinName: "Maher Al-Muaiqly" },
  { id: "ar.saoodshuraym", name: "سعود الشريم", latinName: "Saood Ash-Shuraym" },
  { id: "ar.hudhaify", name: "علي الحذيفي", latinName: "Ali Al-Hudhaify" },
  { id: "ar.hanirifai", name: "هاني الرفاعي", latinName: "Hani Ar-Rifai" },
  { id: "ar.muhammadayyoub", name: "محمد أيوب", latinName: "Muhammad Ayyoub" },
];

export const DEFAULT_RECITER = "ar.alafasy";
