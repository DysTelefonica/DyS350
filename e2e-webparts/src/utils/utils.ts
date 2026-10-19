export const groupByCount = (items: any[], key: string) =>
  items.reduce<Record<string, number>>((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1;
    return acc;
  }, {});

export function formatDate(isoDate: string) {
  const date = new Date(isoDate);
  // @ts-ignore
  const day = String(date.getDate()).padStart(2, "0");
  // @ts-ignore
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();

  return `${day}/${month}/${year}`;
}
