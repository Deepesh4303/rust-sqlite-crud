use wasm_bindgen::prelude::*;
use std::collections::HashMap;

#[wasm_bindgen]
pub struct InMemoryDB {
    store: HashMap<String, String>,
}

#[wasm_bindgen]
impl InMemoryDB {
    #[wasm_bindgen(constructor)]
    pub fn new() -> InMemoryDB {
        InMemoryDB { store: HashMap::new() }
    }

    pub fn insert(&mut self, key: String, value: String) {
        self.store.insert(key, value);
    }

    pub fn get(&self, key: String) -> Option<String> {
        self.store.get(&key).cloned()
    }
}
