export function toCsv(headers: string[], rows: Array<Array<string | number>>) {
  const escapeCell = (value: string | number) => {
    const raw = String(value ?? "");
    const text = shouldNeutralizeCsvCell(raw) ? `'${raw}` : raw;

    if (text.includes(",") || text.includes("\n") || text.includes("\"")) {
      return `"${text.replaceAll("\"", "\"\"")}"`;
    }

    return text;
  };

  const headerLine = headers.map(escapeCell).join(",");
  const rowLines = rows.map((row) => row.map(escapeCell).join(","));

  return [headerLine, ...rowLines].join("\n");
}

function shouldNeutralizeCsvCell(value: string) {
  if (!value) {
    return false;
  }

  const first = value[0];
  return first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r";
}
