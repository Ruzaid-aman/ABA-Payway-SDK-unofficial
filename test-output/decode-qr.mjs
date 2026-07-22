import fs from 'fs';
import { createCanvas, loadImage } from 'canvas';
import qrcode from 'qrcode-reader';

const img = fs.readFileSync('test-output/online-qr.png');
const canvas = createCanvas(300, 300);
const ctx = canvas.getContext('2d');
const image = await loadImage(img);
ctx.drawImage(image, 0, 0);

const qr = new qrcode();
qr.callback = (err, value) => {
  if (err) console.error('Error:', err);
  else console.log('Decoded:', value.result);
};
qr.decode(canvas);