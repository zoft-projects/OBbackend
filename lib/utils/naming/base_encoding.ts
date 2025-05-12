import crypto from 'crypto';

const encodeToBase64 = (str: string): string => {
  return Buffer.from(str).toString('base64');
};

const decodeBase64 = (encodedStr: string): string => {
  return Buffer.from(encodedStr, 'base64').toString('utf8');
};

const encryptText = (text: string, key: string): string => {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key.slice(0, 32), iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}${encrypted}`;
  } catch (cryptErr) {
    return '';
  }
};

const decryptText = (text: string, key: string): string => {
  try {
    const iv = Buffer.from(text.slice(0, 32), 'hex');
    const encrypted = text.slice(32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key.slice(0, 32), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (cryptErr) {
    return '';
  }
};

export { encodeToBase64, decodeBase64, encryptText, decryptText };
