python -m http.server 8000

for cargo wasm to hit we need http server


to run everytime compile:

wasm-pack build --target web



to create template:

cargo install wasm-pack
cargo new retro_backend --lib
cd retro_backend

toml file :
edit 


[package]
name = "retro_backend"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
wasm-bindgen = "0.2"
