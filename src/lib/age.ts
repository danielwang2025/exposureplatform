// Whole months between a YYYY-MM-DD birth date and today, split into years/months.
export function ageParts(birthDate: string, today = new Date()) {
  const [year, month, day] = birthDate.split("-").map(Number);
  let months = (today.getFullYear() - year) * 12 + (today.getMonth() + 1 - month);
  if (today.getDate() < day) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}
