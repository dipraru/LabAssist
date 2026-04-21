export type ParticipantImportRow = {
  name: string;
  universityName: string;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error('CSV contains an unclosed quote');
  }

  cells.push(current.trim());
  return cells;
}

function isHeaderRow(row: string[]) {
  const first = row[0]?.toLowerCase().replace(/\s+/g, ' ').trim();
  const second = row[1]?.toLowerCase().replace(/\s+/g, ' ').trim();
  return (
    ['name', 'participant name', 'full name'].includes(first) &&
    ['university', 'university name', 'institution'].includes(second)
  );
}

export function parseParticipantCsv(rawText: string): ParticipantImportRow[] {
  const lines = rawText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    throw new Error('Add at least one participant row');
  }

  const rows = lines.map(parseCsvLine);
  const dataRows = isHeaderRow(rows[0]) ? rows.slice(1) : rows;

  if (!dataRows.length) {
    throw new Error('CSV file has no participant rows');
  }

  if (dataRows.length > 200) {
    throw new Error('Maximum 200 participants are allowed per batch');
  }

  return dataRows.map((row, index) => {
    if (row.length !== 2) {
      throw new Error(`Row ${index + 1} must contain exactly two columns: participant name, university name`);
    }

    const name = row[0].trim();
    const universityName = row[1].trim();
    if (!name || !universityName) {
      throw new Error(`Row ${index + 1} must include both participant name and university name`);
    }

    return { name, universityName };
  });
}
