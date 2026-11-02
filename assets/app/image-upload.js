/* Shared, local-only image preparation. Existing uploads are never rewritten. */
(function (global) {
  'use strict';
  const profiles = {
    order: { edge: 2600, longEdge: 8000, shortEdge: 1300, pixels: 6000000, bytes: 950000, quality: .92, minimum: .68, background: '#fff' },
    memory: { edge: 1600, pixels: 2600000, bytes: 240000, quality: .86, minimum: .6, background: '#f4efe4' },
    reference: { edge: 2400, pixels: 5800000, bytes: 750000, quality: .88, minimum: .62, background: '#fff' }
  };
  const INPUT_BYTES = 80 * 1024 * 1024, INPUT_PIXELS = 160000000;
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const size = bytes => bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.max(1, Math.round(bytes / 1024)) + ' KB';
  let queue = Promise.resolve();
  function fit(width, height, profile) {
    let ratio = Math.min(1, profile.edge / Math.max(width, height), Math.sqrt(profile.pixels / (width * height)));
    // Keep the width of long receipts legible instead of squeezing all text into a short thumbnail.
    if (profile.longEdge && Math.max(width, height) / Math.min(width, height) > 2.5) ratio = Math.min(1, profile.longEdge / Math.max(width, height), profile.shortEdge / Math.min(width, height), Math.sqrt(profile.pixels / (width * height)));
    return { width: Math.max(1, Math.round(width * ratio)), height: Math.max(1, Math.round(height * ratio)) };
  }
  function exifOrientation(bytes, start, length) {
    try {
      if (length < 14 || String.fromCharCode(...bytes.subarray(start, start + 6)) !== 'Exif\0\0') return 1;
      const t = start + 6, view = new DataView(bytes.buffer, bytes.byteOffset + t, length - 6), le = view.getUint16(0) === 0x4949;
      if (view.getUint16(2, le) !== 42) return 1;
      const offset = view.getUint32(4, le), count = Math.min(view.getUint16(offset, le), 256);
      for (let n = 0; n < count; n++) { const p = offset + 2 + n * 12; if (view.getUint16(p, le) === 0x112) { const v = view.getUint16(p + 8, le); return v >= 1 && v <= 8 ? v : 1; } }
    } catch (_) {} return 1;
  }
  async function header(file) {
    const bytes = new Uint8Array(await file.slice(0, 512 * 1024).arrayBuffer()), v = new DataView(bytes.buffer);
    if (bytes.length < 12) return null;
    if (v.getUint32(0) === 0x89504e47 && v.getUint32(4) === 0x0d0a1a0a && bytes.length >= 24) return { width: v.getUint32(16), height: v.getUint32(20), format: 'png' };
    if (String.fromCharCode(...bytes.subarray(0, 3)) === 'GIF') return { width: v.getUint16(6, true), height: v.getUint16(8, true), format: 'gif' };
    if (bytes[0] === 255 && bytes[1] === 216) {
      let i = 2, orientation = 1, dimensions = null;
      while (i + 4 < bytes.length) {
        if (bytes[i] !== 255) break;
        while (bytes[i] === 255) i++;
        const marker = bytes[i++]; if (marker === 0xda || marker === 0xd9) break;
        if (marker >= 0xd0 && marker <= 0xd7 || marker === 1) continue;
        const length = v.getUint16(i); if (length < 2 || i + length > bytes.length) break;
        if (marker === 0xe1) orientation = exifOrientation(bytes, i + 2, length - 2);
        if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 7) dimensions = { width: v.getUint16(i + 5), height: v.getUint16(i + 3), format: 'jpeg' };
        i += length;
      }
      if (dimensions && orientation >= 5) [dimensions.width, dimensions.height] = [dimensions.height, dimensions.width];
      return dimensions;
    }
    if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 16)) === 'WEBPVP8X' && bytes.length >= 30) return { width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16), format: 'webp' };
    return null;
  }
  function checkDimensions(width, height) {
    if (!width || !height || !Number.isFinite(width * height)) throw Error('图片没有有效尺寸或文件已损坏。');
    if (width * height > INPUT_PIXELS) throw Error('图片超过 1.6 亿像素，超出此浏览器页面的处理范围。请导出较小副本后添加。');
  }
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), image = new Image(); let settled = false;
      const release = () => { image.onload = null; image.onerror = null; image.src = ''; URL.revokeObjectURL(url); };
      const timer = setTimeout(() => { if (settled) return; settled = true; release(); reject(Error('图片读取超时，请重试或换用 JPG / PNG 副本。')); }, 45000);
      image.onload = () => { if (settled) return; settled = true; clearTimeout(timer); resolve({ image, release, width: image.naturalWidth, height: image.naturalHeight }); };
      image.onerror = () => { if (settled) return; settled = true; clearTimeout(timer); release(); reject(Error(/heic|heif/i.test(file.type + ' ' + file.name) ? '浏览器无法读取这张 HEIC / HEIF 照片，请导出 JPG 副本后添加。' : '图片格式无法读取或文件已损坏，请换用 JPG、PNG 或 WebP。')); };
      image.src = url;
    });
  }
  async function decode(file, profile) {
    const info = await header(file);
    let loaded = null;
    try {
      let width = info?.width, height = info?.height;
      if (!info) { loaded = await loadImage(file); ({ width, height } = loaded); }
      checkDimensions(width, height);
      const target = fit(width, height, profile);
      if (typeof global.createImageBitmap === 'function') {
        try {
          const bitmap = await global.createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' });
          loaded?.release(); loaded = null;
          return { image: bitmap, width, height, target, release: () => bitmap.close() };
        } catch (_) { /* Some browsers cannot resize this codec in the bitmap decoder. */ }
      }
      if (!loaded) loaded = await loadImage(file);
      checkDimensions(loaded.width, loaded.height);
      return { image: loaded.image, width: loaded.width, height: loaded.height, target: fit(loaded.width, loaded.height, profile), release: loaded.release };
    } catch (e) { loaded?.release(); throw e; }
  }
  const encode = (canvas, quality) => new Promise((resolve, reject) => canvas.toBlob(blob => blob && blob.type === 'image/jpeg' ? resolve(blob) : reject(Error('浏览器未能生成压缩图片，请关闭其他大型页面后重试。')), 'image/jpeg', quality));
  const dataURL = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('无法读取压缩结果。')); reader.readAsDataURL(blob); });
  async function prepare(file, options) {
    const profile = profiles[options.profile || 'reference'];
    if (!profile) throw Error('不支持的图片用途。');
    if (!(file instanceof Blob) || !file.size) throw Error('图片为空，请重新选择。');
    if (file.size > INPUT_BYTES) throw Error('单张图片超过 80 MB，请导出较小副本后添加。');
    if (/svg|xml/i.test(file.type) || /\.svg$/i.test(file.name || '') || file.type && !file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name || '')) throw Error('请选择照片或截图（JPG、PNG、WebP、GIF、AVIF）。');
    const progress = message => options.onProgress?.(message);
    progress('正在读取并缩小图片…'); await tick();
    let source, canvas;
    try {
      source = await decode(file, profile);
      canvas = document.createElement('canvas');
      let { width, height } = source.target, blob, quality;
      for (let pass = 0; pass < 10; pass++) {
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d'); if (!ctx) throw Error('此浏览器暂不能处理图片，请换浏览器重试。');
        ctx.fillStyle = profile.background; ctx.fillRect(0, 0, width, height); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source.image, 0, 0, width, height);
        progress(pass ? '正在进一步缩小，保留完整画面…' : '正在压缩图片…'); await tick();
        quality = profile.quality; blob = await encode(canvas, quality);
        if (blob.size <= profile.bytes) break;
        const low = await encode(canvas, profile.minimum);
        if (low.size <= profile.bytes) {
          let left = profile.minimum, right = profile.quality; blob = low; quality = left;
          for (let i = 0; i < 4; i++) { const q = (left + right) / 2, candidate = await encode(canvas, q); if (candidate.size <= profile.bytes) { left = q; quality = q; blob = candidate; } else right = q; }
          break;
        }
        blob = low;
        width = Math.max(1, Math.floor(width * .8)); height = Math.max(1, Math.floor(height * .8));
      }
      if (!blob || blob.size > profile.bytes) throw Error('无法压缩到可保存大小，请换一张图片或截取需要的部分。');
      const result = { blob, dataUrl: await dataURL(blob), name: String(file.name || '旅行照片.jpg').slice(0, 180), originalBytes: file.size, bytes: blob.size, width: canvas.width, height: canvas.height, originalWidth: source.width, originalHeight: source.height, quality };
      result.summary = (blob.size < file.size ? '已压缩 ' : '已处理 ') + size(file.size) + ' → ' + size(blob.size);
      progress(result.summary);
      return result;
    } finally { source?.release(); if (canvas) { canvas.width = 1; canvas.height = 1; } }
  }
  const api = { profiles, size, fit, header, compress(file, options = {}) { const task = queue.then(() => prepare(file, options)); queue = task.catch(() => {}); return task; } };
  global.TravelImages = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window === 'object' ? window : globalThis);
