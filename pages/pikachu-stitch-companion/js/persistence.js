// persistence.js - localStorage save/load of stitching progress.
// load() is exported but NOT invoked here; main.js calls it at bootstrap.

import { COLORS, CELL_COUNT, F_STITCHED, F_OMITTED } from './pattern.js';
import { state, DEFAULT_SETTINGS, colourAt } from './state.js';
import { refreshUI } from './ui.js';
import { draw } from './render.js';

export const STORE_KEY = 'pikachu-stitch-companion/v1';
let saveTimer = null;
export function markDirty(){
  state.dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 500);
}
export function encodeFlags(){
  let out = '';
  const CHUNK = 0x8000;
  for (let i=0;i<state.stitchFlags.length;i+=CHUNK){
    out += String.fromCharCode.apply(null, state.stitchFlags.subarray(i, i+CHUNK));
  }
  return btoa(out);
}
export function decodeFlags(str){
  const bin = atob(str);
  const arr = new Uint8Array(bin.length);
  for (let i=0;i<bin.length;i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
export function save(){
  try{
    const data = {
      v: 2,
      flags: encodeFlags(),
      log: state.journey,
      settings: state.settings,
      startPoints: state.startPoints,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    state.dirty = false;
  }catch(e){ /* ignore quota / serialization errors */ }
}
// v1 saves have no missed/omitted bits set, so the same rebuild works for
// both schema versions — the counts simply come out zero.
export function rebuildStitchedCount(){
  state.stitchedCount = new Int32Array(COLORS.length+1);
  state.omittedCount = new Int32Array(COLORS.length+1);
  for (let i=0;i<CELL_COUNT;i++){
    const v = colourAt(i);
    if (!v) continue;
    if (state.stitchFlags[i] & F_STITCHED) state.stitchedCount[v]++;
    if (state.stitchFlags[i] & F_OMITTED) state.omittedCount[v]++;
  }
}
export function freshState(){
  state.stitchFlags = new Uint8Array(CELL_COUNT);
  state.stitchedCount = new Int32Array(COLORS.length+1);
  state.omittedCount = new Int32Array(COLORS.length+1);
  state.journey = [];
  state.settings = Object.assign({}, DEFAULT_SETTINGS);
  state.startPoints = {};
}
export function load(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) { freshState(); return; }
    const data = JSON.parse(raw);
    if (!data || (data.v !== 1 && data.v !== 2)) { freshState(); return; }
    const flags = decodeFlags(data.flags);
    if (flags.length !== CELL_COUNT) { freshState(); return; }
    state.stitchFlags = flags;
    state.journey = Array.isArray(data.log) ? data.log : [];
    state.settings = Object.assign({}, DEFAULT_SETTINGS, data.settings||{});
    state.startPoints = data.startPoints || {};
    rebuildStitchedCount();
  }catch(e){
    freshState();
  }
}
export function resetProgress(){
  if (!confirm('Reset all stitching progress? This cannot be undone.')) return;
  try{ localStorage.removeItem(STORE_KEY); }catch(e){}
  freshState();
  refreshUI(); draw();
}
document.addEventListener('visibilitychange', ()=>{
  if (document.visibilityState==='hidden' && state.dirty){
    if (saveTimer) clearTimeout(saveTimer);
    save();
  }
});
