import crypto from 'crypto';

// Retrieve the encryption key from environment variables.
// Use a fallback for development/build steps if needed, but warn in console.
const getMasterKey = (): Buffer => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    console.warn('WARNING: ENCRYPTION_KEY environment variable is not set! Using default development key.');
  }
  const keySource = key || 'default-development-fallback-key-must-be-32-bytes';
  // Use SHA-256 to hash the key source, guaranteeing a 32-byte key for aes-256-cbc.
  return crypto.createHash('sha256').update(keySource).digest();
};

/**
 * Encrypts a plain text string using AES-256-CBC.
 * Returns the initialization vector and ciphertext concatenated with a colon (iv:ciphertext).
 */
export function encrypt(text: string): string {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', getMasterKey(), iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Failed to encrypt credentials.');
  }
}

/**
 * Decrypts a formatted cipher string (iv:ciphertext) using AES-256-CBC.
 * Returns the original plain text.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';
  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format. Expected iv:ciphertext');
    }
    
    const [ivHex, encryptedHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getMasterKey(), iv);
    
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Decryption failed:', error);
    // Return empty string or handle gracefully so it doesn't crash the loop
    return '';
  }
}
