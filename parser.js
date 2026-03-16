function parseTextOutput(output) {
  let text = '';
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const json = JSON.parse(trimmed);
      if (json.type === 'text' && json.part?.text) {
        const partText = json.part.text;
        try {
          const inner = JSON.parse(partText.trim());
          if (inner.jsonrpc === '2.0' && inner.method?.startsWith('tools/')) continue;
        } catch {}
        text += partText;
      }
    } catch {}
  }
  return text;
}

function parseToolCalls(output) {
  const seen = new Set();
  const calls = [];

  const tryAdd = (candidate) => {
    const trimmed = candidate.trim();
    if (!trimmed) return;
    try {
      const json = JSON.parse(trimmed);
      if (json.jsonrpc === '2.0' && json.method?.startsWith('tools/') && json.params) {
        const key = `${json.id}:${json.method}`;
        if (!seen.has(key)) {
          seen.add(key);
          calls.push({ id: json.id, method: json.method, params: json.params });
        }
      }
    } catch {}
  };

  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const json = JSON.parse(trimmed);
      if (json.type === 'text' && json.part?.text) {
        for (const inner of json.part.text.split('\n')) tryAdd(inner);
      } else {
        tryAdd(trimmed);
      }
    } catch {
      tryAdd(trimmed);
    }
  }

  return calls;
}

export { parseTextOutput, parseToolCalls };
