class TrieNode {
  constructor() {
    this.children = new Map();
    this.isEnd = false;
    this.names = [];
  }
}

export class PatientTrie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(name) {
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed) return;

    let current = this.root;
    for (const char of trimmed.toLowerCase()) {
      if (!current.children.has(char)) {
        current.children.set(char, new TrieNode());
      }
      current = current.children.get(char);
    }
    current.isEnd = true;
    if (!current.names.some(n => n.toLowerCase() === trimmed.toLowerCase())) {
      current.names.push(trimmed);
    }
  }

  suggest(prefix, limit = 8) {
    if (!prefix || typeof prefix !== 'string') return [];
    const trimmed = prefix.trim().toLowerCase();
    if (!trimmed) return [];

    let current = this.root;
    for (const char of trimmed) {
      if (!current.children.has(char)) {
        return [];
      }
      current = current.children.get(char);
    }

    const results = new Set();
    this._collect(current, results, limit);
    return Array.from(results).slice(0, limit);
  }

  _collect(node, results, limit) {
    if (results.size >= limit) return;

    if (node.isEnd) {
      for (const name of node.names) {
        results.add(name);
        if (results.size >= limit) return;
      }
    }

    const sortedKeys = Array.from(node.children.keys()).sort();
    for (const key of sortedKeys) {
      this._collect(node.children.get(key), results, limit);
      if (results.size >= limit) return;
    }
  }
}
