// Portrait dimensions in PDF points (72 points per inch).
export const PAPER_SIZES = {
  a3: { label: "A3", width: 841.89, height: 1190.55 },
  a4: { label: "A4", width: 595.28, height: 841.89 },
  a5: { label: "A5", width: 419.53, height: 595.28 },
  a6: { label: "A6", width: 297.64, height: 419.53 },
  letter: { label: "US Letter", width: 612, height: 792 },
  legal: { label: "US Legal", width: 612, height: 1008 },
  tabloid: { label: "Tabloid", width: 792, height: 1224 },
} as const;
