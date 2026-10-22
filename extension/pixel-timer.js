(() => {
  const glyphs = {
    '0': ['01110','10001','10011','10101','11001','10001','01110'],
    '1': ['00100','01100','00100','00100','00100','00100','01110'],
    '2': ['01110','10001','00001','00010','00100','01000','11111'],
    '3': ['11110','00001','00001','01110','00001','00001','11110'],
    '4': ['00010','00110','01010','10010','11111','00010','00010'],
    '5': ['11111','10000','10000','11110','00001','00001','11110'],
    '6': ['01110','10000','10000','11110','10001','10001','01110'],
    '7': ['11111','00001','00010','00100','01000','01000','01000'],
    '8': ['01110','10001','10001','01110','10001','10001','01110'],
    '9': ['01110','10001','10001','01111','00001','00001','01110'],
    ':': ['0','1','0','0','1','0','0'],
    'A': ['01110','10001','10001','11111','10001','10001','10001'],
    'B': ['11110','10001','10001','11110','10001','10001','11110'],
    'C': ['01111','10000','10000','10000','10000','10000','01111'],
    'D': ['11110','10001','10001','10001','10001','10001','11110'],
    'E': ['11111','10000','10000','11110','10000','10000','11111'],
    'F': ['11111','10000','10000','11110','10000','10000','10000'],
    'G': ['01111','10000','10000','10111','10001','10001','01111'],
    'H': ['10001','10001','10001','11111','10001','10001','10001'],
    'I': ['01110','00100','00100','00100','00100','00100','01110'],
    'J': ['00111','00010','00010','00010','00010','10010','01100'],
    'K': ['10001','10010','10100','11000','10100','10010','10001'],
    'L': ['10000','10000','10000','10000','10000','10000','11111'],
    'M': ['10001','11011','10101','10101','10001','10001','10001'],
    'N': ['10001','11001','10101','10011','10001','10001','10001'],
    'O': ['01110','10001','10001','10001','10001','10001','01110'],
    'P': ['11110','10001','10001','11110','10000','10000','10000'],
    'Q': ['01110','10001','10001','10001','10101','10010','01101'],
    'R': ['11110','10001','10001','11110','10100','10010','10001'],
    'S': ['01111','10000','10000','01110','00001','00001','11110'],
    'T': ['11111','00100','00100','00100','00100','00100','00100'],
    'U': ['10001','10001','10001','10001','10001','10001','01110'],
    'V': ['10001','10001','10001','10001','10001','01010','00100'],
    'W': ['10001','10001','10001','10101','10101','10101','01010'],
    'X': ['10001','10001','01010','00100','01010','10001','10001'],
    'Y': ['10001','10001','01010','00100','00100','00100','00100'],
    'Z': ['11111','00001','00010','00100','01000','10000','11111'],
  };

  function drawPixelGlyphs(element, value, scale, color, ariaLabel) {
    if (!element) return;
    if (!value) {
      element.replaceChildren();
      element.setAttribute('aria-label', 'Timer is not running');
      return;
    }
    const text = String(value);
    let canvas = element.querySelector('canvas');
    let label = element.querySelector('.pixel-timer-label');
    if (!canvas || !label) {
      canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      label = document.createElement('span');
      label.className = 'pixel-timer-label';
      label.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
      element.replaceChildren(canvas, label);
    }
    const chars = [...text];
    const columns = chars.reduce((sum, char) => sum + (char === ':' ? 1 : 5) + 1, -1);
    canvas.width = Math.max(1, columns * scale);
    canvas.height = 7 * scale;
    canvas.style.cssText = `display:block;width:${canvas.width}px;height:${canvas.height}px;image-rendering:pixelated`;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = color;
    let x = 0;
    for (const char of chars) {
      const rows = glyphs[char];
      if (!rows) continue;
      for (let y = 0; y < rows.length; y++) {
        for (let bit = 0; bit < rows[y].length; bit++) {
          if (rows[y][bit] === '1') context.fillRect((x + bit) * scale, y * scale, scale, scale);
        }
      }
      x += rows[0].length + 1;
    }
    label.textContent = text;
    element.setAttribute('aria-label', ariaLabel || `${text} remaining`);
  }

  window.pomiberryDrawPixelTimer = (element, value, scale = 4, color = '#982944') =>
    drawPixelGlyphs(element, value, scale, color, value ? `${value} remaining` : 'Timer is not running');
  window.pomiberryDrawPixelText = (element, value, scale = 2, color = '#8f2942') =>
    drawPixelGlyphs(element, String(value || '').toUpperCase(), scale, color, value || 'POMIBERRY');
})();
