// Keyboard and mouse, read every frame and held as state, plus the one-shot edges a menu
// needs. Nothing here knows what a car or a mission is: it only says what is pressed.

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function createInput(canvas) {
  const down = new Set();
  const pressed = new Set();     // keys that went down since the last frame
  const mouse = { x: 0, y: 0, dx: 0, dy: 0, down: false, clicked: false, wheel: 0 };
  const box = canvas.getBoundingClientRect();
  let boxDirty = true;

  function onKey(e, isDown) {
    const code = e.code;
    if (MOVE_KEYS.has(code) || code === 'Tab') e.preventDefault();
    if (isDown) {
      if (!down.has(code)) pressed.add(code);
      down.add(code);
    } else {
      down.delete(code);
    }
  }

  window.addEventListener('keydown', (e) => onKey(e, true), { passive: false });
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', () => { down.clear(); mouse.down = false; });
  window.addEventListener('resize', () => { boxDirty = true; });

  canvas.addEventListener('mousemove', (e) => {
    if (boxDirty) { const b = canvas.getBoundingClientRect(); box.x = b.x; box.y = b.y; box.width = b.width; box.height = b.height; boxDirty = false; }
    const nx = ((e.clientX - box.x) / box.width) * canvas.width;
    const ny = ((e.clientY - box.y) / box.height) * canvas.height;
    mouse.dx += nx - mouse.x;
    mouse.dy += ny - mouse.y;
    mouse.x = nx;
    mouse.y = ny;
  });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { mouse.down = true; mouse.clicked = true; } });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => { mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

  return {
    isDown(code) { return down.has(code); },
    /** True once, on the frame the key went down. */
    hit(code) { return pressed.has(code); },
    mouse,
    /** Movement as a unit-ish vector: forward is -y in screen space. */
    move() {
      let x = 0, y = 0;
      if (down.has('KeyA') || down.has('ArrowLeft')) x -= 1;
      if (down.has('KeyD') || down.has('ArrowRight')) x += 1;
      if (down.has('KeyW') || down.has('ArrowUp')) y -= 1;
      if (down.has('KeyS') || down.has('ArrowDown')) y += 1;
      const l = Math.hypot(x, y) || 1;
      return { x: x / l, y: y / l, len: Math.hypot(x, y) > 0 ? 1 : 0 };
    },
    run() { return down.has('ShiftLeft') || down.has('ShiftRight'); },
    handbrake() { return down.has('Space'); },
    fire() { return mouse.down; },
    firePressed() { return pressed.has('KeyJ') || pressed.has('Enter') || mouse.clicked; },
    /** Clears the one-shot edges; called once at the end of every frame. */
    endFrame() { pressed.clear(); mouse.clicked = false; mouse.wheel = 0; mouse.dx = 0; mouse.dy = 0; },
    flush() { down.clear(); pressed.clear(); },
  };
}
