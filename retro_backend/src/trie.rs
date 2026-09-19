use std::collections::{BTreeSet, HashMap};

#[derive(Default, Debug)]
pub struct TrieNode {
    children: HashMap<char, TrieNode>,
    is_end: bool,
    names: Vec<String>, // Stores original casing of patient names
}

#[derive(Default, Debug)]
pub struct PatientTrie {
    root: TrieNode,
}

impl PatientTrie {
    pub fn new() -> Self {
        Self {
            root: TrieNode::default(),
        }
    }

    /// Insert a patient name into the Trie (case-insensitive indexing, preserves canonical display name)
    pub fn insert(&mut self, name: &str) {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return;
        }

        let mut current = &mut self.root;
        for ch in trimmed.chars().flat_map(|c| c.to_lowercase()) {
            current = current.children.entry(ch).or_default();
        }
        current.is_end = true;
        if !current.names.iter().any(|n| n.eq_ignore_ascii_case(trimmed)) {
            current.names.push(trimmed.to_string());
        }
    }

    /// Suggest patient names starting with the given prefix (case-insensitive)
    pub fn suggest(&self, prefix: &str, limit: usize) -> Vec<String> {
        let trimmed = prefix.trim();
        if trimmed.is_empty() {
            return Vec::new();
        }

        let mut current = &self.root;
        for ch in trimmed.chars().flat_map(|c| c.to_lowercase()) {
            if let Some(next) = current.children.get(&ch) {
                current = next;
            } else {
                return Vec::new();
            }
        }

        // Collect matching names up to the limit using DFS
        let mut results = BTreeSet::new();
        Self::collect_names(current, &mut results, limit);

        results.into_iter().take(limit).collect()
    }

    fn collect_names(node: &TrieNode, results: &mut BTreeSet<String>, limit: usize) {
        if results.len() >= limit {
            return;
        }

        if node.is_end {
            for name in &node.names {
                results.insert(name.clone());
                if results.len() >= limit {
                    return;
                }
            }
        }

        // Traverse children deterministically
        let mut sorted_keys: Vec<_> = node.children.keys().copied().collect();
        sorted_keys.sort_unstable();

        for ch in sorted_keys {
            if let Some(child) = node.children.get(&ch) {
                Self::collect_names(child, results, limit);
                if results.len() >= limit {
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trie_insert_and_suggest() {
        let mut trie = PatientTrie::new();
        trie.insert("Alice Smith");
        trie.insert("Alan Walker");
        trie.insert("Bob Marley");
        trie.insert("alice johnson");

        let al_matches = trie.suggest("al", 10);
        assert_eq!(al_matches.len(), 3);
        assert!(al_matches.contains(&"Alan Walker".to_string()));
        assert!(al_matches.contains(&"Alice Smith".to_string()));
        assert!(al_matches.contains(&"alice johnson".to_string()));

        let bob_matches = trie.suggest("BOB", 5);
        assert_eq!(bob_matches, vec!["Bob Marley".to_string()]);

        let empty = trie.suggest("xyz", 5);
        assert!(empty.is_empty());
    }
}
