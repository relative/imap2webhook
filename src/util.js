const crypto = require('crypto')

function getMailboxes() {
  const mailboxes = [],
    size = parseInt(process.env.MAILBOXES || '0', 10)
  for (let i = 0; i < size; ++i) {
    const mailboxPrefix = 'MAILBOX_' + i
    const mailbox = {
      path: process.env[mailboxPrefix + '_PATH'],
      tag: process.env[mailboxPrefix + '_TAG'],
      color: parseInt(process.env[mailboxPrefix + '_COLOR'] || '0x9580ff'),
      webhook: {
        id: process.env[mailboxPrefix + '_WEBHOOK_ID'],
        token: process.env[mailboxPrefix + '_WEBHOOK_TOKEN'],
      },
    }
    if (!mailbox.path) throw new Error(`Missing ${mailboxPrefix}_PATH`)
    if (!mailbox.tag) throw new Error(`Missing ${mailboxPrefix}_TAG`)
    if (!mailbox.color || isNaN(mailbox.color))
      throw new Error(`Missing or invalid ${mailboxPrefix}_COLOR`)
    if (!mailbox.webhook.id)
      throw new Error(`Missing ${mailboxPrefix}_WEBHOOK_ID`)
    if (!mailbox.webhook.token)
      throw new Error(`Missing ${mailboxPrefix}_WEBHOOK_TOKEN`)
    mailboxes.push(mailbox)
  }
  return mailboxes
}

/**
 * Creates author object with name and Gravatar iconUrl
 * @param {string} name
 * @param {string} email
 * @returns {object} Discord embed author object
 */
function createAuthor(name, email) {
  const hash = crypto
    .createHash('md5')
    .update(email.trim().toLowerCase())
    .digest('hex')
  return {
    name,
    icon_url: `https://gravatar.com/avatar/${hash}.jpg`,
  }
}

function createEmbed(mailbox, msg, mp) {
  const from = mp.from ? mp.from.text : '*no `From` line*',
    fromAddress = mp.from
      ? mp.from.value[0].address || 'invalid@invalid'
      : 'invalid@invalid'
  to = mp.to ? mp.to.text : '*no `To` line*'

  return {
    title: `(${mailbox.tag}) Email received`,
    description: '',
    color: mailbox.color,
    fields: [
      {
        name: 'From',
        value: from,
      },
      {
        name: 'To',
        value: to,
      },
      {
        name: 'Subject',
        value: mp.subject || '*no `Subject` line*',
      },
      {
        name: 'Content',
        value: mp.text || '*no plain-text content*',
      },
    ],
    author: createAuthor(from, fromAddress),
    footer: {
      text: msg.emailId,
    },
    timestamp: mp.date ? mp.date.toISOString() : undefined,
  }
}

module.exports = {
  getMailboxes,

  createAuthor,
  createEmbed,
}
