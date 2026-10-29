export function assertNoControl(value, label) {
  const text = String(value ?? '')
  if (/[\r\n\0]/.test(text)) {
    const error = new Error(`${label} نویسه کنترلی دارد.`)
    error.status = 400
    throw error
  }
  return text
}

export function assertSectionId(value, label) {
  const text = assertNoControl(value, label).trim()
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(text)) {
    const error = new Error(`${label} فقط می‌تواند حروف انگلیسی، عدد، نقطه، خط تیره و زیرخط باشد.`)
    error.status = 400
    throw error
  }
  return text
}

export function assertExtensionNumber(value, label = 'شماره') {
  const text = assertNoControl(value, label).trim()
  if (!/^[0-9*#]{1,16}$/.test(text)) {
    const error = new Error(`${label} نامعتبر است.`)
    error.status = 400
    throw error
  }
  return text
}

export function assertDialToken(value, label) {
  const text = assertNoControl(value, label).trim()
  if (!/^[0-9+*#A-Za-z_.-]{1,64}$/.test(text)) {
    const error = new Error(`${label} نامعتبر است.`)
    error.status = 400
    throw error
  }
  return text
}

export function assertChannel(value) {
  const text = assertNoControl(value, 'کانال').trim()
  if (!/^[A-Za-z0-9_./-]{1,160}$/.test(text)) {
    const error = new Error('شناسه کانال نامعتبر است.')
    error.status = 400
    throw error
  }
  return text
}

export function normalizeMac(value) {
  const hex = String(value ?? '').replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (!/^[0-9A-F]{12}$/.test(hex)) {
    const error = new Error('مک‌آدرس گوشی سیسکو باید ۱۲ رقم هگز باشد.')
    error.status = 400
    throw error
  }
  return hex
}

export function assertHost(value, label = 'میزبان') {
  const text = assertNoControl(value, label).trim()
  if (!/^[A-Za-z0-9.:_-]{1,253}$/.test(text)) {
    const error = new Error(`${label} نامعتبر است.`)
    error.status = 400
    throw error
  }
  return text
}

export function assertDialPattern(value, label = 'الگو') {
  const text = assertNoControl(value, label).trim()
  if (!/^_?[0-9A-Za-zXZN.*#\[\]!+-]{1,64}$/.test(text)) {
    const error = new Error(`${label} نامعتبر است.`)
    error.status = 400
    throw error
  }
  return text
}

export function confText(value) {
  return String(value ?? '').replace(/[\r\n\0]/g, ' ')
}

export function confIdent(value) {
  return String(value ?? '').replace(/[^\w.-]/g, '')
}

export function confDial(value) {
  return String(value ?? '').replace(/[^\w.*#\[\]!+-]/g, '')
}

export function confPath(value) {
  const text = String(value ?? '').replace(/[\r\n\0]/g, '').replace(/[^A-Za-z0-9_./-]/g, '')
  if (!text || text.includes('..') || text.startsWith('/')) return ''
  return text
}

export function encodeAmi(fields) {
  const lines = []
  for (const [key, value] of Object.entries(fields)) {
    const safeKey = String(key).replace(/[^\w]/g, '')
    const safeValue = String(value ?? '').replace(/[\r\n\0]/g, '')
    if (!safeKey) continue
    lines.push(`${safeKey}: ${safeValue}`)
  }
  return `${lines.join('\r\n')}\r\n\r\n`
}
