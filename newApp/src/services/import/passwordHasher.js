// services/passwordHasher.js
// Hashage bcrypt pour les mots de passe client PrestaShop

import bcrypt from 'bcryptjs'

const DEFAULT_COST = 10

const normalizeForBcrypt = (hash) => {
  if (!hash) {
    return ''
  }
  const text = String(hash).trim()
  if (text.startsWith('$2y$')) {
    return `$2a$${text.slice(4)}`
  }
  return text
}

const normalizeForPrestashop = (hash) => {
  if (!hash) {
    return ''
  }
  const text = String(hash)
  if (text.startsWith('$2a$') || text.startsWith('$2b$')) {
    return `$2y$${text.slice(4)}`
  }
  return text
}

/**
 * Hash bcrypt compatible PrestaShop
 */
export async function hashPasswordBcrypt(password, cost = DEFAULT_COST) {
  if (!password) {
    return ''
  }
  const hash = await bcrypt.hash(String(password), cost)
  return normalizeForPrestashop(hash)
}

// Compatibility: old import name now uses bcrypt too.
export async function hashPasswordSHA256(password) {
  return hashPasswordBcrypt(password)
}

/**
 * Verifie un mot de passe
 */
export async function verifyPassword(password, hash) {
  if (!password || !hash) {
    return false
  }
  const normalized = normalizeForBcrypt(hash)
  return bcrypt.compareSync(String(password), normalized)
}