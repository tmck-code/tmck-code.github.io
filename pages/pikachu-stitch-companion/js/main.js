// main.js - wires the modules together and runs the bootstrap sequence in
// the same order as the original single-file script.

import { N } from './pattern.js';
import { load } from './persistence.js';
import { fit, draw, view, stage } from './render.js';
import './input.js';
import { refreshUI } from './ui.js';

load();

setTimeout(()=>{document.getElementById('zoomHint').style.opacity=0},3500);
fit(); refreshUI();
// center at start
view.tx=(stage.clientWidth-N*view.base)/2; view.ty=(stage.clientHeight-N*view.base)/2; draw();
