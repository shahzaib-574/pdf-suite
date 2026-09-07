export const OCR_LANGUAGES = [
  {id:'eng',label:'English'},
  {id:'urd+eng',label:'Urdu + English'},
  {id:'ara+eng',label:'Arabic + English'},
] as const;
export type OcrLanguage = typeof OCR_LANGUAGES[number]['id'];
export function ocrLanguageLabel(language: OcrLanguage): string {
  return OCR_LANGUAGES.find(item => item.id === language)?.label ?? 'English';
}
